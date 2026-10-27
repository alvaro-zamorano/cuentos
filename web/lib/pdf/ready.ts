import type { Page } from "puppeteer-core";
import { PDF_FONT_FAMILIES } from "./fonts";

/**
 * Antes de `page.pdf` (auditoría 26 oct, I8): las dos letras cargadas y todas las imágenes terminadas y sin ninguna rota.
 * Si falta algo, lanza: mejor un PDF que falla (y se reintenta) que un libro impreso con una doble página en blanco o con
 * otra letra. Antes se seguía igual.
 */
export async function readyToPrint(page: Page, timeoutMs: number): Promise<void> {
  const missingFonts = await page.evaluate(async (families: string[]) => {
    await Promise.all(families.flatMap((f) => [document.fonts.load(`400 16px "${f}"`), document.fonts.load(`600 16px "${f}"`)]));
    await document.fonts.ready;
    const loaded = new Set(Array.from(document.fonts).filter((ff) => ff.status === "loaded").map((ff) => ff.family.replace(/["']/g, "")));
    return families.filter((f) => !loaded.has(f));
  }, [...PDF_FONT_FAMILIES]);
  if (missingFonts.length) throw new Error(`pdf: letra sin cargar (${missingFonts.join(", ")})`);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), { timeout: Math.max(5_000, timeoutMs) });
  const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.naturalWidth === 0).length);
  if (broken > 0) throw new Error(`pdf: ${broken} ${broken === 1 ? "imagen sin cargar" : "imágenes sin cargar"}`);
}
