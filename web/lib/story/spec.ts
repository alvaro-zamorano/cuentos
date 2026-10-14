/**
 * Motor de historia (brief 5) — esqueleto de beats, reglas y prompt.
 * Sin dependencias de servidor: lo usan la ruta /api/story, el mock y los tests.
 */
import { cumpleanos } from "../arcs/cumpleanos";
import { COMPANIONS, PET_KINDS, SPECIALS } from "../traits";
import type { AgeBand, CompanionKind, Draft, Expression, SceneId, SpecialId } from "../types";
import { filledDetails, storyInputHash } from "./hash";

export interface StoryInput {
  name: string;
  age: number;
  band: AgeBand;
  companion: null | {
    kind: CompanionKind;
    /** Nombre propio, si el adulto lo dio. */
    name?: string;
    /** Cómo se nombra en el texto: «su perro Toby», «la abuela», «mamá» si no hay acompañante. */
    phrase: string;
    isPet: boolean;
  };
  special: { id: SpecialId; phrase: string; gift: string };
  /** Detalles reales tal como los escribió el adulto (limpios de emojis y espacios). */
  details: string[];
  seed: number;
  inputHash: string;
}

export interface Beat {
  n: number;
  /** Escena sugerida; la primera es la de por defecto. Son SceneId existentes (el Clásico las pinta). */
  scenes: SceneId[];
  expression: Expression;
  withCompanion: boolean;
  /** Qué tiene que pasar, en una frase. */
  goal: string;
  /** Escena en castellano para el mock (placeholders {nombre} {comp} {detalle} {regalo} {edad}). */
  brief: string;
  /** Beat donde pueden entrar los detalles reales (3–11). */
  details: boolean;
  /** Beat del deseo o del regalo: aquí aparece el detalle especial. */
  special?: "deseo" | "regalo";
}

export const BEATS: Beat[] = [
  { n: 1, scenes: ["cama-manana"], expression: "sueno", withCompanion: false, details: false, goal: "Se despierta y recuerda que hoy cumple {edad} años.", brief: "{nombre} se despierta en su cama con la luz de la mañana." },
  { n: 2, scenes: ["ventana"], expression: "curioso", withCompanion: false, details: false, goal: "Se asoma a la ventana; el día entero parece de fiesta.", brief: "{nombre} mira por la ventana una mañana de sol." },
  { n: 3, scenes: ["desayuno"], expression: "sorpresa", withCompanion: false, details: true, goal: "En el desayuno le espera una sorpresa pequeña (un globo en su silla).", brief: "Desayuno con un globo atado a la silla de {nombre}." },
  { n: 4, scenes: ["puerta-regalo"], expression: "feliz", withCompanion: true, details: true, goal: "Llega el acompañante (o mamá, si no hay) con un paquete enorme que es «para después».", brief: "{comp} llega a la puerta con un paquete enorme." },
  { n: 5, scenes: ["salon-globos"], expression: "risa", withCompanion: true, details: true, goal: "Decoran la casa con globos y guirnaldas; hay risas.", brief: "El salón se llena de globos y guirnaldas." },
  { n: 6, scenes: ["nube-deseo"], expression: "curioso", withCompanion: false, details: false, special: "deseo", goal: "Un momento de calma: piensa en su deseo, que tiene que ver con lo que más le gusta ({detalle}).", brief: "{nombre} piensa en su deseo en el sillón; en una nube aparece {detalle}." },
  { n: 7, scenes: ["parque", "jardin-juego"], expression: "feliz", withCompanion: true, details: true, goal: "Salen a jugar fuera; carreras y juegos.", brief: "Tarde de juegos al aire libre." },
  { n: 8, scenes: ["jardin-juego", "parque"], expression: "sorpresa", withCompanion: true, details: true, goal: "Búsqueda del tesoro con pistas; la última lleva a la mesa.", brief: "Búsqueda del tesoro con pistas entre las flores." },
  { n: 9, scenes: ["mesa-tarta"], expression: "sorpresa", withCompanion: true, details: true, goal: "Aparece la tarta con {edad} velas; todos cantan.", brief: "La tarta con {edad} velas encendidas y todos alrededor." },
  { n: 10, scenes: ["velas"], expression: "orgullo", withCompanion: false, details: true, goal: "Pide el deseo en secreto y sopla las velas.", brief: "{nombre} sopla las velas con los ojos cerrados." },
  { n: 11, scenes: ["abrir-regalo"], expression: "risa", withCompanion: true, details: false, special: "regalo", goal: "Abre el paquete del principio: es {regalo}, justo lo que deseaba.", brief: "{nombre} abre el paquete: dentro hay {regalo}." },
  { n: 12, scenes: ["cama-noche"], expression: "sueno", withCompanion: false, details: false, goal: "Por la noche se duerme feliz.", brief: "{nombre} duerme por la noche; por la ventana brilla una estrella." },
];

/** Beats donde el mock y el LLM reparten los detalles reales (nunca el 1 ni el 12). */
export const DETAIL_BEATS = BEATS.filter((b) => b.details).map((b) => b.n);

export const SCENES: SceneId[] = cumpleanos.pages.map((p) => p.scene);
export const EXPRESSIONS: Expression[] = ["feliz", "risa", "sorpresa", "curioso", "sueno", "orgullo"];
/** Escena base en inglés de cada SceneId (del arco), para construir el scenePrompt. */
export const SCENE_EN: Record<SceneId, string> = Object.fromEntries(cumpleanos.pages.map((p) => [p.scene, p.scenePrompt])) as Record<SceneId, string>;

/** Base en inglés del scenePrompt de una página generada: escena del arco + momento descrito por el motor. */
export function sceneBaseFor(scene: SceneId, sceneBrief: string): string {
  return `${SCENE_EN[scene]}. Story moment (described in Spanish): ${sceneBrief.trim().replace(/[.\s]+$/u, "")}`;
}

export const LENGTH_RULES: Record<AgeBand, { minWords: number; maxWords: number; maxSentenceWords: number | null }> = {
  "2-4": { minWords: 12, maxWords: 28, maxSentenceWords: 9 },
  "5-8": { minWords: 35, maxWords: 65, maxSentenceWords: null },
};
export const TITLE_MAX_WORDS = 6;
export const DEDICATION_MAX_WORDS = 25;

/** Lista negra de contenido (raíces, sin tildes). Un detalle que la contenga no se usa. */
export const BLACKLIST_STEMS = ["miedo", "asust", "aterr", "terror", "pesadill", "muert", "muere", "murio", "morir", "matar", "enferm", "hospital", "fiebre", "castig", "sangr", "herid", "triste", "llor", "monstru", "odia", "odio"];
export const BLACKLIST_WORDS = ["tonto", "tonta", "idiota", "feo", "fea"];
/** Diminutivos empalagosos (palabra completa, sin tildes). */
export const DIMINUTIVES = [
  "peque", "peques", "pequenin", "pequenina", "pequenito", "pequenita", "chiquitin", "chiquitina", "chiquitito", "chiquitita", "carinito",
  "bebito", "bebita", "tesorito", "corazoncito", "piecitos", "manitas", "cosita", "cositas", "gordito", "gordita", "besito", "besitos",
  "abracito", "solecito", "cielito", "mamita", "papito", "angelito", "munequito", "munequita", "bracitos", "naricita", "boquita", "barriguita", "tripita",
];
/** Marcas frecuentes en cuentos infantiles. Solo se aceptan si el adulto las escribió en sus detalles. */
export const BRANDS = [
  "lego", "playmobil", "disney", "pixar", "marvel", "barbie", "nintendo", "playstation", "peppa", "patrulla canina", "paw patrol", "bluey",
  "mcdonald", "coca-cola", "cocacola", "nutella", "kinder", "netflix", "youtube", "tiktok", "ikea", "amazon", "pokemon", "minecraft", "fortnite", "hot wheels",
];

export const CONTENT_RULES = [
  "Tono feliz y cálido de principio a fin.",
  "Nada de miedo, muerte, enfermedad, castigos, tristeza ni peligro.",
  "Sin comparaciones con otros niños (nadie es mejor ni peor que nadie).",
  "Sin marcas comerciales salvo que aparezcan en los detalles del adulto.",
  "Sin emojis. Sin diminutivos empalagosos (nada de «peque», «cosita», «manitas», «tesorito»).",
  "Nombres propios: solo el del niño, el del acompañante y los que aparezcan en los detalles. Nadie más tiene nombre.",
  "Si el acompañante es una mascota, no habla: se expresa con gestos y sonidos de animal.",
  "Lo que más le gusta (el detalle especial) aparece en el beat del deseo (6) y en el del regalo (11).",
  "Castellano de España, natural, para leer en voz alta. Sin adjetivos que fijen el género del niño si no se deduce del contexto.",
];

const NUM_WORDS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
export function ageWord(age: number): string {
  return NUM_WORDS[age] ?? String(age);
}

export function ageBandOf(age: number): AgeBand {
  return age <= 4 ? "2-4" : "5-8";
}

/** Entrada del motor a partir del borrador (también limpia lo que venga del cliente). */
export function storyInputFromDraft(draft: Draft): StoryInput {
  const name = draft.hero.name.trim().slice(0, 20) || "Lucas";
  const age = Math.min(8, Math.max(2, Math.round(Number(draft.hero.age) || 5)));
  const special = SPECIALS.find((s) => s.id === draft.special) ?? SPECIALS[0];
  let companion: StoryInput["companion"] = null;
  if (draft.companion) {
    const c = COMPANIONS.find((x) => x.id === draft.companion!.kind);
    if (c) {
      const cname = draft.companion.name?.trim().slice(0, 20) || undefined;
      companion = { kind: c.id, name: cname, phrase: cname ? `${c.article} ${cname}` : c.article, isPet: PET_KINDS.includes(c.id) };
    }
  }
  return {
    name,
    age,
    band: ageBandOf(age),
    companion,
    special: { id: special.id, phrase: special.phrase, gift: special.gift },
    details: filledDetails(draft.details),
    seed: draft.storySeed ?? 0,
    inputHash: storyInputHash(draft),
  };
}

export function companionPhraseOf(input: StoryInput): string {
  return input.companion?.phrase ?? "mamá";
}

/** Rellena los placeholders de un beat. */
export function fillBeat(t: string, input: StoryInput): string {
  const comp = companionPhraseOf(input);
  return t
    .replaceAll("{nombre}", input.name)
    .replaceAll("{edad}", String(input.age))
    .replaceAll("{Comp}", comp.charAt(0).toUpperCase() + comp.slice(1))
    .replaceAll("{comp}", comp)
    .replaceAll("{detalle}", input.special.phrase)
    .replaceAll("{regalo}", input.special.gift);
}

/** Prompt para el proveedor real: system con reglas y formato; user con los datos, los detalles tal cual y el esqueleto. */
export function promptFor(input: StoryInput, issues?: string[]): { system: string; user: string } {
  const len = LENGTH_RULES[input.band];
  const lengthRule =
    input.band === "2-4"
      ? `Cada página: entre ${len.minWords} y ${len.maxWords} palabras, frases de ${len.maxSentenceWords} palabras como máximo (cuentan también las partes separadas por dos puntos o punto y coma).`
      : `Cada página: entre ${len.minWords} y ${len.maxWords} palabras.`;

  const system = [
    "Escribes álbumes ilustrados personalizados en castellano de España para leer en voz alta a niños de 2 a 8 años.",
    "Escribes un cuento de cumpleaños de 12 páginas sobre un esqueleto fijo de beats, con detalles reales del niño que da un adulto.",
    "",
    "Reglas:",
    ...CONTENT_RULES.map((r) => `- ${r}`),
    `- ${lengthRule}`,
    `- Título: ${TITLE_MAX_WORDS} palabras como máximo. Dedicatoria: ${DEDICATION_MAX_WORDS} palabras como máximo, dirigida al niño.`,
    "- Los detalles reales se reparten entre las páginas 3 y 11 (ninguno en la 1 ni en la 12). Úsalos todos si son 3 o menos; si son más, al menos 3. Intégralos en la acción, con palabras reconocibles del original, sin citarlos como una lista.",
    "- Si un detalle no encaja con un tono feliz, no lo uses.",
    "",
    "Formato: responde solo con un objeto JSON válido, sin markdown, sin bloque de código y sin texto antes ni después:",
    '{"title": string, "dedication": string, "pages": [{"n": 1..12, "scene": string, "expression": string, "withCompanion": boolean, "text": string, "sceneBrief": string}]}',
    "`scene` es una de las escenas indicadas para su página; `expression` es una de: " + EXPRESSIONS.join(", ") + ".",
    "`sceneBrief` describe en castellano, en una frase, lo que se ve en la ilustración de esa página (sin texto dentro de la imagen).",
  ].join("\n");

  const comp = input.companion
    ? `${input.companion.phrase}${input.companion.isPet ? " (mascota: no habla)" : ""}`
    : "ninguno (los adultos de la casa son «mamá» y «papá», sin nombre)";

  const beats = BEATS.map((b) => {
    const tags = [
      `escena: ${b.scenes.join(" o ")}`,
      `expresión: ${b.expression}`,
      `acompañante en la imagen: ${b.withCompanion && input.companion ? "sí" : "no"}`,
      b.details ? "puede llevar un detalle real" : null,
      b.special ? `detalle especial (${b.special})` : null,
    ].filter(Boolean);
    return `${b.n}. ${fillBeat(b.goal, input)} [${tags.join("; ")}]`;
  }).join("\n");

  const details = input.details.length ? input.details.map((d, i) => `${i + 1}. «${d}»`).join("\n") : "(el adulto no ha escrito detalles)";

  const user = [
    "Datos del niño:",
    `- Nombre: ${input.name}`,
    `- Cumple: ${input.age} años (franja ${input.band})`,
    `- Acompañante: ${comp}`,
    `- Lo que más le gusta (detalle especial): ${input.special.phrase}. Regalo sugerido: ${input.special.gift}.`,
    "",
    "Detalles reales, tal como los escribió el adulto:",
    details,
    "",
    "Esqueleto (una página por beat, en este orden):",
    beats,
    "",
    `Versión ${input.seed + 1}: ${input.seed > 0 ? "busca un enfoque distinto al habitual en cómo entran los detalles." : "escribe la versión principal."}`,
    issues?.length ? `\nTu respuesta anterior no pasó la validación. Corrige esto:\n${issues.map((i) => `- ${i}`).join("\n")}` : "",
    "",
    "Devuelve solo el JSON.",
  ].join("\n");

  return { system, user };
}
