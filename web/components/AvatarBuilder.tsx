"use client";

import { Avatar } from "./Avatar";
import { ACCESSORIES, EYES, EYE_SHAPES, GARMENTS, GLASSES, HAIR_COLORS, HAIR_SHAPES, OUTFITS, SKINS, normalizeTraits, randomTraits } from "@/lib/traits";
import type { Traits } from "@/lib/types";

export function AvatarBuilder({ traits: raw, onChange, compact = false }: { traits: Traits; onChange: (t: Traits) => void; compact?: boolean }) {
  const traits = normalizeTraits(raw);
  return (
    <div className={`grid gap-5 ${compact ? "" : "md:grid-cols-[220px_1fr]"}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-3xl bg-white p-3 border-2 border-line">
          <Avatar traits={traits} expression="feliz" size={compact ? 120 : 180} />
        </div>
        <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => onChange(randomTraits())}>
          🎲 Sorpréndeme
        </button>
      </div>

      <div className="grid gap-4">
        <Field label="Pelo">
          <div className="flex flex-wrap gap-2">
            {HAIR_SHAPES.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`chip ${traits.hair.shape === h.id ? "chip-on" : ""}`}
                onClick={() => onChange({ ...traits, hair: { ...traits.hair, shape: h.id } })}
              >
                {h.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {HAIR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                title={c.label}
                className={`swatch ${traits.hair.color === c.id ? "swatch-on" : ""}`}
                style={{ background: c.hex }}
                onClick={() => onChange({ ...traits, hair: { ...traits.hair, color: c.id } })}
              />
            ))}
          </div>
        </Field>

        <Field label="Piel">
          <div className="flex flex-wrap gap-2">
            {SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-label={s.label}
                title={s.label}
                className={`swatch ${traits.skin === s.id ? "swatch-on" : ""}`}
                style={{ background: s.hex }}
                onClick={() => onChange({ ...traits, skin: s.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Ojos">
          <div className="flex flex-wrap gap-2">
            {EYE_SHAPES.map((e) => (
              <button key={e.id} type="button" className={`chip ${traits.eyeShape === e.id ? "chip-on" : ""}`} onClick={() => onChange({ ...traits, eyeShape: e.id })}>
                {e.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {EYES.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-label={`Ojos ${e.label}`}
                title={e.label}
                className={`swatch ${traits.eyes === e.id ? "swatch-on" : ""}`}
                style={{ background: e.hex }}
                onClick={() => onChange({ ...traits, eyes: e.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Gafas">
          <div className="flex flex-wrap gap-2">
            {GLASSES.map((g) => (
              <button key={g.id} type="button" className={`chip ${traits.glasses === g.id ? "chip-on" : ""}`} onClick={() => onChange({ ...traits, glasses: g.id })}>
                {g.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Ropa">
          <div className="flex flex-wrap gap-2">
            {GARMENTS.map((g) => (
              <button key={g.id} type="button" className={`chip ${traits.garment === g.id ? "chip-on" : ""}`} onClick={() => onChange({ ...traits, garment: g.id })}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {OUTFITS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-label={`Ropa ${o.label}`}
                title={o.label}
                className={`swatch ${traits.outfit === o.id ? "swatch-on" : ""}`}
                style={{ background: o.hex }}
                onClick={() => onChange({ ...traits, outfit: o.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Accesorio">
          <div className="flex flex-wrap gap-2">
            {ACCESSORIES.map((a) => (
              <button key={a.id} type="button" className={`chip ${traits.accessory === a.id ? "chip-on" : ""}`} onClick={() => onChange({ ...traits, accessory: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-ink-soft">{label}</div>
      {children}
    </div>
  );
}
