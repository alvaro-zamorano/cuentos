import { DEFAULT_DRAFT } from "./story";
import { DEFAULT_TRAITS } from "./traits";
import type { Draft } from "./types";

/** Cuento demo del lead magnet (/gratis): Lucas, 5 años, su perro Toby, dinosaurios. Fijo: no lee ni escribe el borrador del usuario. */
export const DEMO_DRAFT: Draft = {
  ...DEFAULT_DRAFT,
  hero: {
    name: "Lucas",
    age: 5,
    traits: { ...DEFAULT_TRAITS, hair: { shape: "rizos", color: "castano" }, outfit: "amarillo", garment: "chubasquero" },
  },
  companion: { kind: "perro", name: "Toby", variant: "golden" },
  special: "dinosaurios",
  edition: "classic",
  textOverrides: {},
  updatedAt: 0,
};
