/**
 * Datos del titular para las páginas legales (art. 10 LSSI). Viven en variables de Vercel, no en el código: el repo es
 * público y lo que se escribe aquí queda para siempre en el historial de GitHub. Las páginas legales son estáticas, así
 * que un cambio de valor pide volver a desplegar. Sin valor, la página enseña el hueco marcado.
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

export function titular(env: Record<string, string | undefined> = process.env): Titular {
  return { name: clean(env.LEGAL_NAME), nif: clean(env.LEGAL_NIF), address: clean(env.LEGAL_ADDRESS), email: clean(env.LEGAL_EMAIL) };
}

/** Nombre comercial: lo que enseñan los legales cuando no hay nombre del titular (decisión de Álvaro, 20 oct). */
export const BRAND = "Érase su vez";

/**
 * Quién es el titular en una línea. Con nombre, NIF y domicilio en las variables, los tres; sin ellos, el nombre
 * comercial. Álvaro decidió con su gestoría (20 oct) salir sin nombre, NIF ni domicilio; el email sí va.
 */
export function holderLine(t: Titular): string {
  return [t.name ?? BRAND, t.nif ? `NIF ${t.nif}` : null, t.address ? `domicilio en ${t.address}` : null].filter(Boolean).join(", ");
}

/** ¿Están los cuatro datos? (Se sale sin ellos por decisión de Álvaro, 20 oct; ver holderLine.) */
export function titularComplete(t: Titular): boolean {
  return !!(t.name && t.nif && t.address && t.email);
}
