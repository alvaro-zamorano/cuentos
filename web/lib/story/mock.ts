/**
 * Proveedor `mock`: determinista a partir del hash de la entrada. No imita a un LLM: toma el arco del cumpleaños
 * (reescrito para cumplir las longitudes por franja) y teje los detalles reales en los beats 3–11 con plantillas
 * elegidas por el hash. Siempre pasa validateStory. Es lo que corre en preview, en tests y cuando no hay clave.
 */
import type { AgeBand } from "../types";
import { hashString } from "./hash";
import { BEATS, DETAIL_BEATS, LENGTH_RULES, ageWord, fillBeat, type StoryInput } from "./spec";
import { CONNECTORS, countWords, distinctiveKeywords, hasBlacklisted, keywords, norm, tokens, usableDetails, type StoryOutput } from "./validate";

type ByBand = Record<AgeBand, string>;
interface MockBeat {
  core: ByBand;
  /** Variante si el acompañante es una mascota (no habla). */
  corePet?: Partial<ByBand>;
  /** Frases de relleno para llegar al mínimo de palabras de la franja. */
  extra: Record<AgeBand, string[]>;
}

const MOCK: Record<number, MockBeat> = {
  1: {
    core: {
      "2-4": "Hoy es un día especial. {nombre} abre los ojos. Hoy cumple {edad} años.",
      "5-8": "El sol se asomó despacio por la ventana y le hizo cosquillas en la nariz. {nombre} abrió un ojo, luego el otro, y se acordó de golpe. Hoy era el día. Hoy cumplía {edad} años.",
    },
    extra: { "2-4": ["Se estira despacio en la cama."], "5-8": ["Se quedó un momento bajo la manta, escuchando los ruidos de la casa."] },
  },
  2: {
    core: {
      "2-4": "{nombre} mira por la ventana. Los pájaros cantan muy fuerte. El sol también está de fiesta.",
      "5-8": "Se asomó a la ventana. Los pájaros cantaban más fuerte que otros días, y hasta el sol parecía llevar un gorro de fiesta. Todo el barrio parecía saber que hoy era el cumpleaños de {nombre}.",
    },
    extra: { "2-4": ["Todo el barrio lo sabe."], "5-8": ["En la calle, alguien silbaba una canción alegre."] },
  },
  3: {
    core: {
      "2-4": "En la cocina hay una sorpresa. Un globo rojo espera en su silla.",
      "5-8": "En la cocina le esperaba una sorpresa: un globo enorme atado a su silla y, en el plato, tostadas con forma de estrella. {nombre} se frotó los ojos. No era un sueño.",
    },
    extra: { "2-4": ["Hay tostadas con forma de estrella.", "Es para {nombre}."], "5-8": ["El globo se movía un poco, como si también quisiera desayunar."] },
  },
  4: {
    core: {
      "2-4": "Toc, toc. Llaman a la puerta. Es {comp} con un paquete enorme.",
      "5-8": "Toc, toc. Alguien llamaba a la puerta. Era {comp}, con un paquete tan grande que casi no se le veía la cara. Lo dejó en el salón con una sonrisa. Ese paquete era para después.",
    },
    corePet: {
      "2-4": "Toc, toc. Algo rasca la puerta. {Comp} empuja un paquete enorme.",
      "5-8": "Toc, toc. Algo rascaba la puerta. Era {comp}, empujando con el hocico un paquete tan grande que casi no se le veía. Lo dejó en medio del salón y se sentó a vigilarlo. Ese paquete era para después.",
    },
    extra: { "2-4": ["Es para después.", "{nombre} lo mira con curiosidad."], "5-8": ["{nombre} lo miró de reojo toda la mañana."] },
  },
  5: {
    core: {
      "2-4": "Globos arriba, globos abajo. La casa se llena de colores. {Comp} se ríe con {nombre}.",
      "5-8": "Entre todos llenaron el salón de globos y guirnaldas. {nombre} infló uno tan grande que se escapó volando por toda la habitación, y {comp} se rio hasta que le dolió la tripa.",
    },
    corePet: {
      "2-4": "Globos arriba, globos abajo. La casa se llena de colores. {Comp} persigue los globos.",
      "5-8": "Entre todos llenaron el salón de globos y guirnaldas. {nombre} infló uno tan grande que se escapó volando por toda la habitación, y {comp} lo persiguió por todo el salón sin atraparlo ni una vez.",
    },
    extra: { "2-4": ["Todo queda precioso."], "5-8": ["El salón quedó lleno de colores."] },
  },
  6: {
    core: {
      "2-4": "{nombre} se sienta en el sillón. Piensa en {detalle}. ¿Qué deseo pedirá?",
      "5-8": "Un momento de calma. {nombre} se sentó en el sillón y pensó en {detalle}. Faltaba lo más importante del día: decidir qué deseo pedir al soplar las velas. Y eso había que pensarlo muy bien.",
    },
    extra: { "2-4": ["Hay que pensarlo muy bien."], "5-8": ["Cerró los ojos para imaginarlo mejor."] },
  },
  7: {
    core: {
      "2-4": "Al parque. {nombre} sube al tobogán. {Comp} aplaude desde el banco.",
      "5-8": "Por la tarde fueron todos al parque. Columpios, tobogán y una carrera hasta el árbol grande, con {comp} animando desde el banco. {nombre} volvió con las mejillas rojas y la risa suelta.",
    },
    corePet: {
      "2-4": "Al parque. {nombre} corre por la hierba. {Comp} corre detrás. Lleva la cola en alto.",
      "5-8": "Por la tarde fueron todos al parque. Columpios, tobogán y una carrera hasta el árbol grande, con {comp} corriendo detrás con la cola en alto. {nombre} volvió con las mejillas rojas y la risa suelta.",
    },
    extra: { "2-4": ["Qué tarde tan buena."], "5-8": ["El aire olía a hierba recién cortada."] },
  },
  8: {
    core: {
      "2-4": "Una pista, otra pista. La última está en una flor. {nombre} encuentra el tesoro.",
      "5-8": "Entonces empezó la búsqueda del tesoro. Una pista debajo de una piedra, otra dentro de una flor, la última colgada de una rama. Y al final, una caja con un mapa que decía: «Mira en la mesa».",
    },
    extra: { "2-4": ["{Comp} ayuda a buscar."], "5-8": ["{Comp} ayudaba a buscar en cada rincón."] },
  },
  9: {
    core: {
      "2-4": "En la mesa hay una tarta. Tiene {edad} velas encendidas. Todos cantan a la vez.",
      "5-8": "Y en la mesa estaba la tarta. Enorme, con mucha nata y exactamente {edad} velas encendidas, una por cada año de {nombre}. Todos se pusieron alrededor y empezaron a cantar.",
    },
    extra: { "2-4": ["La nata huele muy bien."], "5-8": ["La luz de las velas bailaba en todas las caras."] },
  },
  10: {
    core: {
      "2-4": "{nombre} cierra los ojos y pide un deseo. Sopla muy fuerte. Las velas se apagan.",
      "5-8": "{nombre} cerró los ojos, pensó su deseo en secreto y sopló con todas sus fuerzas. Las {edad} velas se apagaron a la vez. Hubo aplausos, y alguien gritó «bravo».",
    },
    extra: { "2-4": ["Todos aplauden."], "5-8": ["Un hilo de humo subió hasta el techo.", "Nadie supo cuál era el deseo, y así tenía que ser."] },
  },
  11: {
    core: {
      "2-4": "{nombre} abre el paquete de {comp}. Es {regalo}.",
      "5-8": "Llegó la hora del paquete misterioso. {nombre} rasgó el papel con cuidado, luego sin cuidado, y dentro había {regalo}. Justo lo que había pedido en el deseo. {Comp} guiñó un ojo.",
    },
    corePet: {
      "2-4": "{nombre} abre el gran paquete. Es {regalo}. {Comp} mueve la cola.",
      "5-8": "Llegó la hora del paquete misterioso. {nombre} rasgó el papel con cuidado, luego sin cuidado, y dentro había {regalo}. Justo lo que había pedido en el deseo. {Comp} dio tres vueltas alrededor de la caja.",
    },
    extra: { "2-4": ["Justo lo que había pedido."], "5-8": ["Era el mejor final para un día así."] },
  },
  12: {
    core: {
      "2-4": "Ya es de noche. {nombre} se duerme sonriendo. Ha sido un cumpleaños muy feliz.",
      "5-8": "Por la noche, con la tripa llena de tarta y la cabeza llena de risas, {nombre} se acurrucó en la cama. Por la ventana brillaba una estrella. «Hasta el año que viene», pensó. Y se durmió sonriendo.",
    },
    extra: { "2-4": ["Buenas noches, {nombre}."], "5-8": ["Había sido un día redondo."] },
  },
};

/** Plantillas para tejer un detalle (lo que va tras los dos puntos es el detalle del adulto). */
const DETAIL_TEMPLATES: Record<AgeBand, string[]> = {
  "2-4": ["Y {nombre} se acuerda:", "Hoy no falta esto:", "En casa lo saben bien:", "{nombre} sonríe al pensarlo:", "Y hay sitio para algo suyo:"],
  "5-8": [
    "Entonces {nombre} se acordó de algo muy suyo:",
    "Y, como cualquier otro día, no faltó una cosa:",
    "En casa todos lo saben:",
    "Hubo un momento para algo que {nombre} no cambia por nada:",
    "Y hubo tiempo para lo de siempre:",
    "{Comp} lo sabía de sobra:",
  ],
};

const TITLES = ["El cumpleaños de {nombre}", "El gran día de {nombre}", "{nombre} cumple {edadTexto}", "Un cumpleaños para {nombre}"];
const DEDICATIONS = [
  "Para {nombre}, que hoy cumple {edadTexto}. Este cuento no existía hasta hoy.",
  "Para {nombre}, en su cumpleaños número {edadTexto}. Este libro se escribió solo para ti.",
  "Para {nombre}, que cumple {edadTexto} años. Que este día se quede contigo mucho tiempo.",
];

function rnd(inputHash: string, salt: string): number {
  return parseInt(hashString(`${inputHash}:${salt}`).slice(-8), 16);
}

function fillMock(t: string, input: StoryInput): string {
  return fillBeat(t, input).replaceAll("{edadTexto}", ageWord(input.age));
}

/** Ajusta un detalle a `maxWords` palabras sin perder su palabra significativa ni acabar en preposición. */
export function fitDetail(detail: string, maxWords: number): string {
  let d = detail.trim().replace(/[.,;:\s]+$/u, "");
  const words = d.split(/\s+/);
  if (tokens(d).length > maxWords) {
    const keys = distinctiveKeywords(d);
    const idx = Math.max(0, words.findIndex((w) => keys.some((k) => norm(w).includes(k))));
    const start = idx < maxWords ? 0 : idx;
    let cut = words.slice(start, start + maxWords);
    while (cut.length > 1 && CONNECTORS.has(norm(cut[cut.length - 1]).replace(/[^\p{L}]/gu, ""))) cut = cut.slice(0, -1);
    d = cut.join(" ").replace(/[.,;:\s«"“(]+$/u, "");
    // comillas sin cerrar tras el corte
    if ((d.match(/«/g) ?? []).length > (d.match(/»/g) ?? []).length) d += "»";
  }
  // minúscula inicial tras los dos puntos, salvo que empiece por un nombre (mayúscula en la segunda letra = sigla)
  const first = d.charAt(0);
  const second = d.charAt(1);
  return second && second === second.toUpperCase() && /\p{L}/u.test(second) ? d : first.toLowerCase() + d.slice(1);
}

function pageText(n: number, input: StoryInput, detail: string | null, h: number): string {
  const beat = MOCK[n];
  const band = input.band;
  const rules = LENGTH_RULES[band];
  const names = [input.name, input.companion?.name].filter((x): x is string => !!x);
  const pet = !!input.companion?.isPet;
  const core = fillMock((pet && beat.corePet?.[band]) || beat.core[band], input);
  const parts = [core];

  if (detail) {
    const tpls = DETAIL_TEMPLATES[band];
    const prefix = fillMock(tpls[h % tpls.length], input);
    const room = rules.maxWords - countWords(core, names) - countWords(prefix, names);
    const max = Math.max(1, Math.min(room, rules.maxSentenceWords ?? 30));
    parts.push(`${prefix} ${fitDetail(detail, max)}.`);
  }

  const extras = beat.extra[band].map((e) => fillMock(e, input));
  let i = (h >>> 3) % Math.max(1, extras.length);
  for (let tries = 0; tries < extras.length && countWords(parts.join(" "), names) < rules.minWords; tries++, i = (i + 1) % extras.length) {
    const next = [...parts, extras[i]].join(" ");
    if (countWords(next, names) <= rules.maxWords) parts.push(extras[i]);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Compone la historia del mock en el formato de salida (el mismo JSON que se pide al LLM). */
export function composeMockStory(input: StoryInput): StoryOutput {
  const h = rnd(input.inputHash, "story");
  // detalles utilizables (sin lista negra) repartidos en los beats de detalles, rotados por el hash
  const details = usableDetails(input).concat(input.details.filter((d) => !hasBlacklisted(d) && keywords(d).length === 0)).slice(0, DETAIL_BEATS.length);
  const rot = h % DETAIL_BEATS.length;
  const slots = [...DETAIL_BEATS.slice(rot), ...DETAIL_BEATS.slice(0, rot)].slice(0, details.length).sort((a, b) => a - b);
  const byBeat = new Map<number, string>(slots.map((n, i) => [n, details[i]]));

  const pages = BEATS.map((b) => {
    const text = pageText(b.n, input, byBeat.get(b.n) ?? null, rnd(input.inputHash, `p${b.n}`));
    return {
      n: b.n,
      scene: b.scenes[0],
      expression: b.expression,
      withCompanion: b.withCompanion && !!input.companion,
      text,
      sceneBrief: fillMock(b.brief, input),
    };
  });
  return {
    title: fillMock(TITLES[h % TITLES.length], input),
    dedication: fillMock(DEDICATIONS[(h >>> 4) % DEDICATIONS.length], input),
    pages,
  };
}
