import { buildBook } from "../story";
import type { Book, Draft, Illustration, StyleId } from "../types";
import { SAMPLE_PAGE, coverJobKey, pageJobKey, sampleKey, sheetJobKey } from "./keys";
import type { PublicJob } from "./service";

/**
 * Lectura en cliente del estado de los jobs (GET /api/generate/status) frente al borrador actual: qué hoja, qué
 * muestra y qué páginas corresponden a los rasgos, estilo e historia de ahora (por huella).
 */

export interface CurrentKeys {
  sheet: string;
  sample: string;
  pages: Record<number, string>;
  cover: string;
}

export function currentKeys(draft: Draft, styleId: StyleId, book: Book = buildBook(draft)): CurrentKeys {
  const pages: Record<number, string> = {};
  for (const p of book.pages) pages[p.n] = pageJobKey(draft, styleId, p);
  return { sheet: sheetJobKey(draft, styleId), sample: sampleKey(draft, styleId, book), pages, cover: coverJobKey(draft, styleId) };
}

/** ¿Es un job de la huella actual? (los obsoletos no se ejecutan ni se enseñan). */
export function isCurrentJob(j: PublicJob, keys: CurrentKeys): boolean {
  if (j.kind === "sheet") return j.key === keys.sheet;
  if (j.kind === "sample") return j.key === keys.sample;
  if (j.kind === "cover") return j.key === keys.cover;
  return j.page !== null && j.key === keys.pages[j.page];
}

export function sheetVersions(jobs: PublicJob[] | null, keys: CurrentKeys): PublicJob[] {
  return (jobs ?? []).filter((j) => j.kind === "sheet" && j.key === keys.sheet).sort((a, b) => a.variant - b.variant);
}

export function sampleJob(jobs: PublicJob[] | null, keys: CurrentKeys): PublicJob | undefined {
  return (jobs ?? []).find((j) => j.kind === "sample" && j.key === keys.sample);
}

/** Versiones de una página para el cuento actual (la 9 incluye la de la muestra como versión 1). */
export function pageVersions(jobs: PublicJob[] | null, keys: CurrentKeys, n: number): PublicJob[] {
  return (jobs ?? [])
    .filter((j) => j.page === n && j.key === keys.pages[n] && (j.kind === "page" || (j.kind === "sample" && n === SAMPLE_PAGE)))
    .sort((a, b) => a.variant - b.variant);
}

export function coverJob(jobs: PublicJob[] | null, keys: CurrentKeys): PublicJob | undefined {
  return (jobs ?? []).find((j) => j.kind === "cover" && j.key === keys.cover);
}

/** Versión elegida de una página (índice en `versions`): la que guarda el borrador si existe y está pintada; si no, la primera. */
export function chosenPageVersion(ill: Illustration, n: number, versions: PublicJob[]): PublicJob | undefined {
  const idx = ill.pages[n]?.variant ?? 0;
  const pick = versions[idx];
  return pick?.status === "done" ? pick : versions.find((v) => v.status === "done") ?? versions[0];
}

/** Hoja elegida: la guardada en el borrador si sigue siendo de la huella actual; si no, la primera. */
export function chosenSheet(ill: Illustration, versions: PublicJob[]): PublicJob | undefined {
  return versions.find((v) => v.id === ill.sheetJobId && v.status === "done") ?? versions.find((v) => v.status === "done") ?? versions[0];
}
