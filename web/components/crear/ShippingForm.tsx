"use client";

import type { Shipping } from "@/lib/print/types";

/**
 * Dirección de envío del libro de tapa dura (B8). La valida el servidor (lib/print/shipping.ts) con los límites de la
 * imprenta. `tone="night"`: dentro de la tarjeta de pago.
 * La calle, el piso y la población no se cortan al escribir (auditoría 26 oct): antes «…21, portal B» quedaba en «…21, por»
 * sin aviso. Se cuenta lo que se lleva y, si no cabe, se dice qué hacer.
 */
export type ShippingDraft = Partial<Record<keyof Omit<Shipping, "country">, string>>;

const FIELDS: { key: keyof ShippingDraft; label: string; auto: string; max: number; half?: boolean; optional?: boolean; mode?: "numeric" | "tel"; tooLong?: string }[] = [
  { key: "name", label: "Nombre y apellidos de quien lo recibe", auto: "name", max: 50 },
  { key: "line1", label: "Calle y número", auto: "address-line1", max: 35, tooLong: "Pasa el portal, el piso o la puerta a la línea de abajo, o abrevia («Avda.», «C/»)." },
  { key: "line2", label: "Piso, puerta (opcional)", auto: "address-line2", max: 35, optional: true, tooLong: "Abrevia («portal B, 3.º izq.»)." },
  { key: "postcode", label: "Código postal", auto: "postal-code", max: 5, half: true, mode: "numeric" },
  { key: "city", label: "Población", auto: "address-level2", max: 30, half: true, tooLong: "Abrevia el nombre de la población." },
  { key: "phone", label: "Teléfono para el transportista (opcional)", auto: "tel", max: 20, optional: true, mode: "tel" },
];

export function ShippingForm({ value, onChange, field, tone = "light" }: { value: ShippingDraft; onChange: (v: ShippingDraft) => void; field?: string | null; tone?: "light" | "night" }) {
  const warn = tone === "night" ? "text-[#ffb4a2]" : "text-danger";
  return (
    <fieldset className="grid grid-cols-2 gap-x-3 gap-y-3" data-testid="shipping-form">
      <legend className={`col-span-2 mb-2 text-[15px] font-semibold ${tone === "night" ? "text-moon" : "text-ink"}`}>¿A dónde lo enviamos?</legend>
      {FIELDS.map((f) => {
        const n = (value[f.key] ?? "").trim().length;
        const over = !!f.tooLong && n > f.max;
        return (
          <label key={f.key} className={`grid gap-1.5 ${f.half ? "col-span-1" : "col-span-2"}`}>
            <span className={`flex items-baseline justify-between gap-2 text-[13px] font-semibold ${tone === "night" ? "text-moon-soft" : "text-ink-soft"}`}>
              {f.label}
              {f.tooLong && n >= f.max - 5 && (
                <span className={`text-[12px] font-normal tabular-nums ${over ? warn : ""}`} data-testid={`ship-${f.key}-count`}>
                  {n}/{f.max}
                </span>
              )}
            </span>
            <input
              className={`input min-h-11 text-[16px] ${field === f.key || over ? "border-danger" : ""}`}
              value={value[f.key] ?? ""}
              // la calle, el piso y la población no se cortan: si no caben, se dice (abajo)
              maxLength={f.tooLong ? f.max + 40 : f.max}
              autoComplete={f.auto}
              inputMode={f.mode}
              required={!f.optional}
              aria-invalid={field === f.key || over || undefined}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              data-testid={`ship-${f.key}`}
            />
            {over && (
              <span className={`text-[12.5px] leading-snug ${warn}`} role="alert" data-testid={`ship-${f.key}-long`}>
                La imprenta admite {f.max} letras en esta línea y llevas {n}. {f.tooLong}
              </span>
            )}
          </label>
        );
      })}
      <p className={`col-span-2 text-[13px] ${tone === "night" ? "text-moon-soft" : "text-mute"}`}>Enviamos a la Península y Baleares.</p>
    </fieldset>
  );
}
