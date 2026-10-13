"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { StepIdea } from "@/components/crear/StepIdea";
import { StepHero } from "@/components/crear/StepHero";
import { StepStory } from "@/components/crear/StepStory";
import { StepCast } from "@/components/crear/StepCast";
import { StepBook } from "@/components/crear/StepBook";
import { fetchView, postJson } from "@/lib/bookClient";
import { fichaHash } from "@/lib/plan/ficha";
import { resetCrear, setCrear, useCrear, type CrearState, type Step } from "@/lib/crearStore";
import type { Plan } from "@/lib/plan/types";

/**
 * /crear (B2): el padre cuenta la historia que quiere y nosotros hacemos el libro.
 *   1 La idea · 2 Quién · 3 El cuento · 4 Los personajes (email) · 5 El libro (pago)
 * /crear?b=<bookId> recupera un libro guardado (enlace del email).
 */
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "La idea" },
  { n: 2, label: "Quién" },
  { n: 3, label: "El cuento" },
  { n: 4, label: "Personajes" },
  { n: 5, label: "El libro" },
];

export default function CrearPage() {
  return (
    <Suspense fallback={null}>
      <Crear />
    </Suspense>
  );
}

function Crear() {
  const s = useCrear();
  const params = useSearchParams();
  const b = params.get("b");
  const [recovering, setRecovering] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // recuperar un libro por enlace
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!b || !/^[a-z0-9]{8,16}$/.test(b) || tried.current === b) return;
    tried.current = b;
    setRecovering(b);
    void fetchView(b).then((v) => {
      setRecovering(null);
      if (!v) {
        setNotice("Este enlace ya no es válido. Guardamos los libros 30 días.");
        return;
      }
      setCrear((prev) => ({
        v: 2,
        step: v.paid || v.approvedSheetJobId ? 5 : 4,
        ficha: v.ficha,
        record: { plan: v.plan, provider: "guardado", model: "", fichaHash: fichaHash(v.ficha), createdAt: Date.now() },
        bookId: v.bookId,
        email: prev.email,
      }));
      setNotice("Libro recuperado.");
    });
  }, [b]);

  // tras el email, los textos editados se guardan en el libro (con un respiro entre teclas)
  const plan = s?.record?.plan;
  const bookId = s?.bookId;
  const saved = useRef<string>("");
  useEffect(() => {
    if (!bookId || !plan) return;
    const json = JSON.stringify(plan);
    if (!saved.current) {
      saved.current = json;
      return;
    }
    if (json === saved.current) return;
    const t = setTimeout(() => {
      saved.current = json;
      void postJson("/api/libro/plan", { bookId, plan });
    }, 1200);
    return () => clearTimeout(t);
  }, [bookId, plan]);

  if (!s || recovering) return null;
  const go = (step: Step) => {
    setCrear((x) => ({ ...x, step }));
    window.scrollTo({ top: 0 });
  };
  const update = (patch: Partial<CrearState>) => setCrear((x) => ({ ...x, ...patch }));
  const maxStep: Step = s.bookId ? 5 : s.record ? 3 : s.ficha.hero.name ? 2 : 1;

  return (
    <main className="min-h-dvh pb-24">
      <SiteHeader>
        <button
          className="text-sm text-ink-soft underline-offset-2 hover:underline"
          onClick={() => {
            if (confirm("¿Empezar un cuento nuevo? Este se queda guardado en el enlace del email, si lo pediste.")) resetCrear();
          }}
        >
          Empezar otro
        </button>
      </SiteHeader>
      <nav aria-label="Pasos" className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-3 text-[13px] text-ink-soft">
          {STEPS.map((x, i) => (
            <li key={x.n} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>·</span>}
              <button
                className={`${x.n === s.step ? "font-medium text-ink" : ""} disabled:opacity-50`}
                disabled={x.n > Math.max(maxStep, s.step) || (x.n >= 4 && !s.record)}
                aria-current={x.n === s.step ? "step" : undefined}
                onClick={() => go(x.n)}
              >
                {x.n}. {x.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="mx-auto mt-8 w-full max-w-3xl px-4 sm:px-6">
        {notice && <p className="notice mb-6">{notice}</p>}
        {s.step === 1 && <StepIdea ficha={s.ficha} onChange={(ficha) => update({ ficha })} onNext={() => go(2)} />}
        {s.step === 2 && <StepHero ficha={s.ficha} onChange={(ficha) => update({ ficha })} onBack={() => go(1)} onNext={() => go(3)} />}
        {s.step === 3 && (
          <StepStory
            ficha={s.ficha}
            record={s.record}
            onRecord={(record) => update({ record })}
            onFicha={(ficha) => update({ ficha })}
            onBack={() => go(2)}
            onNext={() => go(4)}
          />
        )}
        {s.step === 4 && s.record && (
          <StepCast
            ficha={s.ficha}
            record={s.record}
            bookId={s.bookId}
            email={s.email}
            onBook={(id, email) => update({ bookId: id, email })}
            onBack={() => go(3)}
            onNext={() => go(5)}
          />
        )}
        {s.step === 5 && s.bookId && <StepBook bookId={s.bookId} onBack={() => go(4)} onPlan={(p: Plan) => s.record && update({ record: { ...s.record, plan: p } })} />}
      </div>
    </main>
  );
}
