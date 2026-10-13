"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fichaHash, normalizeFicha } from "@/lib/plan/ficha";
import type { Ficha, Plan, PlanPage, PlanRecord } from "@/lib/plan/types";
import { postJson } from "@/lib/bookClient";
import { AutoTextarea } from "./AutoTextarea";

const WRITING = ["Leyendo la idea…", "Pensando el arranque…", "Repartiendo los detalles…", "Escribiendo las doce páginas…", "Buscando el final…", "Repasando el texto…"];

/**
 * Paso 3: el cuento escrito en 12 tarjetas (texto + qué se verá). Se puede cambiar el texto a mano, pedir el cambio de una
 * página con una frase o pedir otra versión entera. Escribirlo cuesta ≈ 4–8 c y tarda 20–45 s (medido el 13 oct).
 */
export function StepStory({
  ficha,
  record,
  onRecord,
  onFicha,
  onBack,
  onNext,
}: {
  ficha: Ficha;
  record?: PlanRecord;
  onRecord: (r: PlanRecord) => void;
  onFicha: (f: Ficha) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const clean = normalizeFicha(ficha);
  const hash = fichaHash(clean);
  const stale = !record || record.fichaHash !== hash;
  const [state, setState] = useState<"idle" | "writing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const inFlight = useRef<string | null>(null);

  const write = useCallback(async () => {
    if (inFlight.current === hash) return;
    inFlight.current = hash;
    setState("writing");
    setError(null);
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const { status, json } = await postJson<{ record?: PlanRecord }>("/api/plan", { ficha: clean });
      if (status === 200 && json.record) {
        onRecord(json.record);
        setState("idle");
      } else {
        setError(json.message ?? "No hemos podido escribir el cuento. Inténtalo de nuevo.");
        setState("error");
      }
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
      setState("error");
    } finally {
      clearInterval(timer);
      inFlight.current = null;
    }
  }, [clean, hash, onRecord]);

  useEffect(() => {
    // escribir al entrar si el cuento no corresponde a la ficha actual (o no hay)
    if (!stale || state !== "idle") return;
    const t = setTimeout(() => void write(), 0);
    return () => clearTimeout(t);
  }, [stale, state, write]);

  const plan = record?.plan;
  const setPlan = (p: Plan) => record && onRecord({ ...record, plan: p });
  const setPage = (n: number, patch: Partial<PlanPage>) => plan && setPlan({ ...plan, pages: plan.pages.map((p) => (p.n === n ? { ...p, ...patch } : p)) });

  if (stale || !plan) {
    return (
      <div className="grid gap-6" aria-live="polite">
        <h2 className="display text-3xl sm:text-4xl">Escribiendo el cuento de {clean.hero.name}</h2>
        {state === "error" ? (
          <div className="grid gap-4">
            <p className="notice">{error}</p>
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={onBack}>
                Atrás
              </button>
              <button className="btn-primary" onClick={() => void write()}>
                Intentarlo otra vez
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" data-testid="writing">
            <p className="text-lg">{WRITING[Math.min(WRITING.length - 1, Math.floor(elapsed / 6))]}</p>
            <div className="h-1 w-full overflow-hidden rounded bg-line">
              <div className="h-full bg-accent transition-[width] duration-1000" style={{ width: `${Math.min(95, (elapsed / 40) * 100)}%` }} />
            </div>
            <p className="text-sm text-ink-soft">Suele tardar entre 20 y 45 segundos. {elapsed > 0 ? `${elapsed} s` : ""}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <p className="text-sm text-ink-soft">El cuento, página a página. Cambia lo que quieras: el texto se edita aquí mismo y cada página se puede rehacer con una frase.</p>
        <input className="input display !text-3xl sm:!text-4xl" value={plan.title} maxLength={120} onChange={(e) => setPlan({ ...plan, title: e.target.value })} aria-label="Título" data-testid="plan-title" />
        <label className="grid gap-1">
          <span className="field-label">Dedicatoria</span>
          <textarea className="story min-h-16 w-full rounded-[6px] border border-line bg-card p-3 italic leading-relaxed outline-none focus:border-ink" value={plan.dedication} maxLength={400} onChange={(e) => setPlan({ ...plan, dedication: e.target.value })} />
        </label>
        {plan.notices.length > 0 && (
          <div className="notice grid gap-1">
            {plan.notices.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}
      </div>

      <ol className="grid gap-4" data-testid="plan-pages">
        {plan.pages.map((p) => (
          <PageCard key={p.n} page={p} ficha={clean} plan={plan} onText={(text) => setPage(p.n, { text })} onReplace={(np) => setPage(p.n, np)} />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={onBack}>
          Atrás
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            if (confirm("¿Escribimos otra versión del cuento? Se pierden los cambios de esta.")) onFicha({ ...ficha, seed: (ficha.seed ?? 0) + 1 });
          }}
        >
          Escribirlo de otra manera
        </button>
        <button className="btn-primary" onClick={onNext} data-testid="next-3">
          Así está bien, seguir
        </button>
      </div>
    </div>
  );
}

function PageCard({ page, ficha, plan, onText, onReplace }: { page: PlanPage; ficha: Ficha; plan: Plan; onText: (t: string) => void; onReplace: (p: PlanPage) => void }) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { status, json } = await postJson<{ page?: PlanPage }>("/api/plan/page", { ficha, plan, n: page.n, instruction: ask });
      if (status === 200 && json.page) {
        onReplace(json.page);
        setOpen(false);
        setAsk("");
      } else setErr(json.message ?? "No se ha podido cambiar. Prueba a pedirlo de otra manera.");
    } catch {
      setErr("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card grid gap-3" data-testid={`page-${page.n}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.12em] text-ink-soft">Página {page.n}</span>
        <button className="text-sm text-accent underline-offset-2 hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancelar" : "Cambiar esta página"}
        </button>
      </div>
      <AutoTextarea
        className="story min-h-24 w-full resize-none rounded-[6px] border border-transparent bg-transparent p-0 text-lg leading-relaxed outline-none focus:border-line focus:p-2"
        value={page.text}
        maxLength={1500}
        onChange={(e) => onText(e.target.value)}
        aria-label={`Texto de la página ${page.n}`}
      />
      <p className="text-sm text-ink-soft">
        <span className="font-medium text-ink">Se verá: </span>
        {page.scene}
      </p>
      {open && (
        <form onSubmit={submit} className="grid gap-2 border-t border-line pt-3">
          <label className="grid gap-1">
            <span className="field-label">¿Qué quieres cambiar?</span>
            <input className="input" value={ask} maxLength={300} onChange={(e) => setAsk(e.target.value)} placeholder="que salga su prima Lola; que sea de noche; más corto" autoFocus />
          </label>
          <div className="flex items-center gap-3">
            <button className="btn-primary btn-sm" disabled={busy || !ask.trim()}>
              {busy ? "Reescribiendo…" : "Cambiar"}
            </button>
            {err && <span className="text-sm text-[#8a2a1c]">{err}</span>}
          </div>
        </form>
      )}
    </li>
  );
}
