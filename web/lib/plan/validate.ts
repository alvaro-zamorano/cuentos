/**
 * Validación del plan (PLAN §3.1). Primero se normaliza lo que devuelve el modelo (tipos, ids, recortes) y después se
 * comprueban las reglas. Los motivos van en castellano porque se devuelven al modelo para que corrija.
 *
 * Gravedad: `hard` obliga a reintentar y, si persiste, no se enseña; `soft` (longitudes, detalles) se acepta en el
 * segundo intento y se registra.
 */
import { blockedWord, contactOrDomain } from "./moderation";
import { COMMON_PROPER, DEDICATION_MAX_WORDS, DIMINUTIVE_SET, MAX_CAST, MAX_IN_IMAGE, MAX_OBJECTS, MAX_PLACES, MIN_HERO_PAGES, PAGES, TITLE_MAX_WORDS, countingIn, lengthRule, namedIp, textInImage } from "./rules";
import { countWords, disallowedNames, keywords, norm, sentences, stem, tokens } from "../story/validate";
import type { BookObject, CastId, CastMember, Ficha, Place, Plan, PlanPage, Shot, TimeOfDay, Tone } from "./types";

export interface Issue {
  msg: string;
  hard: boolean;
  /**
   * El mismo problema dicho para el padre, cuando lo puede causar él al escribir (texto, título, dedicatoria). Los `msg`
   * van al modelo y no se enseñan (auditoría 26 oct, B6).
   */
  parent?: string;
}

export interface PlanValidation {
  ok: boolean;
  /** Sin problemas graves (se puede enseñar aunque haya avisos). */
  usable: boolean;
  issues: Issue[];
}

// también banderas (letras regionales) y números en tecla («3️⃣»): Lora y Figtree no los tienen (revisión 26 oct)
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const TONES: Tone[] = ["aventura", "tierno", "divertido", "dormir"];
const SHOTS: Shot[] = ["general", "medio", "cerca"];
const TIMES: TimeOfDay[] = ["dia", "atardecer", "noche"];

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function normCast(v: unknown, taken: Set<string>): CastMember[] {
  const out: CastMember[] = [];
  for (const raw of arr(v)) {
    const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = c.id === "c1" || c.id === "c2" ? c.id : null;
    if (!id || taken.has(id)) continue;
    taken.add(id);
    const kind = c.kind === "mascota" || c.kind === "criatura" ? c.kind : "persona";
    out.push({ id, kind, name: str(c.name, 40), relation: str(c.relation, 60), look: str(c.look, 240) });
  }
  return out;
}

function normList<T extends Place | BookObject>(v: unknown, prefix: string, max: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const raw of arr(v)) {
    const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = str(x.id, 8);
    if (!new RegExp(`^${prefix}\\d$`).test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(x.name, 80), desc: str(x.desc, 300) } as T);
  }
  return out.slice(0, max + 2); // el exceso lo señala el validador
}

/** Convierte la respuesta del modelo en un Plan con tipos correctos (sin juzgar todavía las reglas). */
export function normalizePlan(raw: unknown, f: Ficha): Plan {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const taken = new Set<string>(f.cast.map((c) => c.id));
  const extraCast = normCast(o.extraCast, taken);
  const castIds = new Set<string>(["hero", ...f.cast.map((c) => c.id), ...extraCast.map((c) => c.id)]);
  const pages: PlanPage[] = arr(o.pages).map((raw, i) => {
    const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const n = Number.isInteger(p.n) ? (p.n as number) : i + 1;
    const who = [...new Set(arr(p.who).map((w) => str(w, 8)).filter((w) => castIds.has(w)))] as CastId[];
    const outfit = str(p.outfit, 160);
    return {
      n,
      text: str(p.text, 1500),
      scene: str(p.scene, 600),
      who,
      extras: arr(p.extras).map((e) => str(e, 160)).filter(Boolean),
      place: typeof p.place === "string" && p.place.trim() ? str(p.place, 8) : null,
      objects: [...new Set(arr(p.objects).map((x) => str(x, 8)).filter(Boolean))],
      outfit: outfit && !/^(null|ninguno|ninguna|habitual|-)$/i.test(outfit) ? outfit : null,
      shot: SHOTS.includes(p.shot as Shot) ? (p.shot as Shot) : "medio",
      time: TIMES.includes(p.time as TimeOfDay) ? (p.time as TimeOfDay) : "dia",
    };
  });
  return {
    title: str(o.title, 120),
    dedication: f.dedication ? f.dedication : str(o.dedication, 400),
    tone: TONES.includes(o.tone as Tone) ? (o.tone as Tone) : f.tone ?? "aventura",
    extraCast,
    places: normList<Place>(o.places, "p", MAX_PLACES),
    objects: normList<BookObject>(o.objects, "o", MAX_OBJECTS),
    pages: pages.sort((a, b) => a.n - b.n),
    cover: str(o.cover, 600),
    notices: arr(o.notices).map((x) => str(x, 240)).filter(Boolean).slice(0, 5),
  };
}

/** Nombres que pueden salir en el texto: protagonista, reparto, lo escrito por el adulto y lo que el plan nombra. */
export function allowedNamesFor(f: Ficha, plan: Pick<Plan, "extraCast" | "places" | "objects" | "title">): Set<string> {
  const set = new Set<string>(COMMON_PROPER.flatMap((w) => w.split(" ")));
  const add = (s: string, onlyCapitalized: boolean) => {
    for (const t of tokens(s)) if (!onlyCapitalized || t.charAt(0) !== t.charAt(0).toLowerCase()) set.add(norm(t));
  };
  add(f.hero.name, false);
  for (const c of [...f.cast, ...plan.extraCast]) add(c.name, false);
  for (const s of [f.idea, f.from ?? "", f.dedication ?? "", ...f.details]) add(s, true);
  for (const x of [...plan.places, ...plan.objects]) add(x.name, true);
  return set;
}

/** La palabra tal como la escribió (mayúsculas incluidas), si se encuentra; si no, como llega. */
function asWritten(text: string, word: string): string {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  return i >= 0 ? text.slice(i, i + word.length) : word;
}

/** `where`: dónde está, dicho para el padre («la página 3», «el título»), si es texto que él puede escribir. */
function commonChecks(label: string, text: string, issues: Issue[], where?: string) {
  if (EMOJI_RE.test(text)) issues.push({ msg: `${label}: contiene emojis.`, hard: true, parent: where && `Quita el emoji de ${where}: no se puede imprimir.` });
  const bad = blockedWord(text);
  if (bad) issues.push({ msg: `${label}: palabra no apta para un cuento infantil («${bad}»).`, hard: true, parent: where && `Eso no lo podemos poner en un cuento infantil («${asWritten(text, bad)}», en ${where}).` });
  const ip = namedIp(text);
  if (ip)
    issues.push({
      msg: `${label}: nombra una marca o un personaje con derechos («${ip}»); sustitúyelo por uno inventado y avisa en notices.`,
      hard: true,
      parent: where && `«${asWritten(text, ip)}» es una marca o un personaje con derechos y no lo podemos poner en el libro. Cámbialo en ${where} por algo inventado.`,
    });
  for (const w of tokens(norm(text))) if (DIMINUTIVE_SET.has(w)) issues.push({ msg: `${label}: diminutivo «${w}».`, hard: false });
}

export function validatePage(p: PlanPage, f: Ficha, plan: Plan): Issue[] {
  const issues: Issue[] = [];
  const label = `Página ${p.n}`;
  const len = lengthRule(f.hero.age);
  const names = [f.hero.name, ...f.cast.map((c) => c.name), ...plan.extraCast.map((c) => c.name)].filter(Boolean);
  const where = `la página ${p.n}`;
  if (!p.text) issues.push({ msg: `${label}: falta el texto.`, hard: true, parent: `Falta el texto de ${where}.` });
  else {
    const words = countWords(p.text, names);
    if (words < len.hardMin || words > len.hardMax) issues.push({ msg: `${label}: ${words} palabras; tienen que ser entre ${len.min} y ${len.max}.`, hard: false });
    if (len.maxSentence) {
      const long = sentences(p.text).find((s) => countWords(s, names) > len.maxSentence! + 2);
      if (long) issues.push({ msg: `${label}: frase de más de ${len.maxSentence} palabras («${long.slice(0, 60)}»).`, hard: false });
    }
    commonChecks(label, p.text, issues, where);
    const wrong = disallowedNames(p.text, allowedNamesFor(f, plan));
    if (wrong.length) issues.push({ msg: `${label}: nombres propios que no están en la ficha (${[...new Set(wrong)].join(", ")}); usa descripciones sin nombre.`, hard: false });
  }
  if (!p.scene) issues.push({ msg: `${label}: falta la escena.`, hard: true });
  else {
    commonChecks(`${label} (escena)`, p.scene, issues);
    const count = countingIn(p.scene);
    if (count) issues.push({ msg: `${label}: la escena obliga a contar («${count}»); escribe «unas», «varios», sin número.`, hard: true });
    const letters = textInImage(p.scene);
    if (letters) issues.push({ msg: `${label}: la escena pide letras dentro de la imagen («${letters}»); descríbela sin texto escrito.`, hard: true });
  }
  for (const e of p.extras) commonChecks(`${label} (extras)`, e, issues);
  if (p.who.length + p.extras.length > MAX_IN_IMAGE) issues.push({ msg: `${label}: ${p.who.length + p.extras.length} personajes en la imagen; como máximo ${MAX_IN_IMAGE}.`, hard: true });
  if (p.place && !plan.places.some((x) => x.id === p.place)) issues.push({ msg: `${label}: el lugar «${p.place}» no está en places.`, hard: true });
  const badObj = p.objects.filter((o) => !plan.objects.some((x) => x.id === o));
  if (badObj.length) issues.push({ msg: `${label}: objetos que no están en objects (${badObj.join(", ")}).`, hard: true });
  if (p.outfit) commonChecks(`${label} (ropa)`, p.outfit, issues);
  return issues;
}

/** Detalle presente si alguna de sus palabras significativas aparece (con tolerancia de plural y género). */
export function detailPresent(detail: string, haystack: string): boolean {
  const ks = keywords(detail);
  return ks.length === 0 || ks.some((k) => haystack.includes(stem(k)));
}

/**
 * Familiares que el planificador no puede inventar (18 oct, libro de Olivia: añadió «la abuela»). No sabemos cómo es la
 * familia de cada niño: solo valen los que el adulto nombra en el reparto, la idea, los detalles, la dedicatoria o quien
 * lo regala. Se compara por parentesco (abuela y abuelo cuentan como lo mismo).
 */
const FAMILY: [RegExp, string][] = [
  [/(?<![\p{L}])(abuel[oa]s?|abuelit[oa]s?|yay[oa]s?)(?![\p{L}])/giu, "abuelos"],
  [/(?<![\p{L}])(mam[aá]s?|mami|madres?)(?![\p{L}])/giu, "madre"],
  [/(?<![\p{L}])(pap[aá]s?|papi|padres?)(?![\p{L}])/giu, "padre"],
  [/(?<![\p{L}])(herman[oa]s?|hermanit[oa]s?)(?![\p{L}])/giu, "hermanos"],
  [/(?<![\p{L}])(t[ií][oa]s?)(?![\p{L}])/giu, "tíos"],
  [/(?<![\p{L}])(prim[oa]s?|primit[oa]s?)(?![\p{L}])/giu, "primos"],
];

export function familyIn(text: string): Set<string> {
  const out = new Set<string>();
  // Papá Noel es de tradición, no de la familia
  const t = text.replace(/pap[aá]\s+noel/giu, "");
  for (const [re, kin] of FAMILY) if (t.match(re)) out.add(kin);
  return out;
}

/** Las palabras de familia de un texto, una por parentesco («abuela», «mamá»), para decírselas al padre. */
export function familyMentions(text: string): { kin: string; word: string }[] {
  const t = text.replace(/pap[aá]\s+noel/giu, "");
  const out: { kin: string; word: string }[] = [];
  for (const [re, kin] of FAMILY) {
    const m = t.match(re);
    if (m) out.push({ kin, word: m[0].toLowerCase() });
  }
  return out;
}

/** Parentescos que pone el adulto en la ficha: idea, detalles, quién lo regala, dedicatoria y reparto. */
export function familyGiven(f: Ficha): Set<string> {
  return familyIn([f.idea, ...f.details, f.from ?? "", f.dedication ?? "", ...f.cast.map((c) => `${c.name} ${c.relation}`)].join(" \n "));
}

/**
 * Parentescos que salen en el plan (reparto inventado, extras o texto) sin que el adulto los haya puesto. `given`: más
 * texto que cuenta como del adulto (lo que ha escrito o pedido en el paso 3; auditoría 26 oct, B6).
 */
export function inventedFamily(plan: Pick<Plan, "extraCast" | "pages">, f: Ficha, given: string[] = [], { scenes = true }: { scenes?: boolean } = {}): string[] {
  const fromAdult = new Set([...familyGiven(f), ...familyIn(given.join(" \n "))]);
  // la escena también va al dibujo (revisión 26 oct): «su madre la arropa» en la escena pintaba a una madre inventada
  const used = familyIn(
    [...plan.extraCast.map((c) => `${c.name} ${c.relation}`), ...plan.pages.flatMap((p) => [p.text, ...p.extras, ...(scenes ? [p.scene] : [])])].join(" \n "),
  );
  return [...used].filter((k) => !fromAdult.has(k));
}

/**
 * Lo que el padre escribe en el cuento (título, dedicatoria y texto de las páginas): cuenta como suyo (B6).
 */
function parentText(plan: Pick<Plan, "title" | "dedication" | "pages">): string[] {
  return [plan.title, plan.dedication, ...plan.pages.map((p) => p.text)];
}

/**
 * Quita de los extras de cada página (lo que se dibuja de fondo, que el padre no ve ni puede tocar) los familiares que ya
 * no están en ningún sitio del padre: tras «que salga la abuela», el modelo la pone en el texto y en los extras; si el
 * padre borra después la frase, la abuela se quedaba en los extras y el libro no se podía dibujar ni guardar (revisión
 * 26 oct).
 */
export function dropOrphanFamilyExtras<P extends Pick<Plan, "title" | "dedication" | "pages">>(plan: P, f: Ficha): P {
  const fromAdult = new Set([...familyGiven(f), ...familyIn(parentText(plan).join(" \n "))]);
  const orphan = (e: string) => [...familyIn(e)].some((k) => !fromAdult.has(k));
  if (!plan.pages.some((p) => p.extras.some(orphan))) return plan;
  return { ...plan, pages: plan.pages.map((p) => ({ ...p, extras: p.extras.filter((e) => !orphan(e)) })) };
}

/**
 * `fromParent` (auditoría 26 oct, B6): el plan llega del navegador (paso 4, guardado automático) y sus textos pueden ser
 * del padre: lo escrito a mano y lo pedido con «Cambiar esta página». Lo del modelo ya pasó esta validación al
 * escribirse, así que los familiares del texto, del título y de la dedicatoria cuentan como suyos («Mamá le dio un
 * beso»). Lo que el padre no escribe (reparto inventado, extras de cada página) sigue sin poder inventar familia.
 */
export function validatePlan(plan: Plan, f: Ficha, { fromParent = false }: { fromParent?: boolean } = {}): PlanValidation {
  const issues: Issue[] = [];
  if (!plan.title) issues.push({ msg: "Falta el título.", hard: true, parent: "Falta el título." });
  else {
    if (countWords(plan.title, [f.hero.name]) > TITLE_MAX_WORDS) issues.push({ msg: `El título tiene más de ${TITLE_MAX_WORDS} palabras.`, hard: false });
    commonChecks("Título", plan.title, issues, "el título");
    // el título va en el asunto de los emails: ni enlaces ni datos de contacto (menores de la auditoría 26 oct)
    const contact = contactOrDomain(plan.title);
    if (contact) issues.push({ msg: `Título: lleva un dato de contacto (${contact}).`, hard: true, parent: "El título no puede llevar un email, un enlace ni un teléfono." });
  }
  if (!plan.dedication) issues.push({ msg: "Falta la dedicatoria.", hard: true, parent: "Falta la dedicatoria." });
  else if (!f.dedication) {
    if (countWords(plan.dedication, [f.hero.name]) > DEDICATION_MAX_WORDS) issues.push({ msg: `La dedicatoria tiene más de ${DEDICATION_MAX_WORDS} palabras.`, hard: false });
    commonChecks("Dedicatoria", plan.dedication, issues, "la dedicatoria");
  }
  if (f.cast.length + plan.extraCast.length > MAX_CAST) issues.push({ msg: `El reparto tiene más de ${MAX_CAST} recurrentes.`, hard: true });
  // con el plan del padre, las escenas no se miran: las escribió el modelo y ya pasaron esta validación al escribirse
  const kin = inventedFamily(plan, f, fromParent ? parentText(plan) : [], { scenes: !fromParent });
  if (kin.length) issues.push({ msg: `Aparecen familiares que el adulto no ha puesto (${kin.join(", ")}): quítalos del texto, de extraCast y de extras; si hace falta un adulto, que sea alguien sin parentesco ni nombre en una sola página.`, hard: true });
  for (const c of plan.extraCast) {
    if (!c.look) issues.push({ msg: `extraCast ${c.id}: falta el aspecto.`, hard: true });
    commonChecks(`extraCast ${c.id}`, `${c.name} ${c.look}`, issues);
  }
  if (plan.places.length > MAX_PLACES) issues.push({ msg: `Hay más de ${MAX_PLACES} lugares recurrentes.`, hard: true });
  if (plan.objects.length > MAX_OBJECTS) issues.push({ msg: `Hay más de ${MAX_OBJECTS} objetos recurrentes.`, hard: true });
  for (const x of [...plan.places, ...plan.objects]) {
    commonChecks(x.id, `${x.name}. ${x.desc}`, issues);
    const letters = textInImage(x.desc);
    if (letters) issues.push({ msg: `${x.id}: la descripción pide letras en la imagen («${letters}»).`, hard: true });
  }

  const ns = plan.pages.map((p) => p.n);
  const expected = Array.from({ length: PAGES }, (_, i) => i + 1);
  if (plan.pages.length !== PAGES || ns.join(",") !== expected.join(",")) {
    issues.push({ msg: `Tiene que haber ${PAGES} páginas numeradas del 1 al ${PAGES}; hay ${plan.pages.length} (${ns.join(", ")}).`, hard: true });
  }
  for (const p of plan.pages) issues.push(...validatePage(p, f, plan));
  const heroPages = plan.pages.filter((p) => p.who.includes("hero")).length;
  if (plan.pages.length === PAGES && heroPages < MIN_HERO_PAGES) issues.push({ msg: `El protagonista sale en ${heroPages} imágenes; tiene que salir en al menos ${MIN_HERO_PAGES} (campo who).`, hard: true });
  for (const c of plan.extraCast) {
    if (!plan.pages.some((p) => p.who.includes(c.id))) issues.push({ msg: `extraCast ${c.id} no sale en ninguna página: quítalo o úsalo.`, hard: false });
  }

  if (!plan.cover) issues.push({ msg: "Falta la escena de la portada (cover).", hard: true });
  else {
    commonChecks("Portada", plan.cover, issues);
    const letters = textInImage(plan.cover);
    if (letters) issues.push({ msg: `Portada: pide letras en la imagen («${letters}»).`, hard: true });
  }

  const haystack = norm(plan.pages.map((p) => `${p.text} ${p.scene}`).join(" \n "));
  const usable = f.details.filter((d) => keywords(d).length > 0 && !blockedWord(d));
  const required = Math.min(3, usable.length);
  const present = usable.filter((d) => detailPresent(d, haystack)).length;
  if (present < required) issues.push({ msg: `Aparecen ${present} de los detalles reales; tienen que aparecer al menos ${required} con palabras reconocibles.`, hard: false });

  return { ok: issues.length === 0, usable: !issues.some((i) => i.hard), issues };
}
