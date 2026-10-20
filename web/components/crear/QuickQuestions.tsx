"use client";

import { useState } from "react";
import { Icon } from "@/components/brand";
import { LIMITS } from "@/lib/plan/ficha";
import { emptyQuickAnswers, quickDetails, quickQuestions, type QuickAnswers, type QuickId } from "@/lib/plan/quick";

/**
 * «Tres preguntas rápidas» antes de escribir, cuando la ficha no trae nada del niño (lib/plan/quick.ts). Una pantalla,
 * todo opcional y con salida siempre visible: «Escríbelo ya».
 */
export function QuickQuestions({ name, age, onDone, onSkip, onBack }: { name: string; age: number; onDone: (details: string[]) => void; onSkip: () => void; onBack: () => void }) {
  const [a, setA] = useState<QuickAnswers>(emptyQuickAnswers);
  const questions = quickQuestions(age);
  const added = quickDetails(age, a);
  const set = (id: QuickId, patch: Partial<QuickAnswers[QuickId]>) => setA((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  const toggle = (id: QuickId, chip: string) => set(id, { chips: a[id].chips.includes(chip) ? a[id].chips.filter((c) => c !== chip) : [...a[id].chips, chip] });

  return (
    <form
      className="grid gap-8"
      data-testid="quick"
      onSubmit={(e) => {
        e.preventDefault();
        if (added.length) onDone(added);
        else onSkip();
      }}
    >
      <div className="grid gap-2">
        <button type="button" className="inline-flex items-center gap-1 justify-self-start text-sm font-semibold text-accent-deep hover:underline" onClick={onBack}>
          <Icon.back size={14} />
          Volver a cómo es
        </button>
        <h2 className="display text-[32px] sm:text-[42px]">Tres preguntas sobre {name}</h2>
        <p className="text-ink-soft">Es lo que hace que el cuento sea suyo y no de cualquiera. Contesta lo que quieras, en un minuto.</p>
      </div>

      {questions.map((q, i) => (
        <section key={q.id} className="card grid gap-4 p-5 sm:p-7" aria-labelledby={`quick-${q.id}`}>
          <h3 id={`quick-${q.id}`} className="display flex items-baseline gap-3 text-[22px] sm:text-[26px]">
            <span aria-hidden className="hand text-[20px] text-accent">
              {i + 1}
            </span>
            {q.ask.replace("{nombre}", name)}
          </h3>
          {q.chips.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={q.ask.replace("{nombre}", name)}>
              {q.chips.map((c) => {
                const on = a[q.id].chips.includes(c);
                return (
                  <button type="button" key={c} aria-pressed={on} className={`chip ${on ? "chip-on" : ""}`} onClick={() => toggle(q.id, c)}>
                    {on && <Icon.check size={13} />}
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <input
            className="input"
            aria-label={q.chips.length ? `${q.ask.replace("{nombre}", name)}, en tus palabras` : q.ask.replace("{nombre}", name)}
            value={a[q.id].text}
            maxLength={LIMITS.detail}
            placeholder={q.placeholder}
            onChange={(e) => set(q.id, { text: e.target.value })}
            data-testid={`quick-${q.id}`}
          />
        </section>
      ))}

      <div className="actionbar">
        <button type="submit" className="btn-primary btn-lg w-full sm:w-auto" data-testid="quick-go">
          <Icon.pencil />
          {added.length ? "Escribir el cuento" : "Escribir sin esto"}
        </button>
        {added.length > 0 ? (
          <button type="button" className="link w-full text-center text-[14px] font-semibold sm:w-auto" onClick={onSkip} data-testid="quick-skip">
            Escríbelo ya, sin esto
          </button>
        ) : (
          <p className="w-full text-center text-[13px] text-mute sm:w-auto sm:text-left">Sin respuestas también lo escribimos.</p>
        )}
      </div>
    </form>
  );
}
