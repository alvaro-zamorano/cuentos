import type { StyleDef } from "./styles";

/**
 * Prompts de la edición ilustrada (en inglés, lenguaje natural descriptivo).
 * Los rasgos llegan ya en inglés desde describeTraitsEn() y se redeclaran en cada llamada (RF-10).
 * El texto del cuento nunca lo pinta el modelo (RF-15).
 */
export function sheetPrompt(traitsEn: string, style: StyleDef): string {
  return [
    `Character reference sheet for a children's picture book, ${style.promptStyle}.`,
    `The same child shown as a full-body turnaround (front, three-quarter, side, back) in the top row`,
    `and six head-and-shoulders expressions in the bottom row: happy, laughing, surprised, curious, sleepy, proud.`,
    `Child: ${traitsEn}.`,
    `Keep proportions, hair, skin tone, eyes and clothing identical in every view.`,
    `Match the style of the reference image. Plain white background, even spacing, no text, no labels, no numbers.`,
  ].join(" ");
}

export function scenePrompt(scene: string, style: StyleDef): string {
  return [
    `Children's picture book illustration, ${style.promptStyle}.`,
    `Scene: ${scene}`,
    `The child must look exactly like the character sheet reference (same face, hair, skin tone, eyes and clothes).`,
    `Match the rendering style of the style reference image. Landscape composition with calm space on one side; no text in the image.`,
  ].join(" ");
}
