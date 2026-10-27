import "server-only";
import { launch } from "./render";
import { readyToPrint } from "./ready";
import { PDF_PAGE, pdfBookHtml, type PrintBookInput } from "./printHtml";

/**
 * PDF que se descarga (D5 bis, 18 oct): A4 apaisado con la misma maqueta que el libro impreso (lib/pdf/printHtml.ts):
 * portada a sangre y, en cada escena, la ilustración a página completa a la izquierda y el texto a la derecha.
 * Sin filtros SVG, así que basta con page.pdf(): las ilustraciones van como JPEG y el texto queda seleccionable.
 *
 * - "full": portada, personajes, dedicatoria, 12 dobles, «Fin» y la página de la marca.
 * - "free" (D3): lo mismo sin las 12 ilustraciones (PDF casero gratis).
 */
export interface Book2PdfInput extends PrintBookInput {
  kind: "full" | "free";
}

export function book2Html(input: Book2PdfInput): string {
  return pdfBookHtml(input, input.kind).html;
}

export async function renderBook2Pdf(input: Book2PdfInput, timeoutMs = 90_000): Promise<Uint8Array> {
  const t0 = Date.now();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(book2Html(input), { waitUntil: "load", timeout: timeoutMs });
    // las letras y las ilustraciones (URLs firmadas) tienen que estar antes de imprimir; si falta algo, falla (I8)
    await readyToPrint(page, timeoutMs - (Date.now() - t0));
    const pdf = await page.pdf({ width: `${PDF_PAGE.widthMm}mm`, height: `${PDF_PAGE.heightMm}mm`, printBackground: true, preferCSSPageSize: true, timeout: Math.max(5_000, timeoutMs - (Date.now() - t0)) });
    console.log(`[pdf2] ${input.kind} ${pdf.length} bytes en ${Date.now() - t0} ms`);
    return pdf;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
