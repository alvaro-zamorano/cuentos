"use client";

import { useState } from "react";
import { GENDERS, LIMITS, TONES } from "@/lib/plan/ficha";
import { STARTERS, starterIdea } from "@/lib/plan/starters";
import type { Ficha } from "@/lib/plan/types";

/** Paso 1: para quién es y de qué va. Con el nombre y una frase basta para escribir el libro. */
export function StepIdea({ ficha, onChange, onNext }: { ficha: Ficha; onChange: (f: Ficha) => void; onNext: () => void }) {
  const hero = ficha.hero;
  const setHero = (patch: Partial<Ficha["hero"]>) => onChange({ ...ficha, hero: { ...hero, ...patch } });
  const canGo = hero.name.trim().length > 0;
  const [allIdeas, setAllIdeas] = useState(false);
  const shown = allIdeas ? STARTERS : STARTERS.filter((s, i) => i < 8 || s.id === ficha.starter);

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (canGo) onNext();
      }}
    >
      <section className="grid gap-5">
        <h2 className="display text-3xl sm:text-4xl">¿Para quién es el cuento?</h2>
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <label className="grid gap-1">
            <span className="field-label">Nombre</span>
            <input
              className="input"
              value={hero.name}
              maxLength={LIMITS.name}
              onChange={(e) => setHero({ name: e.target.value })}
              placeholder="Vera"
              autoComplete="off"
              data-testid="hero-name"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="field-label">Edad</span>
            <select className="input" value={hero.age} onChange={(e) => setHero({ age: Number(e.target.value) })} data-testid="hero-age">
              {Array.from({ length: LIMITS.maxAge - LIMITS.minAge + 1 }, (_, i) => i + LIMITS.minAge).map((a) => (
                <option key={a} value={a}>
                  {a} {a === 1 ? "año" : "años"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2">
          <span className="field-label">Para escribirle bien en castellano</span>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <button type="button" key={g.id} className={`chip ${hero.gender === g.id ? "chip-on" : ""}`} onClick={() => setHero({ gender: g.id })}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="display text-3xl sm:text-4xl">¿De qué va?</h2>
        <p className="text-ink-soft">Cuéntanos la idea como se la contarías a un amigo. Una frase basta; si lo prefieres, la ponemos nosotros.</p>
        <textarea
          className="min-h-32 w-full rounded-[6px] border border-line bg-card p-4 text-lg leading-relaxed outline-none focus:border-ink"
          value={ficha.idea}
          maxLength={LIMITS.idea}
          onChange={(e) => onChange({ ...ficha, idea: e.target.value })}
          placeholder="Vera construye un cohete con una caja de cartón y una noche despega de verdad hacia la Luna con su perro Toby."
          data-testid="idea"
        />
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>{ficha.idea ? "" : "Sin idea escribimos una historia original para este niño o niña."}</span>
          <span>
            {ficha.idea.length}/{LIMITS.idea}
          </span>
        </div>
        <div className="grid gap-2">
          <span className="field-label">Ideas para empezar</span>
          <div className="flex flex-wrap gap-2">
            {shown.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip ${ficha.starter === s.id ? "chip-on" : ""}`}
                onClick={() => onChange({ ...ficha, starter: s.id, idea: starterIdea(s.id, hero.name) ?? ficha.idea, tone: ficha.tone ?? s.tone })}
              >
                {s.label}
              </button>
            ))}
            {!allIdeas && (
              <button type="button" className="chip" onClick={() => setAllIdeas(true)}>
                Más ideas…
              </button>
            )}
            <button type="button" className="chip" onClick={() => onChange({ ...ficha, idea: "", starter: undefined })} data-testid="surprise">
              Sorpréndeme
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="field-label">Tono (opcional)</span>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button type="button" key={t.id} className={`chip ${ficha.tone === t.id ? "chip-on" : ""}`} onClick={() => onChange({ ...ficha, tone: ficha.tone === t.id ? undefined : t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!canGo} data-testid="next-1">
          Seguir
        </button>
        {!canGo && <span className="text-sm text-ink-soft">Falta el nombre.</span>}
      </div>
    </form>
  );
}
