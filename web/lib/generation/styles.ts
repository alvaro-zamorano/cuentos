import data from "./styles.json";
import type { StyleId } from "../types";

/** Estilo de ilustración (copia generada de assets/styles.json por scripts/assets_build.py). */
export interface StyleDef {
  id: StyleId;
  label: string;
  /** Ruta relativa a la raíz del repo (assets/raw, fuera de git: existe en el Mac Mini). */
  anchorPath: string;
  promptStyle: string;
  palette: string[];
}

export const STYLES: StyleDef[] = (data.styles as StyleDef[]).map(({ id, label, anchorPath, promptStyle, palette }) => ({
  id,
  label,
  anchorPath,
  promptStyle,
  palette,
}));

export function getStyle(id: string): StyleDef | undefined {
  return STYLES.find((s) => s.id === id);
}
