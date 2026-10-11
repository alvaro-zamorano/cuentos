import "server-only";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Browser } from "puppeteer-core";
import { DRAFT_STORAGE_KEY } from "../draftKey";
import type { Draft, Edition } from "../types";

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

async function launch(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(PACK_URL),
      headless: true,
    });
  }
  const local = LOCAL_CANDIDATES.find((p) => fs.existsSync(p));
  if (!local) throw new Error("no_chromium");
  return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] });
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

export async function renderBookPdf({ draft, edition, origin, timeoutMs = 45_000 }: RenderPdfOptions): Promise<Uint8Array> {
  const started = Date.now();
  const left = () => Math.max(1_000, timeoutMs - (Date.now() - started));
  const browser = await launch();
  try {
    const page = await browser.newPage();
    // ancho suficiente para que la hoja (297 mm ≈ 1123 px) no se reduzca; ×3 ≈ 290 ppp en A4
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 3 });
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
    await page.goto(url, { waitUntil: "networkidle0", timeout: left() });
    // 13 hojas presentes (portada + 12) y tipografías cargadas
    await page.waitForFunction(() => document.querySelectorAll("section.sheet").length >= 13, { timeout: left() });
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll("img")).every((i) => i.complete), { timeout: Math.min(left(), 8_000) })
      .catch(() => undefined);
    // margen para el recolor en cliente de las figuras pintadas
    await new Promise((r) => setTimeout(r, 1_200));
    const sheets = await page.$$("section.sheet");
    const doc = await PDFDocument.create();
    doc.setTitle(`El cumpleaños de ${draft.hero.name.trim()}`);
    doc.setProducer("cuentos");
    for (const sheet of sheets.slice(0, 13)) {
      const jpg = await sheet.screenshot({ type: "jpeg", quality: 86 });
      const img = await doc.embedJpg(jpg);
      const pg = doc.addPage(A4_LANDSCAPE);
      pg.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE[0], height: A4_LANDSCAPE[1] });
    }
    return doc.save();
  } finally {
    await browser.close().catch(() => undefined);
  }
}
