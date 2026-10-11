import type { StyleDef } from "./styles";

/**
 * Prompts de la edición ilustrada (en inglés, lenguaje natural descriptivo).
 * `traitsEn` / `bible` es la descripción canónica de characterBible() (lib/generation/character.ts) y se
 * redeclara en cada llamada (RF-10). Por compatibilidad también acepta el texto de describeTraitsEn().
 * El texto del cuento nunca lo pinta el modelo (RF-15).
 * Formato: la hoja es cuadrada; las páginas, apaisadas 3:2 (en Gemini solo se puede pedir por prompt;
 * en OpenAI además se fija el tamaño 1536x1024 en la petición).
 */
const STYLE_REF_ONLY = "Use the style reference image only for its rendering style, palette and texture; do not copy its characters, clothes or scene.";
const NO_TEXT = "No text, no letters, no labels, no numbers anywhere in the image.";

export function sheetPrompt(traitsEn: string, style: StyleDef): string {
  return [
    `Character reference sheet for a children's picture book, ${style.promptStyle}.`,
    `Character: ${traitsEn}.`,
    `Square image. Top row: the same child full body in four views — front, three-quarter, side profile and back.`,
    `Bottom row: six head-and-shoulders expressions of the same child — happy, laughing, surprised, curious, sleepy, proud.`,
    `Keep proportions, face, hair, skin tone, eyes and clothing identical in every view.`,
    STYLE_REF_ONLY,
    `Plain white background, even spacing between views. ${NO_TEXT}`,
  ].join(" ");
}

/**
 * @param scene descripción de la escena (en inglés).
 * @param bible descripción canónica del niño; si falta, el prompt se apoya solo en la hoja de referencia.
 */
export function scenePrompt(scene: string, style: StyleDef, bible?: string): string {
  return [
    `Children's picture book illustration, ${style.promptStyle}.`,
    `Scene: ${scene.trim().replace(/\.?$/, ".")}`,
    bible
      ? `The child is exactly the child from the character sheet reference — ${bible} — same face, hair, skin tone, eyes and clothes.`
      : `The child must look exactly like the character sheet reference (same face, hair, skin tone, eyes and clothes).`,
    STYLE_REF_ONLY,
    `Landscape 3:2 composition; keep the left or right third calm and uncluttered so the story text can sit beside the picture. ${NO_TEXT}`,
  ].join(" ");
}
