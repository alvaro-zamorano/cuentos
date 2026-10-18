import type { Shipping } from "./types";

/**
 * Dirección de envío del libro impreso (B8). Se valida antes de abrir el pago, con los límites de la imprenta (Gelato:
 * nombre y apellidos de 25 caracteres, líneas de 35, ciudad de 30). Por ahora solo Península y Baleares: Canarias, Ceuta
 * y Melilla tienen aduana (decisión de Álvaro, 18 oct). Sin dependencias de servidor: la usa también el formulario.
 */

/** Prefijos de código postal (provincia) a los que no se envía. 35 y 38 Canarias, 51 Ceuta, 52 Melilla. */
export const BLOCKED_POSTCODE_PREFIXES = ["35", "38", "51", "52"];

export type ShippingField = "name" | "line1" | "line2" | "postcode" | "city" | "phone";

export type ShippingResult = { ok: true; shipping: Shipping } | { ok: false; field: ShippingField; message: string };

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
  if (line1.length > 35) return { ok: false, field: "line1", message: "La dirección cabe en 35 caracteres por línea: usa la segunda línea para el piso y la puerta." };
  if (line2.length > 35) return { ok: false, field: "line2", message: "La segunda línea cabe en 35 caracteres." };
  if (!/^\d{5}$/.test(postcode) || Number(postcode.slice(0, 2)) < 1 || Number(postcode.slice(0, 2)) > 52) return { ok: false, field: "postcode", message: "El código postal tiene 5 cifras." };
  if (BLOCKED_POSTCODE_PREFIXES.includes(postcode.slice(0, 2))) return { ok: false, field: "postcode", message: "De momento solo enviamos a la Península y Baleares." };
  if (city.length < 2 || city.length > 30) return { ok: false, field: "city", message: "Escribe la población." };
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

/** La dirección en una línea, para la pantalla y los emails. */
export function shippingLine(s: Shipping): string {
  return [s.line1, s.line2, `${s.postcode} ${s.city}`, s.province].filter(Boolean).join(", ");
}
