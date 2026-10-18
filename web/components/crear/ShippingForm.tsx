"use client";

import type { Shipping } from "@/lib/print/types";

/**
 * Dirección de envío del libro de tapa dura (B8). La valida el servidor (lib/print/shipping.ts) con los límites de la
 * imprenta; aquí solo se recoge. `tone="night"`: dentro de la tarjeta de pago.
 */
export type ShippingDraft = Partial<Record<keyof Omit<Shipping, "country">, string>>;

const FIELDS: { key: keyof ShippingDraft; label: string; auto: string; max: number; half?: boolean; optional?: boolean; mode?: "numeric" | "tel" }[] = [
  { key: "name", label: "Nombre y apellidos de quien lo recibe", auto: "name", max: 50 },
  { key: "line1", label: "Calle y número", auto: "address-line1", max: 35 },
  { key: "line2", label: "Piso, puerta (opcional)", auto: "address-line2", max: 35, optional: true },
  { key: "postcode", label: "Código postal", auto: "postal-code", max: 5, half: true, mode: "numeric" },
  { key: "city", label: "Población", auto: "address-level2", max: 30, half: true },
  { key: "phone", label: "Teléfono para el transportista (opcional)", auto: "tel", max: 20, optional: true, mode: "tel" },
];

export function ShippingForm({ value, onChange, field, tone = "light" }: { value: ShippingDraft; onChange: (v: ShippingDraft) => void; field?: string | null; tone?: "light" | "night" }) {
  return (
    <fieldset className="grid grid-cols-2 gap-x-3 gap-y-3" data-testid="shipping-form">
      <legend className={`col-span-2 mb-2 text-[15px] font-semibold ${tone === "night" ? "text-moon" : "text-ink"}`}>¿A dónde lo enviamos?</legend>
      {FIELDS.map((f) => (
        <label key={f.key} className={`grid gap-1.5 ${f.half ? "col-span-1" : "col-span-2"}`}>
          <span className={`text-[13px] font-semibold ${tone === "night" ? "text-moon-soft" : "text-ink-soft"}`}>{f.label}</span>
          <input
            className={`input min-h-11 text-[16px] ${field === f.key ? "border-danger" : ""}`}
            value={value[f.key] ?? ""}
            maxLength={f.max}
            autoComplete={f.auto}
            inputMode={f.mode}
            required={!f.optional}
            aria-invalid={field === f.key || undefined}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            data-testid={`ship-${f.key}`}
          />
        </label>
      ))}
      <p className={`col-span-2 text-[13px] ${tone === "night" ? "text-moon-soft" : "text-mute"}`}>Enviamos a la Península y Baleares.</p>
    </fieldset>
  );
}
