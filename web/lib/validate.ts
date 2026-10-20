import type { Draft, Edition } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EDITIONS: Edition[] = ["classic", "illustrated", "hardcover"];

export function asEdition(v: unknown): Edition {
  return EDITIONS.includes(v as Edition) ? (v as Edition) : "classic";
}

/** Validación mínima del borrador que llega del cliente antes de guardarlo. */
export function isDraftLike(v: unknown): v is Draft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<Draft>;
  return (
    !!d.hero &&
    typeof d.hero.name === "string" &&
    d.hero.name.length <= 40 &&
    typeof d.hero.age === "number" &&
    d.hero.age >= 2 &&
    d.hero.age <= 8 &&
    typeof d.occasionId === "string" &&
    JSON.stringify(v).length < 20000
  );
}
