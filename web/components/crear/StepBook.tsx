"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookJobView, BookView } from "@/lib/book/service";
import { errorMessage, fetchView, postJson, runJobs } from "@/lib/bookClient";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { PRICE_ILLUSTRATED } from "@/lib/pricing";
import type { Plan, PlanPage } from "@/lib/plan/types";
import { AutoTextarea } from "./AutoTextarea";
import { BookImage } from "./BookImage";

/**
 * Paso 5: el libro. Antes del pago, la portada y las 12 páginas veladas con el precio. Tras el pago, las 12
 * ilustraciones (tres a la vez), revisión página a página con una versión más incluida, y el PDF.
 */
export function StepBook({ bookId, onBack, onPlan }: { bookId: string; onBack: () => void; onPlan: (p: Plan) => void }) {
  const [view, setView] = useState<BookView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef({ cancelled: false });
  useEffect(() => {
    const c = cancel.current;
    return () => {
      c.cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const v = await fetchView(bookId);
    if (v) setView(v);
    return v;
  }, [bookId]);

  const paintPages = useCallback(
    async (body: { page?: number } = {}) => {
      setError(null);
      setBusy(body.page ? `Pintando otra versión de la página ${body.page}…` : "Preparando las ilustraciones…");
      const r = await postJson<{ jobs?: string[] }>("/api/libro/pages", { bookId, ...body });
      if (r.status !== 200 || !r.json.jobs) {
        setBusy(null);
        setError(errorMessage(r.json));
        return;
      }
      await refresh();
      const pending = r.json.jobs;
      if (!body.page) setBusy(`Pintando las páginas: tarda unos minutos. Puedes cerrar esta pestaña; el libro te espera en el enlace del email.`);
      // las que ya existían a medias también se terminan
      const v = await fetchView(bookId);
      const resume = (v?.jobs ?? []).filter((j) => j.kind === "page" && (j.status === "pending" || j.status === "running") && !pending.includes(j.id)).map((j) => j.id);
      await runJobs([...pending, ...resume], 3, () => void refresh(), cancel.current);
      await refresh();
      setBusy(null);
    },
    [bookId, refresh],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const v = await refresh();
      // pagado y con páginas por pintar (primera vez o pestaña cerrada a medias)
      if (v?.paid) {
        const missing = Object.values(v.chosen.pages).some((id) => !id) || v.jobs.some((j) => j.kind === "page" && (j.status === "pending" || j.status === "running"));
        if (missing) await paintPages();
      }
    })();
  }, [paintPages, refresh]);

  if (!view) return <p className="text-ink-soft">Cargando el libro…</p>;
  const { plan } = view;
  const byId = new Map(view.jobs.map((j) => [j.id, j]));
  const cover = view.chosen.cover ? byId.get(view.chosen.cover) : undefined;
  const allDone = Object.values(view.chosen.pages).every(Boolean);

  const setText = (n: number, text: string) => {
    const next = { ...plan, pages: plan.pages.map((p) => (p.n === n ? { ...p, text } : p)) };
    setView({ ...view, plan: next });
    onPlan(next);
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h2 className="display text-3xl sm:text-4xl">{plan.title}</h2>
        <p className="text-ink-soft">{view.paid ? "Tu libro ilustrado. Revisa cada página: el texto se puede retocar y cada ilustración admite una versión más." : "Así queda el libro: portada, dedicatoria y doce páginas ilustradas con la hoja que has aprobado."}</p>
      </div>
      <BookImage job={cover} alt="Portada" title={plan.title} testId="book-cover" />

      {!view.paid && <Paywall bookId={bookId} onPaid={() => void paintPages()} />}
      {busy && (
        <p className="notice" aria-live="polite" data-testid="pages-busy">
          {busy}
        </p>
      )}
      {error && <p className="notice !text-[#8a2a1c]">{error}</p>}

      <ol className="grid gap-8">
        {plan.pages.map((p) => (
          <PageView
            key={p.n}
            page={p}
            paid={view.paid}
            jobs={view.jobs.filter((j) => j.kind === "page" && j.page === p.n)}
            chosen={view.chosen.pages[p.n] ?? null}
            disabled={!!busy}
            onText={(t) => setText(p.n, t)}
            onChoose={async (jobId) => {
              const r = await postJson("/api/libro/page", { bookId, jobId });
              if (r.status === 200) await refresh();
            }}
            onAnother={() => void paintPages({ page: p.n })}
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={onBack}>
          Volver a los personajes
        </button>
        {view.paid && allDone ? (
          <a className="btn-primary" href={`/api/libro/pdf?b=${bookId}&kind=full`} data-testid="full-pdf">
            Descargar el libro en PDF
          </a>
        ) : (
          <a className="link text-sm" href={`/api/libro/pdf?b=${bookId}&kind=free`}>
            Descargar gratis el cuento en PDF (portada + texto)
          </a>
        )}
      </div>
    </div>
  );
}

function Paywall({ bookId, onPaid }: { bookId: string; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card grid gap-3" data-testid="paywall">
      <p className="display text-2xl">Edición ilustrada · {PRICE_ILLUSTRATED}</p>
      <p className="text-ink-soft">Doce ilustraciones con tus personajes, revisión página a página (una versión más de cada ilustración incluida) y el PDF para imprimir en casa en A4.</p>
      {DRY_RUN_PAYMENT ? (
        <button
          className="btn-primary justify-self-start"
          disabled={busy}
          data-testid="pay"
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await postJson("/api/libro/pay", { bookId });
            setBusy(false);
            if (r.status === 200) onPaid();
            else setErr(errorMessage(r.json));
          }}
        >
          {busy ? "Procesando…" : `Pagar ${PRICE_ILLUSTRATED} (pago de prueba)`}
        </button>
      ) : (
        <p className="text-sm text-ink-soft">El pago estará disponible muy pronto. Te avisaremos por email; tu libro queda guardado 30 días.</p>
      )}
      {err && <p className="text-sm text-[#8a2a1c]">{err}</p>}
    </div>
  );
}

function PageView({
  page,
  paid,
  jobs,
  chosen,
  disabled,
  onText,
  onChoose,
  onAnother,
}: {
  page: PlanPage;
  paid: boolean;
  jobs: BookJobView[];
  chosen: string | null;
  disabled: boolean;
  onText: (t: string) => void;
  onChoose: (jobId: string) => void;
  onAnother: () => void;
}) {
  const current = jobs.filter((j) => j.current);
  const shown = current.find((j) => j.id === chosen) ?? current[current.length - 1];
  const done = current.filter((j) => j.status === "done");
  const canAnother = paid && jobs.length < 3 && done.length > 0 && done.length < 2;
  return (
    <li className="grid gap-3" data-testid={`book-page-${page.n}`}>
      {paid ? (
        <BookImage job={shown} alt={`Ilustración de la página ${page.n}`} />
      ) : (
        <div className="relative grid aspect-[3/2] w-full place-items-center overflow-hidden rounded-[6px] border border-line bg-paper-deep">
          <span className="px-6 text-center text-sm text-ink-soft">{page.scene}</span>
        </div>
      )}
      {paid && done.length > 1 && (
        <div className="flex gap-2">
          {done.map((j) => (
            <button key={j.id} className={`chip ${j.id === shown?.id ? "chip-on" : ""}`} onClick={() => onChoose(j.id)}>
              Versión {j.variant}
            </button>
          ))}
        </div>
      )}
      <AutoTextarea
        className="story min-h-20 w-full resize-none rounded-[6px] border border-transparent bg-transparent p-0 text-lg leading-relaxed outline-none focus:border-line focus:p-2"
        value={page.text}
        maxLength={1500}
        onChange={(e) => onText(e.target.value)}
        aria-label={`Texto de la página ${page.n}`}
      />
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>Página {page.n}</span>
        {canAnother && (
          <button className="text-sm text-accent underline-offset-2 hover:underline disabled:opacity-40" disabled={disabled} onClick={onAnother}>
            Otra versión de esta ilustración
          </button>
        )}
      </div>
    </li>
  );
}
