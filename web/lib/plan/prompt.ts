/**
 * Prompts del planificador (PLAN §3.1). El planificador escribe en castellano todo lo que ve el padre: texto de las
 * 12 páginas y «qué se verá». La traducción para el modelo de imagen va aparte (lib/plan/art.ts).
 */
import { describeLookEs } from "./ficha";
import {
  DEDICATION_MAX_WORDS,
  MAX_CAST,
  MAX_IN_IMAGE,
  MAX_OBJECTS,
  MAX_PLACES,
  MIN_HERO_PAGES,
  PAGES,
  TITLE_MAX_WORDS,
  lengthRule,
} from "./rules";
import { STARTERS } from "./starters";
import type { Ficha, Plan, PlanPage } from "./types";

const TONE_TEXT: Record<string, string> = {
  aventura: "aventura: un reto, un viaje o un descubrimiento; ritmo ágil",
  tierno: "tierno: cálido y cercano, emociones pequeñas y reconocibles",
  divertido: "divertido: situaciones cómicas, sorpresas y algo de disparate",
  dormir: "para dormir: ritmo que se va calmando página a página; termina en calma y en la cama",
};

const SCHEMA = `{
  "title": string,
  "dedication": string,
  "tone": "aventura" | "tierno" | "divertido" | "dormir",
  "extraCast": [{ "id": "c1" | "c2", "kind": "persona" | "mascota" | "criatura", "name": string, "relation": string, "look": string }],
  "places": [{ "id": "p1", "name": string, "desc": string }],
  "objects": [{ "id": "o1", "name": string, "desc": string }],
  "pages": [{
    "n": 1,
    "text": string,
    "scene": string,
    "who": ["hero", "c1"],
    "extras": [string],
    "place": "p1" | null,
    "objects": ["o1"],
    "outfit": string | null,
    "shot": "general" | "medio" | "cerca",
    "time": "dia" | "atardecer" | "noche"
  }],
  "cover": string,
  "notices": [string]
}`;

export function plannerSystem(): string {
  return [
    "Eres autor de álbumes ilustrados infantiles personalizados. Escribes en castellano de España, para leer en voz alta a niños de 1 a 10 años.",
    "Un adulto (madre, padre, familiar) te cuenta la idea del cuento y quién lo protagoniza. Tú escribes el libro: 12 páginas, cada una con su texto y con lo que se verá en su ilustración.",
    "",
    "Cómo escribir:",
    "- Respeta la idea del adulto: es su cuento. Si no hay idea, inventa una historia original que encaje con el protagonista, su reparto y sus detalles.",
    "- Arco claro en 12 páginas: la página 1 presenta al protagonista y la situación; en el medio hay un reto o un deseo y el protagonista actúa y decide; el final cierra con calidez. Sin moraleja explícita.",
    "- Cada página es UN momento que se puede dibujar en una sola imagen. Varía lugares y planos.",
    "- Ritmo para leer en voz alta: frases que suenan bien, algún diálogo, alguna repetición que los niños esperan. Humor cuando encaje.",
    "- Los detalles reales del adulto se integran en la acción con palabras reconocibles del original (al menos 3 si hay 3 o más; todos si hay menos), sin listarlos.",
    "- Registro natural y adulto: sin diminutivos empalagosos («peque», «cosita», «manitas», «tesorito»), sin emojis.",
    "",
    "Contenido:",
    "- Siempre apto para niños: nada de violencia, armas, miedo que no se resuelva enseguida, enfermedad, muerte, castigos ni burlas. Las emociones (nervios, echar de menos) se tratan con cariño y se resuelven.",
    "- Sin marcas comerciales, sin personajes con derechos (Disney, Marvel, Pokémon, Peppa Pig, Bluey, Patrulla Canina, Spiderman, Elsa…) y sin personas famosas reales. Si el adulto los pide, sustitúyelos por un equivalente inventado y con otro aspecto, y añade un aviso en `notices` explicándolo en una frase. Los personajes de tradición sí valen (Reyes Magos, Papá Noel, Ratoncito Pérez, Caperucita).",
    "- Nombres propios: solo el del protagonista, los del reparto y los que aparezcan en la idea, los detalles o la dedicatoria. Los demás personajes no tienen nombre («una señora con un paraguas», «el panadero»).",
    "- Las mascotas no hablan (se expresan con gestos y sonidos) salvo que la idea sea de fantasía y lo pida.",
    "- Concordancia: usa el género indicado para el protagonista. Si es «sin indicar», evita adjetivos y participios con género referidos al protagonista (escribe «tenía mucho sueño», no «estaba cansado»; «se le cortó la respiración», no «se quedó helado»).",
    "- Título en minúscula salvo la primera palabra y los nombres propios, como manda el castellano («Inés y el misterio de los calcetines»).",
    "- Si la idea no es apta para un cuento infantil y no se puede adaptar, responde solo {\"refusal\": \"motivo en una frase\"}.",
    "",
    "Reparto e ilustración (lo que se verá):",
    `- \`who\`: quién de la ficha sale en la imagen: "hero" y los ids del reparto. El protagonista sale en al menos ${MIN_HERO_PAGES} páginas.`,
    `- Como máximo ${MAX_IN_IMAGE} personajes por imagen contando \`who\` y \`extras\`.`,
    `- \`extras\`: personajes que salen en una sola página, descritos en una frase corta. Si alguien sale en más de una página, es recurrente: añádelo a \`extraCast\` si quedan huecos (el reparto total es de ${MAX_CAST}) con un aspecto concreto, y úsalo por su id; si no quedan, repite exactamente la misma descripción en cada página donde salga.`,
    "- Familia: no inventes familiares (madre, padre, abuelos, hermanos, tíos, primos) que el adulto no haya puesto en el reparto, la idea, los detalles o quien lo regala: no sabemos cómo es la familia de este niño. Ni en el texto, ni en `extraCast`, ni en `extras`. Si la historia necesita un adulto, que sea alguien sin parentesco ni nombre (el panadero, una vecina) y solo en una página.",
    "- Texto e imagen cuentan lo mismo: si el texto de una página dice que alguien del reparto está o hace algo en ese momento, va en `who`; y quien va en `who` tiene que estar justificado por el texto o la escena.",
    "- Lo que el protagonista recibe durante la historia (una capa, una corona) no lo lleva antes: hasta esa página, `outfit` y `objects` no lo incluyen.",
    `- \`places\`: hasta ${MAX_PLACES} lugares que se repiten, con una descripción fija (colores, rasgos). \`place\` es su id o null si el lugar sale una sola vez.`,
    `- \`objects\`: hasta ${MAX_OBJECTS} objetos importantes que se repiten (el cohete de cartón, la mochila), con descripción fija de colores y rasgos.`,
    "- `scene`: una o dos frases en castellano con lo que se ve: quién, dónde, qué hace, gesto y objetos clave. Solo lo que se ve: nunca digas quién no aparece. Coherente con `place`. Sin números que haya que contar (escribe «unas velas», no «cinco velas»), sin letras ni carteles dentro de la imagen. Cada personaje entero y a la vista: nada de asomarse tras un mueble ni estar escondido debajo o dentro de algo (escribe «está de pie junto al sofá», no «se asoma tras el sofá»). Tapado con la manta en la cama, sí.",
    "- `outfit`: la ropa de esa página si no es la habitual (pijama para dormir, traje de astronauta); si no cambia, null.",
    "- `shot`: general (se ve el lugar), medio (cuerpo entero o medio cuerpo) o cerca (cara y manos). Varíalos.",
    "- `time`: dia, atardecer o noche, coherente con la historia.",
    "- `cover`: la escena de la portada en una o dos frases: el protagonista (y su reparto principal) en el lugar o el momento más evocador del cuento. Sin título ni letras.",
    "",
    "Formato: responde solo con un objeto JSON válido, sin markdown y sin texto antes ni después, con esta forma:",
    SCHEMA,
  ].join("\n");
}

function castLine(c: Ficha["cast"][number]): string {
  const kind = c.kind === "mascota" ? "mascota" : c.kind === "criatura" ? "criatura" : "persona";
  return `- ${c.id}: ${c.name || "(sin nombre)"} — ${c.relation || kind} (${kind})${c.look ? `. Aspecto: ${c.look}` : ""}`;
}

export function plannerUser(f: Ficha): string {
  const len = lengthRule(f.hero.age);
  const gender = f.hero.gender === "nina" ? "niña" : f.hero.gender === "nino" ? "niño" : "sin indicar";
  const starter = f.starter ? STARTERS.find((s) => s.id === f.starter) : undefined;
  const look = describeLookEs(f.hero.look);
  const free = MAX_CAST - f.cast.length;
  return [
    "IDEA DEL ADULTO:",
    f.idea ? `«${f.idea}»` : "(sin idea: «Sorpréndeme». Inventa una historia original para este niño.)",
    starter ? `(Partió de la idea de arranque «${starter.label}».)` : "",
    `Tono: ${f.tone ? TONE_TEXT[f.tone] : "elígelo tú según la idea"}.`,
    "",
    "PROTAGONISTA (id hero):",
    `- Nombre: ${f.hero.name || "(sin nombre: llámalo por un nombre corto y común en España)"}`,
    `- Edad: ${f.hero.age} años. Género para la concordancia: ${gender}.`,
    look ? `- Aspecto: ${look}.` : "",
    f.hero.outfit ? `- Ropa habitual: ${f.hero.outfit}.` : "",
    "",
    "REPARTO RECURRENTE:",
    f.cast.length ? f.cast.map(castLine).join("\n") : "(ninguno)",
    free > 0 ? `Quedan ${free} hueco(s) en el reparto para recurrentes inventados (\`extraCast\`, ids ${f.cast.length === 0 ? "c1, c2" : "c2"}).` : "No quedan huecos: `extraCast` vacío.",
    "",
    "DETALLES REALES (lo que solo sabe el adulto):",
    f.details.length ? f.details.map((d, i) => `${i + 1}. «${d}»`).join("\n") : "(ninguno)",
    "",
    f.from ? `Lo regala: ${f.from}.` : "",
    f.dedication
      ? `Dedicatoria del adulto (cópiala tal cual en \`dedication\`): «${f.dedication}»`
      : `Dedicatoria: escríbela tú, dirigida al protagonista${f.from ? ` y de parte de quien lo regala` : ""}, ${DEDICATION_MAX_WORDS} palabras como máximo.`,
    "",
    "LONGITUD:",
    `- Texto de cada página: entre ${len.min} y ${len.max} palabras; ${len.label}${len.maxSentence ? `; frases de ${len.maxSentence} palabras como máximo` : ""}.`,
    `- Título: ${TITLE_MAX_WORDS} palabras como máximo; mejor si lleva el nombre del protagonista.`,
    `- ${PAGES} páginas exactas, numeradas del 1 al ${PAGES}.`,
    "",
    f.seed > 0 ? `Versión ${f.seed + 1}: busca un enfoque claramente distinto (otro conflicto, otros lugares) manteniendo la idea.` : "",
    "Devuelve solo el JSON.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Mensaje de corrección cuando la respuesta no pasa la validación (conversación de dos turnos). */
export function fixMessage(issues: string[]): string {
  return [
    "Tu respuesta no cumple estas reglas:",
    ...issues.slice(0, 20).map((i) => `- ${i}`),
    "",
    "Corrígelas cambiando lo mínimo y devuelve el JSON completo otra vez, solo el JSON.",
  ].join("\n");
}

/* ------------------------------ cambiar una página ------------------------------ */

export function rewriteSystem(): string {
  return [
    "Eres autor de álbumes ilustrados infantiles personalizados en castellano de España. Ya escribiste un libro de 12 páginas.",
    "El adulto pide un cambio en UNA página. Reescribe solo esa página siguiendo su petición, manteniendo la coherencia con las páginas de antes y de después, el tono, los nombres y las reglas del libro.",
    "Reglas: apto para niños; sin marcas, personajes con derechos ni famosos reales; nombres propios solo los que ya existen en el libro o los que el adulto escriba en su petición; sin números que contar ni letras en la escena; como máximo 3 personajes en la imagen.",
    "Si la petición no es apta para un cuento infantil, responde solo {\"refusal\": \"motivo en una frase\"}.",
    'Formato: solo el objeto JSON de la página, con la misma forma: {"n", "text", "scene", "who", "extras", "place", "objects", "outfit", "shot", "time"}.',
  ].join("\n");
}

export function rewriteUser(f: Ficha, plan: Plan, n: number, instruction: string): string {
  const len = lengthRule(f.hero.age);
  const page = plan.pages.find((p) => p.n === n) as PlanPage;
  const cast = [`hero: ${f.hero.name}`, ...[...f.cast, ...plan.extraCast].map((c) => `${c.id}: ${c.name || c.relation}`)].join("; ");
  return [
    `Libro: «${plan.title}». Reparto: ${cast}.`,
    plan.places.length ? `Lugares: ${plan.places.map((p) => `${p.id} = ${p.name}`).join("; ")}.` : "",
    plan.objects.length ? `Objetos: ${plan.objects.map((o) => `${o.id} = ${o.name}`).join("; ")}.` : "",
    "",
    "Texto del libro:",
    ...plan.pages.map((p) => `${p.n}. ${p.text}`),
    "",
    `Página ${n} actual (JSON): ${JSON.stringify(page)}`,
    "",
    `Petición del adulto para la página ${n}: «${instruction}»`,
    `Longitud del texto: entre ${len.min} y ${len.max} palabras${len.maxSentence ? `, frases de ${len.maxSentence} palabras como máximo` : ""}.`,
    "Devuelve solo el JSON de la página.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
