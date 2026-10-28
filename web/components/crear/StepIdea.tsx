"use client";

import { useState } from "react";
import { Icon, Sparkle } from "@/components/brand";
import { GENDERS, LIMITS, TONES } from "@/lib/plan/ficha";
import { STARTERS, starterIdea } from "@/lib/plan/starters";
import type { Ficha } from "@/lib/plan/types";
import { AutoTextarea } from "./AutoTextarea";

type IconName = keyof typeof Icon;
type ToneId = (typeof TONES)[number]["id"];

/** Icono de las ideas de arranque (las de la landing); las demás, un libro. */
const STARTER_ICON: Record<string, IconName> = { cumpleanos: "cake", navidad: "tree", reyes: "star", cole: "bag", hermanito: "heart", luna: "moon", dientes: "tooth" };
const TONE_LOOK: Record<ToneId, { icon: IconName; bg: string }> = {
  aventura: { icon: "star", bg: "bg-peach" },
  tierno: { icon: "heart", bg: "bg-sky" },
  divertido: { icon: "smile", bg: "bg-butter" },
  dormir: { icon: "moon", bg: "bg-sage" },
};
const FIRST_IDEAS = 7;

/** Paso 1: para quién es y de qué va. Con el nombre y una frase basta para escribir el libro. */
export function StepIdea({
  ficha,
  genderChosen,
  onChange,
  onGender,
  onNext,
}: {
  ficha: Ficha;
  /** Ya ha dicho si es niño o niña: hasta entonces no se marca ninguno y no se sigue. */
  genderChosen: boolean;
  onChange: (f: Ficha) => void;
  onGender: (gender: Ficha["hero"]["gender"]) => void;
  onNext: () => void;
}) {
  const hero = ficha.hero;
  const setHero = (patch: Partial<Ficha["hero"]>) => onChange({ ...ficha, hero: { ...hero, ...patch } });
  const name = hero.name.trim();
  const canGo = name.length > 0 && genderChosen;
  const [allIdeas, setAllIdeas] = useState(false);
  const shown = allIdeas ? STARTERS : STARTERS.filter((s, i) => i < FIRST_IDEAS || s.id === ficha.starter);

  // la idea elegida de la lista sigue al nombre mientras no se toque a mano
  const setName = (v: string) => {
    const follows = ficha.starter && ficha.idea === starterIdea(ficha.starter, hero.name);
    onChange({ ...ficha, hero: { ...hero, name: v }, idea: follows ? (starterIdea(ficha.starter!, v) ?? ficha.idea) : ficha.idea });
  };
  const nameWidth = `calc(${Math.min(12, Math.max(hero.name ? 2.6 : 6.6, hero.name.length * 0.95 + 0.6))}ch + 30px)`;

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (canGo) onNext();
      }}
    >
      <section className="grid gap-5">
        <h2 className="sr-only">¿Para quién es el cuento?</h2>
        <p className="display m-0 text-[31px] leading-[1.55] sm:text-[44px]">
          Un cuento para{" "}
          <span className="whitespace-nowrap">
            <input
              className="madlib madlib-fit -ml-0.5"
              style={{ "--w": nameWidth } as React.CSSProperties}
              value={hero.name}
              maxLength={LIMITS.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="nombre"
              aria-label="Nombre"
              autoComplete="off"
              data-testid="hero-name"
              required
            />
            ,
          </span>{" "}
          <span className="whitespace-nowrap">
            que tiene{" "}
            <select className="madlib" value={hero.age} onChange={(e) => setHero({ age: Number(e.target.value) })} aria-label="Edad" data-testid="hero-age">
              {Array.from({ length: LIMITS.maxAge - LIMITS.minAge + 1 }, (_, i) => i + LIMITS.minAge).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>{" "}
            {hero.age === 1 ? "año." : "años."}
          </span>
        </p>
        <div className="grid gap-2.5">
          <span className="field-label" id="genero">
            ¿Es niño o niña? Así concordamos bien el texto
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="genero">
            {GENDERS.map((g) => {
              const on = genderChosen && hero.gender === g.id;
              return (
                <button type="button" key={g.id} aria-pressed={on} className={`chip ${on ? "chip-on" : ""}`} onClick={() => onGender(g.id)}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="display text-[28px] sm:text-[34px]">¿De qué va?</h2>
          <p className="text-ink-soft">Cuéntanoslo como a un amigo. Una frase basta; si lo prefieres, la ponemos nosotros.</p>
        </div>
        <div className="rounded-[22px] border-2 border-[#ece0cc] bg-card px-5 pt-4 pb-3 shadow-[0_18px_40px_-30px_rgba(35,32,54,0.5)] transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_5px_rgba(200,73,44,0.14)]">
          <AutoTextarea
            className="story ruled block min-h-[7em] w-full resize-none bg-transparent text-[19px] text-ink outline-none placeholder:text-ink-soft/50 focus-visible:outline-none"
            rows={4}
            value={ficha.idea}
            maxLength={LIMITS.idea}
            onChange={(e) => onChange({ ...ficha, idea: e.target.value })}
            placeholder="Vera construye un cohete con una caja de cartón y una noche despega de verdad hacia la Luna con su perro Toby."
            aria-label="De qué va el cuento"
            data-testid="idea"
          />
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-mute">
            <span>{ficha.idea ? "" : "Sin idea escribimos una historia original para este niño o niña."}</span>
            <span className="shrink-0">
              {ficha.idea.length} / {LIMITS.idea}
            </span>
          </div>
        </div>

        <div className="grid gap-2.5">
          <span className="field-label">O empieza con una idea</span>
          <div className="flex flex-wrap gap-2">
            {shown.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={ficha.starter === s.id}
                className={`chip ${ficha.starter === s.id ? "chip-on" : ""}`}
                onClick={() => onChange({ ...ficha, starter: s.id, idea: starterIdea(s.id, hero.name) ?? ficha.idea, tone: ficha.tone ?? s.tone })}
              >
                <span className={ficha.starter === s.id ? "text-star" : "text-accent"}>{Icon[STARTER_ICON[s.id] ?? "book"]({ size: 16 })}</span>
                {s.label}
              </button>
            ))}
            <button type="button" className={`chip ${!ficha.idea && !ficha.starter ? "chip-on" : ""}`} onClick={() => onChange({ ...ficha, idea: "", starter: undefined })} data-testid="surprise">
              <Sparkle size={14} />
              Sorpréndeme
            </button>
          </div>
          {!allIdeas && (
            <button type="button" className="link justify-self-start text-sm font-semibold" onClick={() => setAllIdeas(true)}>
              Más ideas
            </button>
          )}
        </div>

        <div className="grid gap-2.5">
          <span className="field-label">
            ¿Con qué tono? <span className="font-normal text-mute">Opcional</span>
          </span>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="Tono">
            {TONES.map((t) => {
              const on = ficha.tone === t.id;
              const look = TONE_LOOK[t.id];
              return (
                <button
                  type="button"
                  key={t.id}
                  aria-pressed={on}
                  className={`flex min-h-14 items-center gap-3 rounded-[18px] border-[1.5px] bg-card p-2 pr-3 text-left text-[15px] font-semibold transition-[border-color,box-shadow] ${on ? "border-accent shadow-[0_0_0_1.5px_var(--accent)]" : "border-[#e5d7c1] hover:border-ink/40"}`}
                  onClick={() => onChange({ ...ficha, tone: on ? undefined : t.id })}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink ${look.bg}`}>{Icon[look.icon]({ size: 18 })}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="actionbar">
        <button type="submit" className="btn-primary btn-lg w-full sm:w-auto" disabled={!canGo} data-testid="next-1">
          {canGo ? `Seguir: cómo es ${name}` : "Seguir"}
          <Icon.arrow />
        </button>
        <p className="w-full text-center text-[13px] text-mute sm:w-auto sm:text-left">
          {canGo ? "Gratis hasta la portada · Sin fotos" : !name ? (genderChosen ? "Falta el nombre." : "Faltan el nombre y si es niño o niña.") : "Falta decir si es niño o niña."}
        </p>
      </div>
    </form>
  );
}
