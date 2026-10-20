/**
 * Datos del titular para las páginas legales (art. 10 LSSI). Viven en variables de Vercel, no en el código: el repo es
 * público y lo que se escribe aquí queda para siempre en el historial de GitHub. Las páginas legales son estáticas, así
 * que un cambio de valor pide volver a desplegar. Sin valor (20 oct, Álvaro: no se publican hasta facturar más), las
 * páginas dicen la marca y el email de contacto, y omiten el NIF y el domicilio.
 *
 *   LEGAL_NAME     nombre y apellidos o razón social
 *   LEGAL_NIF      NIF
 *   LEGAL_ADDRESS  domicilio
 *   LEGAL_EMAIL    email de contacto (también para ejercer los derechos de privacidad)
 */
export interface Titular {
  name?: string;
  nif?: string;
  address?: string;
  email?: string;
}

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, 200) : undefined;
};

/** Marca y contacto que se enseñan cuando no hay datos del titular. */
export const BRAND_NAME = "Érase su vez";
export const DEFAULT_CONTACT = "hola@erasesuvez.com";

export function titular(env: Record<string, string | undefined> = process.env): Titular {
  return { name: clean(env.LEGAL_NAME), nif: clean(env.LEGAL_NIF), address: clean(env.LEGAL_ADDRESS), email: clean(env.LEGAL_EMAIL) };
}

/** ¿Están los cuatro datos? Sin ellos no se puede abrir al público. */
export function titularComplete(t: Titular): boolean {
  return !!(t.name && t.nif && t.address && t.email);
}

/** Quién responde, en una línea: el nombre (o la marca) y, si están, el NIF y el domicilio. */
export function titularLine(t: Titular): string {
  return [t.name ?? BRAND_NAME, t.nif && `NIF ${t.nif}`, t.address && `domicilio ${t.address}`].filter(Boolean).join(", ");
}
