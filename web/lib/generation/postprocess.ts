/**
 * Tratamiento de la imagen generada antes de guardarla (flujo nuevo): JPEG de calidad alta (un PNG 2K de Gemini pesa
 * varios MB; el JPEG, ~10 veces menos, y el PDF de 13 páginas sigue siendo manejable) y una copia pequeña para el
 * control de calidad. Solo servidor (sharp).
 */
export interface Processed {
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

export async function toJpeg(input: Uint8Array, quality = 88): Promise<Processed> {
  const sharp = (await import("sharp")).default;
  const img = sharp(Buffer.from(input));
  const meta = await img.metadata();
  const out = await img.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
  return { data: new Uint8Array(out), mimeType: "image/jpeg", width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Copia de `max` px de ancho como mucho, en JPEG, para mandarla a un modelo de visión. */
export async function thumbnail(input: Uint8Array, max = 1024): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  const out = await sharp(Buffer.from(input)).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return new Uint8Array(out);
}
