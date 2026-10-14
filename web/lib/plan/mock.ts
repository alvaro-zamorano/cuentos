/**
 * Planificador simulado: un plan válido y determinista a partir de la ficha, sin llamadas. Lo usan los tests, Playwright
 * y cualquier entorno sin clave de LLM. No pretende ser un buen cuento: tiene que pasar el validador.
 */
import type { CastId, Ficha, Plan, PlanPage } from "./types";

type Beat = Omit<PlanPage, "n" | "who"> & { withCast: boolean };

export function mockPlan(f: Ficha): Plan {
  const N = f.hero.name || "Vera";
  const c = f.cast[0];
  const C = c ? c.name || c.relation : "";
  const Ccap = C ? C.charAt(0).toUpperCase() + C.slice(1) : "";
  const d = (i: number) => f.details[i] ?? null;
  const castBit = (yes: string, no: string) => (c ? yes : no);

  const beats: Beat[] = [
    { text: `${N} tenía una idea muy grande. La pensaba al desayunar. La pensaba en el baño. Esa mañana, por fin, se levantó de un salto. Hoy era el día perfecto para empezar.`, scene: `${N} salta de la cama con los brazos en alto, en su habitación llena de sol.`, extras: [], place: "p1", objects: [], outfit: "pijama de rayas", shot: "medio", time: "dia", withCast: false },
    { text: `${N} lo contó en la cocina, con la boca llena de pan. Nadie dijo que no. ${castBit(`${Ccap} se puso manos a la obra.`, "Mamá se puso manos a la obra.")} Hacía falta un plan, y hacía falta ya.`, scene: `${N} cuenta su idea en la cocina, gesticulando con un trozo de pan en la mano.`, extras: c ? [] : ["mamá, que escucha con una taza en la mano"], place: "p1", objects: [], outfit: null, shot: "medio", time: "dia", withCast: true },
    { text: d(0) ? `Antes de salir, ${N} se acordó de algo: ${d(0)}. Lo dijo bajito, para no olvidarlo. Luego llenó la mochila roja. Cabía todo lo importante.` : `Antes de salir, ${N} llenó la mochila roja. Metió una linterna y un bocadillo. Metió también un mapa dibujado a mano. Cabía todo lo importante.`, scene: `${N} llena una mochila roja con una linterna y un bocadillo, sentado en el suelo del salón.`, extras: [], place: "p1", objects: ["o1"], outfit: null, shot: "cerca", time: "dia", withCast: false },
    { text: `${castBit(`${Ccap} y ${N}`, N)} salieron a la calle. El aire olía a pan recién hecho. Las palomas se apartaban para dejarles pasar. El camino hasta el parque parecía más largo que nunca.`, scene: `${castBit(`${N} y ${C}`, N)} caminan por una calle tranquila del barrio, con la mochila roja a la espalda.`, extras: [], place: null, objects: ["o1"], outfit: null, shot: "general", time: "dia", withCast: true },
    { text: `En el parque, los árboles eran altísimos. ${N} miró arriba, miró abajo y miró a los lados. Algo brillaba junto al estanque. Algo pequeño y redondo que parecía esperar a alguien.`, scene: `${N} señala algo que brilla junto al estanque del parque, entre los juncos.`, extras: [], place: "p2", objects: [], outfit: null, shot: "general", time: "dia", withCast: false },
    { text: d(1) ? `Era justo lo que hacía falta. ${N} se rió, porque se acordó de algo: ${d(1)}. ${castBit(`${Ccap} también se rió.`, "El viento también se rió.")} La aventura acababa de empezar.` : `Era una llave pequeña, dorada y muy antigua. ${N} la sostuvo con cuidado. ${castBit(`${Ccap} la miró con los ojos muy abiertos.`, "La llave pesaba más de lo que parecía.")} ¿Qué abriría?`, scene: `${N} sostiene una llave dorada en la palma de la mano y la mira con asombro.`, extras: [], place: "p2", objects: [], outfit: null, shot: "cerca", time: "dia", withCast: true },
    { text: `Buscaron una puerta por todo el parque. Probaron en el banco verde. Probaron en el tronco hueco. Probaron en la caseta del jardinero. Nada. Hasta que ${N} vio una puertecita en la raíz de un árbol.`, scene: `${N} se agacha frente a una puerta diminuta tallada en la raíz de un árbol enorme.`, extras: [], place: "p2", objects: [], outfit: null, shot: "medio", time: "dia", withCast: false },
    { text: `La llave giró con un clic. Dentro había un jardín diminuto, con flores que cantaban. ${castBit(`${Ccap} no se lo podía creer.`, `${N} no se lo podía creer.`)} Las flores cantaban fatal, pero con muchísimas ganas.`, scene: `Un jardín diminuto de flores de colores asoma tras la puerta del árbol; ${N} se tapa la boca de asombro.`, extras: [], place: "p2", objects: [], outfit: null, shot: "cerca", time: "atardecer", withCast: true },
    { text: d(2) ? `${N} les cantó su canción favorita. Las flores aprendieron rápido. Luego ${N} les contó un secreto: ${d(2)}. Las flores guardaron el secreto, como hacen las flores.` : `${N} les cantó su canción favorita. Las flores aprendieron rápido. Cantaron juntos hasta que el sol se puso naranja. Fue el mejor concierto del mundo.`, scene: `${N} canta con los brazos abiertos frente a un corro de flores con caritas felices.`, extras: [], place: "p2", objects: [], outfit: null, shot: "medio", time: "atardecer", withCast: false },
    { text: `Era hora de volver. ${N} cerró la puertecita con mucho cuidado. Dejó la llave escondida bajo una hoja. Así otro niño la podría encontrar algún día.`, scene: `${castBit(`${N} y ${C}`, N)} esconden la llave dorada bajo una hoja grande al pie del árbol, al atardecer.`, extras: [], place: "p2", objects: ["o1"], outfit: null, shot: "medio", time: "atardecer", withCast: true },
    { text: `En casa olía a cena caliente. ${N} lo contó todo, desde el principio. ${castBit(`${Ccap} asentía a cada frase.`, "Mamá y papá escuchaban sin pestañear.")} Nadie dijo que fuera imposible. En esta casa, las ideas grandes se escuchan.`, scene: `${N} cuenta su aventura en la mesa de la cena, con las manos en alto, en una cocina cálida.`, extras: c ? [] : ["papá, sentado a la mesa"], place: "p1", objects: [], outfit: null, shot: "medio", time: "noche", withCast: true },
    { text: `Esa noche, ${N} se durmió enseguida. Por la ventana entraba la luz de la luna. Y en el parque, muy bajito, unas flores cantaban su canción.`, scene: `${N} duerme en su cama con una sonrisa; por la ventana se ve la luna sobre el parque.`, extras: [], place: "p1", objects: [], outfit: "pijama de rayas", shot: "medio", time: "noche", withCast: false },
  ];

  const pages: PlanPage[] = beats.map(({ withCast, ...b }, i) => ({ n: i + 1, who: (withCast && c ? ["hero", c.id] : ["hero"]) as CastId[], ...b }));

  return {
    title: `${N} y la gran idea`,
    dedication: f.dedication || `Para ${N}, que tiene ideas grandes y las cuenta en voz alta.`,
    tone: f.tone ?? "aventura",
    extraCast: [],
    places: [
      { id: "p1", name: `la casa de ${N}`, desc: "una casa luminosa con muebles de madera clara y cortinas amarillas" },
      { id: "p2", name: "el parque del barrio", desc: "un parque con árboles muy altos, un estanque con juncos y bancos verdes" },
    ],
    objects: [{ id: "o1", name: "la mochila roja", desc: "una mochila roja con un parche de estrella amarilla" }],
    pages,
    cover: `${N} en el parque, con la mochila roja a la espalda, mira hacia una puerta diminuta en la raíz de un árbol.`,
    notices: [],
  };
}
