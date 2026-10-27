import "server-only";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Browser } from "puppeteer-core";
import { DRAFT_STORAGE_KEY } from "../draftKey";
import type { Draft, Edition } from "../types";
import { oneAtATime } from "./queue";

/**
 * PDF en servidor: abre /libro en un Chromium sin cabeza con el borrador sembrado en localStorage (la página lee de ahí),
 * fotografía cada hoja (JPEG a ~290 ppp) y las monta en un PDF A4 apaisado de 13 páginas con pdf-lib.
 * Se fotografía en vez de usar page.pdf porque los filtros SVG del acabado pintado hacen que Chrome rasterice cada capa
 * por separado a 300 ppp: 80 bitmaps y 86 MB por libro. Con una foto por hoja el libro pesa unos pocos MB.
 *
 * Chromium: en Vercel, @sparticuz/chromium-min descarga el paquete de `CHROMIUM_PACK_URL` en el primer arranque;
 * en local, `CHROME_PATH` o el Chromium de Playwright.
 */
const PACK_URL = process.env.CHROMIUM_PACK_URL ?? "https://github.com/Sparticuz/chromium/releases/download/v140.0.0/chromium-v140.0.0-pack.x64.tar";
const LOCAL_CANDIDATES = [
  process.env.CHROME_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => !!p);

/**
 * La descarga y extracción del paquete, una vez por instancia: con dos arranques en frío a la vez, el segundo daba el
 * binario por listo sin haberlo escrito entero (auditoría 26 oct, I10).
 */
let packPath: Promise<string> | null = null;

export async function launch(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const t = Date.now();
    const chromium = (await import("@sparticuz/chromium-min")).default;
    chromium.setGraphicsMode = false; // sin WebGL: menos memoria y arranque más rápido
    packPath ??= chromium.executablePath(PACK_URL).catch((e: unknown) => {
      packPath = null;
      throw e;
    });
    const executablePath = await packPath;
    console.log(`[pdf] chromium listo en ${Date.now() - t}ms`);
    // el paquete de Sparticuz es el «headless shell»: puppeteer tiene que lanzarlo como tal (no --headless=new)
    const browser = await puppeteer.launch({ args: chromium.args, executablePath, headless: "shell", timeout: 20_000 });
    console.log(`[pdf] navegador arrancado en ${Date.now() - t}ms`);
    return browser;
  }
  const local = LOCAL_CANDIDATES.find((p) => fs.existsSync(p));
  if (!local) throw new Error("no_chromium");
  return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] });
}

/**
 * Abre un Chromium, hace `fn` con él y lo cierra, de uno en uno por instancia (lib/pdf/queue.ts). `fn` recibe cuándo le
 * tocó el turno (antes de arrancar Chromium): su plazo cuenta desde ahí. `maxWaitMs`: lo que espera el turno como mucho.
 */
export function withBrowser<T>(fn: (browser: Browser, startedAt: number) => Promise<T>, opts: { maxWaitMs?: number } = {}): Promise<T> {
  return oneAtATime(async () => {
    const startedAt = Date.now();
    const browser = await launch();
    try {
      return await fn(browser, startedAt);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }, opts);
}

export interface RenderPdfOptions {
  draft: Draft;
  edition: Edition;
  /** Origen público de esta misma app (p. ej. https://…vercel.app), para abrir /libro. */
  origin: string;
  /** Tope total en ms (por defecto 45 s; la función tiene 60). */
  timeoutMs?: number;
}

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

export function renderBookPdf(opts: RenderPdfOptions): Promise<Uint8Array> {
  return oneAtATime(() => renderBookPdfNow(opts));
}

async function renderBookPdfNow({ draft, edition, origin, timeoutMs = 45_000 }: RenderPdfOptions): Promise<Uint8Array> {
  const started = Date.now();
  const left = () => Math.max(1_000, timeoutMs - (Date.now() - started));
  const t0 = Date.now();
  const marks: string[] = [];
  const mark = (what: string) => {
    marks.push(`${what} ${Date.now() - t0}ms`);
    console.log(`[pdf] ${what} ${Date.now() - t0}ms`);
  };
  const browser = await launch();
  mark("launch");
  try {
    const page = await browser.newPage();
    // la barra de Vercel de las previews mantiene conexiones abiertas: se desactiva por cookie y no se espera a «red inactiva»
    try {
      const u = new URL(origin);
      await page.setCookie({ name: "__vercel_toolbar", value: "0", domain: u.hostname, path: "/" });
    } catch {
      /* origen sin cookie posible */
    }
    // ancho suficiente para que la hoja (297 mm ≈ 1123 px) no se reduzca; ×2 ≈ 190 ppp, ×3 ≈ 290 ppp (PDF_SCALE)
    const scale = Math.min(3, Math.max(1, Number(process.env.PDF_SCALE) || 2));
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: scale });
    const key = DRAFT_STORAGE_KEY;
    const json = JSON.stringify(draft);
    await page.evaluateOnNewDocument(
      (k: string, v: string) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* sin almacenamiento: la página dirá que no hay cuento */
        }
      },
      key,
      json,
    );
    const url = `${origin}/libro?edition=${edition === "illustrated" ? "illustrated" : "classic"}&pdf=1`;
    await page.goto(url, { waitUntil: "load", timeout: Math.min(left(), 20_000) });
    mark("load");
    // 13 hojas presentes (portada + 12) y tipografías cargadas
    await page.waitForFunction(() => document.querySelectorAll("section.sheet").length >= 13, { timeout: Math.min(left(), 15_000) });
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    mark("sheets");
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll("img")).every((i) => i.complete), { timeout: Math.min(left(), 8_000) })
      .catch(() => undefined);
    // margen para el recolor en cliente de las figuras pintadas
    await new Promise((r) => setTimeout(r, 1_200));
    const sheets = await page.$$("section.sheet");
    const doc = await PDFDocument.create();
    doc.setTitle(`El cumpleaños de ${draft.hero.name.trim()}`);
    doc.setProducer("Érase su vez");
    for (const sheet of sheets.slice(0, 13)) {
      const jpg = await sheet.screenshot({ type: "jpeg", quality: 86 });
      const img = await doc.embedJpg(jpg);
      const pg = doc.addPage(A4_LANDSCAPE);
      pg.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE[0], height: A4_LANDSCAPE[1] });
    }
    mark("shots");
    const out = await doc.save();
    console.log(`[pdf] ${edition} ${out.length} bytes · ${marks.join(" · ")}`);
    return out;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
