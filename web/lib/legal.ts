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

/** ¿Están los cuatro datos? Sin ellos no se puede abrir al público. */
export function titularComplete(t: Titular): boolean {
  return !!(t.name && t.nif && t.address && t.email);
}
