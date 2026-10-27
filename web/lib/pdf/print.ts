import "server-only";
import { PDFDocument, type PDFPage } from "pdf-lib";
import type { Page } from "puppeteer-core";
import { withBrowser } from "./render";
import { readyToPrint } from "./ready";
import { printCoverHtml, printInteriorHtml, type PrintBookInput } from "./printHtml";
import type { CoverGeometry, PrintSize } from "../print/gelato";

/**
 * PDF de imprenta del libro de tapa dura (B8), en un solo archivo como lo pide Gelato para los fotolibros:
 *   1 el pliego de la cubierta · 2 en blanco (guarda delantera) · 3–32 las 30 páginas interiores · 33 en blanco (guarda trasera)
 * La cubierta y el interior se imprimen por separado con Chromium (tienen tamaños distintos) y se juntan con pdf-lib.
 */
const MM = 72 / 25.4;

async function htmlToPdf(page: Page, html: string, widthMm: number, heightMm: number, deadline: number): Promise<Uint8Array> {
  const left = () => Math.max(5_000, deadline - Date.now());
  await page.setContent(html, { waitUntil: "load", timeout: left() });
  await readyToPrint(page, left());
  return page.pdf({ width: `${widthMm}mm`, height: `${heightMm}mm`, printBackground: true, preferCSSPageSize: true, timeout: left() });
}

/** `timeoutMs` desde que le toca el turno; el turno se espera como mucho `maxWaitMs` (la ruta tiene 300 s). */
export function renderPrintPdf(input: PrintBookInput, size: PrintSize, cover: CoverGeometry, timeoutMs = 150_000, maxWaitMs = 90_000): Promise<{ pdf: Uint8Array; pages: number }> {
  const interior = printInteriorHtml(input, size);
  const coverHtml = printCoverHtml(input, cover);
  // de uno en uno por instancia, como el PDF que se descarga; el plazo empieza al tocarle el turno (lib/pdf/queue.ts)
  return withBrowser(async (browser, t0) => {
    const deadline = t0 + timeoutMs;
    const page = await browser.newPage();
    const coverPdf = await htmlToPdf(page, coverHtml.html, coverHtml.widthMm, coverHtml.heightMm, deadline);
    const innerPdf = await htmlToPdf(page, interior.html, interior.widthMm, interior.heightMm, deadline);
    const doc = await PDFDocument.create();
    doc.setTitle(input.plan.title);
    doc.setProducer("Érase su vez");
    // Chromium redondea el tamaño a píxeles (± 0,1 mm): se fija el exacto que pide la imprenta
    const exact = (p: PDFPage, wMm: number, hMm: number) => {
      p.setSize(wMm * MM, hMm * MM);
      return p;
    };
    const [c] = await doc.copyPages(await PDFDocument.load(coverPdf), [0]);
    doc.addPage(exact(c, coverHtml.widthMm, coverHtml.heightMm));
    const inner = await PDFDocument.load(innerPdf);
    const blank = (): void => void doc.addPage([interior.widthMm * MM, interior.heightMm * MM]);
    blank();
    const innerPages = await doc.copyPages(inner, inner.getPageIndices());
    if (innerPages.length !== interior.pages) throw new Error(`interior: ${innerPages.length} páginas en vez de ${interior.pages}`);
    for (const p of innerPages) doc.addPage(exact(p, interior.widthMm, interior.heightMm));
    blank();
    const pdf = await doc.save();
    console.log(`[print] ${doc.getPageCount()} páginas, ${pdf.length} bytes en ${Date.now() - t0} ms (cubierta ${cover.source})`);
    return { pdf, pages: doc.getPageCount() };
  }, { maxWaitMs });
}
