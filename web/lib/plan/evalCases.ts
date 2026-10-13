/**
 * Diez fichas de prueba para el criterio de B1 («10 ideas de prueba dan 10 libros válidos»). Variadas a propósito:
 * edades de 2 a 9, con y sin reparto, «Sorpréndeme», un personaje con derechos que hay que sustituir, emociones
 * pequeñas (miedo a la oscuridad) y una dedicatoria escrita por el adulto.
 */
import type { Ficha } from "./types";

const base = { styleId: "gouache" as const, seed: 0, details: [] as string[], cast: [] as Ficha["cast"] };

export const EVAL_CASES: Ficha[] = [
  {
    ...base,
    idea: "Vera construye un cohete con una caja de cartón y una noche despega de verdad hacia la Luna con su perro Toby.",
    starter: "luna",
    tone: "aventura",
    hero: { name: "Vera", age: 6, gender: "nina", look: { hair: { shape: "rizos-media", color: "caoba" }, skin: "clara", eyes: "verde", glasses: "redondas", unique: "pecas en la nariz" }, outfit: "peto amarillo" },
    cast: [{ id: "c1", kind: "mascota", name: "Toby", relation: "su perro", look: "perro blanco con manchas marrones y orejas caídas, collar rojo" }],
    details: ["le encantan los dinosaurios", "dice «¡despegue!» por todo", "duerme con una linterna"],
  },
  {
    ...base,
    idea: "Mañana es el primer día de cole de Hugo. Le da un poco de vergüenza, pero su mochila de dinosaurio le ayuda.",
    starter: "cole",
    tone: "tierno",
    hero: { name: "Hugo", age: 3, gender: "nino", look: { hair: { shape: "corto", color: "rubio" }, skin: "muy-clara", eyes: "azul" } },
    details: ["su peluche se llama Coco", "le gustan los plátanos"],
  },
  {
    ...base,
    idea: "Es el cumpleaños de Lucía y la abuela Carmen ha escondido pistas por toda la casa que llevan a su regalo.",
    starter: "cumpleanos",
    tone: "divertido",
    hero: { name: "Lucía", age: 8, gender: "nina", look: { hair: { shape: "trenzas", color: "negro" }, skin: "morena", eyes: "marron" }, outfit: "vestido verde con bolsillos" },
    cast: [{ id: "c1", kind: "persona", name: "Carmen", relation: "su abuela", look: "abuela bajita con el pelo blanco recogido y gafas rojas" }],
    details: ["colecciona piedras con forma de corazón", "quiere ser arqueóloga", "odia los guisantes pero no lo dice", "su abuela hace las mejores torrijas"],
    from: "La abuela Carmen",
  },
  {
    ...base,
    idea: "",
    hero: { name: "Mateo", age: 5, gender: "nino", look: { hair: { shape: "afro", color: "negro" }, skin: "oscura", eyes: "marron" } },
    cast: [{ id: "c1", kind: "mascota", name: "Misu", relation: "su gata", look: "gata gris atigrada con una mancha blanca en el pecho" }],
    details: ["le gusta construir torres muy altas", "siempre lleva una gorra del revés"],
  },
  {
    ...base,
    idea: "La noche de Nochebuena, Daniela y su hermano Leo oyen un ruido en el tejado y suben a ver quién anda por ahí.",
    starter: "navidad",
    tone: "tierno",
    hero: { name: "Daniela", age: 4, gender: "nina", look: { hair: { shape: "coleta", color: "castano" }, skin: "melocoton", eyes: "marron" } },
    cast: [{ id: "c1", kind: "persona", name: "Leo", relation: "su hermano mayor", look: "niño de ocho años, pelo castaño despeinado, jersey de rombos" }],
    details: ["dejan siempre un vaso de leche para los renos"],
  },
  {
    ...base,
    idea: "Álex quiere ser Spiderman y salvar la ciudad de un villano que roba todos los columpios del parque.",
    tone: "divertido",
    hero: { name: "Álex", age: 7, gender: "neutro", look: { hair: { shape: "ondulado", color: "castano" }, skin: "media", eyes: "verde" } },
    details: ["trepa a todos los árboles", "tiene una capa hecha con una toalla"],
  },
  {
    ...base,
    idea: "Va a nacer Pablo, el hermanito de Martina, y ella prepara todo lo necesario para enseñarle el mundo.",
    starter: "hermanito",
    tone: "tierno",
    hero: { name: "Martina", age: 4, gender: "nina", look: { hair: { shape: "flequillo", color: "rubio" }, skin: "clara", eyes: "gris" } },
    details: ["le ha guardado su mejor juguete", "practica cantar nanas a su muñeca"],
    dedication: "Para Martina, la mejor hermana mayor que Pablo podía tener. Te queremos, mamá y papá.",
  },
  {
    ...base,
    idea: "A Nico le da miedo la oscuridad. Una noche descubre que las sombras de su cuarto son amigas.",
    starter: "dormir",
    tone: "dormir",
    hero: { name: "Nico", age: 2, gender: "nino", look: { hair: { shape: "rizos", color: "castano" }, skin: "tostada", eyes: "marron" } },
    details: ["duerme con su osito"],
  },
  {
    ...base,
    idea: "Inés es detective y tiene que resolver el misterio de los calcetines que desaparecen en la lavadora.",
    tone: "divertido",
    hero: { name: "Inés", age: 9, gender: "nina", look: { hair: { shape: "melena", color: "pelirrojo" }, skin: "muy-clara", eyes: "azul", glasses: "pasta" }, outfit: "gabardina beige y botas de agua" },
    details: ["tiene una lupa de su abuelo", "apunta todo en una libreta verde", "su hermano pequeño siempre pierde un calcetín"],
  },
  {
    ...base,
    idea: "A Pau se le cae el primer diente y, con el abuelo Juan, prepara una trampa amistosa para conocer al Ratoncito Pérez.",
    starter: "dientes",
    tone: "aventura",
    hero: { name: "Pau", age: 6, gender: "nino", look: { hair: { shape: "rapado", color: "negro" }, skin: "media", eyes: "marron", unique: "le falta el diente de delante" } },
    cast: [{ id: "c1", kind: "persona", name: "Juan", relation: "su abuelo", look: "abuelo alto con barba gris y boina" }],
    details: ["el abuelo hace trucos de magia con monedas", "vive en Zaragoza"],
  },
];
