import type { Tone } from "./types";

/**
 * Ideas de arranque del paso 1 (PLAN §3.1 y §4). No son plantillas: al elegir una, su frase rellena la caja de la idea
 * y el padre la cambia a su gusto. «{nombre}» se sustituye por el nombre del protagonista si ya se conoce.
 */
export interface Starter {
  id: string;
  label: string;
  idea: string;
  tone: Tone;
}

export const STARTERS: Starter[] = [
  { id: "cumpleanos", label: "Su cumpleaños", tone: "divertido", idea: "Es el cumpleaños de {nombre} y desde por la mañana pasan cosas raras: alguien ha escondido pistas por toda la casa." },
  { id: "navidad", label: "Navidad", tone: "tierno", idea: "La noche de Nochebuena, {nombre} oye un ruido en el tejado y sube a ver quién anda por ahí." },
  { id: "reyes", label: "Noche de Reyes", tone: "tierno", idea: "La noche de Reyes, {nombre} quiere aguantar sin dormirse para dar las gracias a los camellos, que siempre llegan cansados." },
  { id: "cole", label: "Primer día de cole", tone: "tierno", idea: "Mañana es el primer día de cole de {nombre}. Le tiemblan un poco las rodillas, pero su mochila tiene un plan." },
  { id: "hermanito", label: "Llega un hermanito", tone: "tierno", idea: "Va a nacer el hermanito de {nombre}, que prepara todo lo necesario para enseñarle el mundo." },
  { id: "luna", label: "Viaje a la Luna", tone: "aventura", idea: "{nombre} construye un cohete con una caja de cartón y una noche despega de verdad hacia la Luna." },
  { id: "dientes", label: "Se le cae un diente", tone: "divertido", idea: "A {nombre} se le cae el primer diente y decide aguantar sin dormirse para hacerle una pregunta al Ratoncito Pérez." },
  { id: "chupete", label: "Adiós al chupete", tone: "tierno", idea: "{nombre} decide regalar su chupete a un animal del bosque que lo necesita más que nadie." },
  { id: "dormir", label: "Dormir en su cama", tone: "dormir", idea: "Esta noche {nombre} duerme por primera vez en su cama nueva, y su habitación tiene una sorpresa cuando se apaga la luz." },
  { id: "mudanza", label: "Casa nueva", tone: "tierno", idea: "La familia de {nombre} se muda a una casa nueva y {nombre} descubre que en el desván vive alguien muy simpático." },
  { id: "playa", label: "Verano en la playa", tone: "aventura", idea: "En la playa, {nombre} encuentra una botella con un mapa dentro que lleva a una isla cercana." },
  { id: "abuelos", label: "Con los abuelos", tone: "tierno", idea: "{nombre} pasa el fin de semana en casa de sus abuelos y juntos arreglan algo muy antiguo que estaba en el trastero." },
  { id: "bici", label: "Aprender a ir en bici", tone: "divertido", idea: "{nombre} aprende a montar en bici sin ruedines, y la bici tiene sus propias ideas sobre adónde ir." },
  { id: "dinosaurios", label: "Dinosaurios", tone: "aventura", idea: "Un huevo enorme aparece en el jardín de {nombre} y de él sale un dinosaurio pequeño que no sabe volver a casa." },
  { id: "piratas", label: "Piratas", tone: "aventura", idea: "{nombre} y su tripulación navegan en un barco hecho con el sofá del salón en busca de un tesoro." },
  { id: "superpoder", label: "Un superpoder", tone: "divertido", idea: "Una mañana {nombre} se despierta con un superpoder muy pequeño pero muy útil." },
  { id: "bosque", label: "El bosque", tone: "aventura", idea: "{nombre} sigue a una ardilla que lleva una llave y llega a un claro del bosque donde los árboles hablan." },
  { id: "nieve", label: "La primera nevada", tone: "tierno", idea: "Nieva por primera vez y el muñeco de nieve que hace {nombre} quiere conocer la ciudad antes de que salga el sol." },
  { id: "mascota", label: "Su mascota", tone: "divertido", idea: "La mascota de {nombre} desaparece una tarde y deja un rastro de pistas por todo el barrio." },
  { id: "sorpresa", label: "Una sorpresa para mamá o papá", tone: "tierno", idea: "{nombre} prepara a escondidas una sorpresa para mamá, con la ayuda de todo el que se deja." },
];

export function starterIdea(id: string, name: string): string | null {
  const s = STARTERS.find((x) => x.id === id);
  if (!s) return null;
  const idea = s.idea.replaceAll("{nombre}", name.trim() || "nuestro protagonista");
  // sin nombre, una idea que empieza por él empezaba en minúscula: «nuestro protagonista pasa…» (mirada de usuario)
  return idea.charAt(0).toUpperCase() + idea.slice(1);
}
