import type { Shipping, ShippingSummary } from "./types";

/**
 * Dirección de envío del libro impreso (B8). Se valida antes de abrir el pago, con los límites de la imprenta (Gelato:
 * nombre y apellidos de 25 caracteres, líneas de 35, ciudad de 30). Por ahora solo Península y Baleares: Canarias, Ceuta
 * y Melilla tienen aduana (decisión de Álvaro, 18 oct). Sin dependencias de servidor: la usa también el formulario.
 */

/** Prefijos de código postal (provincia) a los que no se envía. 35 y 38 Canarias, 51 Ceuta, 52 Melilla. */
export const BLOCKED_POSTCODE_PREFIXES = ["35", "38", "51", "52"];

export type ShippingField = "name" | "line1" | "line2" | "postcode" | "city" | "phone";

export type ShippingResult = { ok: true; shipping: Shipping } | { ok: false; field: ShippingField; message: string };

/**
 * Qué hacer cuando la calle, el piso o la población no caben. Lo dicen igual el formulario, al escribir, y el servidor, al
 * guardar (revisión 27 oct: el servidor decía «Escribe la población.» a una población demasiado larga).
 */
export const TOO_LONG: Partial<Record<ShippingField, { max: number; fix: string }>> = {
  line1: { max: 35, fix: "Pasa el portal, el piso o la puerta a la línea de abajo, o abrevia («Avda.», «C/»)." },
  line2: { max: 35, fix: "Abrevia («portal B, 3.º izq.»)." },
  city: { max: 30, fix: "Abrevia el nombre de la población." },
};

/** «La imprenta admite N letras en esta línea.» y qué hacer. */
export function tooLongMessage(field: ShippingField): string {
  const t = TOO_LONG[field]!;
  return `La imprenta admite ${t.max} letras en esta línea. ${t.fix}`;
}

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

/** Nombre y apellidos en dos partes (la imprenta pide las dos, de 25 caracteres como mucho cada una). */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? "";
  return { firstName: firstName.slice(0, 25), lastName: parts.join(" ").slice(0, 25) };
}

export function cleanShipping(input: unknown): ShippingResult {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = clean(o.name, 50);
  const line1 = clean(o.line1, 35);
  const line2 = clean(o.line2, 35);
  const postcode = clean(o.postcode, 5).replace(/\s/g, "");
  const city = clean(o.city, 30);
  const province = clean(o.province, 30);
  const phone = clean(o.phone, 20);
  if (name.length < 3 || name.length > 50 || name.split(" ").length < 2) return { ok: false, field: "name", message: "Escribe el nombre y los apellidos de quien lo recibe." };
  if (splitName(name).lastName.length === 0) return { ok: false, field: "name", message: "Escribe también los apellidos." };
  if (line1.length < 3) return { ok: false, field: "line1", message: "Escribe la calle y el número." };
  if (line1.length > 35) return { ok: false, field: "line1", message: tooLongMessage("line1") };
  if (line2.length > 35) return { ok: false, field: "line2", message: tooLongMessage("line2") };
  if (!/^\d{5}$/.test(postcode) || Number(postcode.slice(0, 2)) < 1 || Number(postcode.slice(0, 2)) > 52) return { ok: false, field: "postcode", message: "El código postal tiene 5 cifras." };
  if (BLOCKED_POSTCODE_PREFIXES.includes(postcode.slice(0, 2))) return { ok: false, field: "postcode", message: "De momento solo enviamos a la Península y Baleares." };
  if (city.length < 2) return { ok: false, field: "city", message: "Escribe la población." };
  if (city.length > 30) return { ok: false, field: "city", message: tooLongMessage("city") };
  if (phone && !/^\+?[\d\s]{9,20}$/.test(phone)) return { ok: false, field: "phone", message: "El teléfono, solo con cifras (puede empezar por +)." };
  return {
    ok: true,
    shipping: {
      name,
      line1,
      ...(line2 ? { line2 } : {}),
      postcode,
      city,
      ...(province ? { province } : {}),
      country: "ES",
      ...(phone ? { phone: phone.replace(/\s/g, "") } : {}),
    },
  };
}

/** La dirección en una línea, para los emails y la imprenta. */
export function shippingLine(s: Shipping): string {
  return [s.line1, s.line2, `${s.postcode} ${s.city}`, s.province].filter(Boolean).join(", ");
}

/** Lo que va a la pantalla: nombre, código postal y población; ni calle ni teléfono (I16). */
export function shippingSummary(s: Shipping): ShippingSummary {
  return { name: s.name, postcode: s.postcode, city: s.city, ...(s.province ? { province: s.province } : {}) };
}
