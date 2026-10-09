import { cumpleanos } from "./arcs/cumpleanos";
import { COMPANIONS, PET_KINDS, SPECIALS, describeCompanionEn, describeTraitsEn, normalizeTraits } from "./traits";
import type { AgeBand, Arc, Book, Draft } from "./types";

const ARCS: Record<string, Arc> = { cumpleanos };

export function ageBand(age: number): AgeBand {
  return age <= 4 ? "2-4" : "5-8";
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function companionPhrase(draft: Draft): string {
  if (!draft.companion) return "mamá";
  const c = COMPANIONS.find((x) => x.id === draft.companion!.kind)!;
  const name = draft.companion.name?.trim();
  return name ? `${c.article} ${name}` : c.article;
}

export function fill(template: string, draft: Draft): string {
  const comp = companionPhrase(draft);
  const special = SPECIALS.find((s) => s.id === draft.special) ?? SPECIALS[0];
  return template
    .replaceAll("{nombre}", draft.hero.name.trim() || "Lucas")
    .replaceAll("{edad}", String(draft.hero.age))
    .replaceAll("{Comp}", capitalize(comp))
    .replaceAll("{comp}", comp)
    .replaceAll("{Detalle}", capitalize(special.phrase))
    .replaceAll("{detalle}", special.phrase)
    .replaceAll("{regalo}", special.gift);
}

export function isPet(draft: Draft): boolean {
  return !!draft.companion && PET_KINDS.includes(draft.companion.kind);
}

/** Prompt de escena en inglés: escena del arco + rasgos redeclarados (RF-10). El texto nunca va en la imagen (RF-15). */
export function scenePromptFor(base: string, draft: Draft, withCompanion: boolean): string {
  const hero = `Main child (${draft.hero.age} years old): ${describeTraitsEn(draft.hero.traits)}.`;
  const comp = withCompanion && draft.companion ? ` Companion: ${describeCompanionEn(draft.companion)}.` : "";
  return `${base}. ${hero}${comp} No text, letters or numbers in the image.`;
}

export function buildBook(draft: Draft): Book {
  const arc = ARCS[draft.occasionId] ?? cumpleanos;
  const band = ageBand(draft.hero.age);
  const pet = isPet(draft);
  return {
    title: fill(arc.title, draft),
    dedication: `Para ${draft.hero.name.trim() || "Lucas"}, que hoy cumple ${draft.hero.age}. Este cuento no existía hasta hoy.`,
    pages: arc.pages.map((p) => ({
      n: p.n,
      scene: p.scene,
      expression: p.expression,
      withCompanion: p.withCompanion && !!draft.companion,
      text: draft.textOverrides[p.n] ?? fill((pet && p.textPet ? p.textPet : p.text)[band], draft),
      scenePrompt: scenePromptFor(p.scenePrompt, draft, p.withCompanion && !!draft.companion),
    })),
  };
}

export const DEFAULT_DRAFT: Draft = {
  hero: { name: "", age: 5, traits: normalizeTraits(undefined) },
  occasionId: "cumpleanos",
  companion: undefined,
  special: "dinosaurios",
  edition: "classic",
  textOverrides: {},
  updatedAt: 0,
};

const KEY = "cuentos:draft:v1";

/** Rellena campos ausentes (borradores antiguos o recuperados del servidor). */
export function normalizeDraft(parsed: Partial<Draft>): Draft {
  const companion = parsed.companion && COMPANIONS.some((c) => c.id === parsed.companion!.kind) ? parsed.companion : undefined;
  return {
    ...DEFAULT_DRAFT,
    ...parsed,
    hero: { ...DEFAULT_DRAFT.hero, ...(parsed.hero ?? {}), traits: normalizeTraits(parsed.hero?.traits) },
    companion: companion ? { ...companion, traits: companion.traits ? normalizeTraits(companion.traits) : undefined } : undefined,
    textOverrides: parsed.textOverrides ?? {},
  };
}

export function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as Partial<Draft>);
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* almacenamiento no disponible: el journey sigue en memoria */
  }
}
