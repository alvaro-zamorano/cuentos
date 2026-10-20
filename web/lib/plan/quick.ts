/**
 * «Tres preguntas rápidas» (paso 2, al pulsar «Escribir el cuento»). Salen solo si la ficha no trae nada del niño:
 * sin detalles y con una idea vacía, la de arranque sin tocar o muy corta. La prueba del 18 oct (ESTADO §3) lo
 * justifica: con la misma idea pobre, cuatro detalles cambian el cuento de genérico a suyo; sin ellos el planificador
 * rellena con fantasía y personajes inventados.
 *
 * Las respuestas van a `ficha.details`, que el planificador ya reparte por el libro. Sin dependencias de servidor.
 */
import { LIMITS } from "./ficha";
import { starterIdea } from "./starters";
import type { Ficha } from "./types";

/** Por debajo de estas palabras, una idea sin detalles se queda corta. */
export const QUICK_MIN_WORDS = 20;

export type QuickId = "gusta" | "frase" | "aprende";

export interface QuickQuestion {
  id: QuickId;
  /** Pregunta con «{nombre}». */
  ask: string;
  /** Prefijo del detalle que llega al planificador. */
  lead: string;
  chips: string[];
  placeholder: string;
}

export type QuickAnswers = Record<QuickId, { chips: string[]; text: string }>;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** ¿Merece la pena preguntar antes de escribir? */
export function needsQuickQuestions(f: Ficha): boolean {
  if (f.details.some((d) => d.trim())) return false;
  const idea = f.idea.trim();
  if (!idea) return true;
  if (f.starter && idea === starterIdea(f.starter, f.hero.name)) return true;
  return words(idea) < QUICK_MIN_WORDS;
}

/** Preguntas para esta edad: hasta 3 años, cosas de bebé; desde 4, de niño. */
export function quickQuestions(age: number): QuickQuestion[] {
  const small = age <= 3;
  return [
    {
      id: "gusta",
      ask: "¿Qué le encanta a {nombre}?",
      lead: "Lo que más le gusta",
      chips: small
        ? ["los animales", "los coches", "la música y bailar", "la pelota", "el agua", "esconderse", "los columpios", "los cuentos"]
        : ["los dinosaurios", "el espacio", "el fútbol", "los animales", "disfrazarse", "dibujar", "construir cosas", "la música", "cocinar", "los bichos"],
      placeholder: small ? "u otra cosa: las cajas" : "u otra cosa: los camiones",
    },
    {
      id: "frase",
      ask: "¿Alguna frase o manía suya?",
      lead: "Frase o manía suya",
      chips: [],
      placeholder: small ? "dice «¡mío!» a todo" : "siempre dice «esto es una misión»",
    },
    {
      id: "aprende",
      ask: "¿Qué está aprendiendo o qué ya le sale muy bien?",
      lead: "Está aprendiendo o ya le sale muy bien",
      chips: small
        ? ["andar", "hablar", "dar palmas", "comer sin ayuda", "dejar el pañal", "subir escaleras"]
        : ["montar en bici", "nadar", "leer", "escribir su nombre", "atarse los cordones", "silbar"],
      placeholder: small ? "u otra cosa: decir adiós" : "u otra cosa: la voltereta",
    },
  ];
}

export function emptyQuickAnswers(): QuickAnswers {
  return { gusta: { chips: [], text: "" }, frase: { chips: [], text: "" }, aprende: { chips: [], text: "" } };
}

/** Respuestas → detalles de la ficha («Lo que más le gusta: los dinosaurios, el espacio»). Una línea por pregunta. */
export function quickDetails(age: number, a: QuickAnswers): string[] {
  const out: string[] = [];
  for (const q of quickQuestions(age)) {
    const parts = [...a[q.id].chips, a[q.id].text.trim()].filter(Boolean);
    if (!parts.length) continue;
    const line = `${q.lead}: ${parts.join(", ")}`;
    out.push(line.length > LIMITS.detail ? line.slice(0, LIMITS.detail).trimEnd() : line);
  }
  return out;
}

/** Junta los detalles nuevos con los que hubiera (sin huecos vacíos), hasta el máximo. */
export function mergeDetails(current: string[], added: string[]): string[] {
  return [...current.map((d) => d.trim()).filter(Boolean), ...added].slice(0, LIMITS.details);
}
