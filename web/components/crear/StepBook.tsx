"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookJobView, BookView } from "@/lib/book/service";
import { errorMessage, fetchView, postJson, runJobs, type JobOutcome } from "@/lib/bookClient";
import { PRICE_ILLUSTRATED } from "@/lib/pricing";
import type { Plan, PlanPage } from "@/lib/plan/types";
import { AutoTextarea } from "./AutoTextarea";
import { BookImage } from "./BookImage";
import { BookLink } from "./BookLink";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPage = (j: BookJobView) => j.kind === "page";
const inFlight = (j: BookJobView) => j.status === "pending" || j.status === "running";

/** Alguna página no tiene una ilustración de su escena actual hecha o en marcha: hay que pedirla. */
function needsRequest(v: BookView): boolean {
  return v.plan.pages.some((p) => !v.jobs.some((j) => isPage(j) && j.page === p.n && j.current && j.status !== "failed"));
}

function paintingCopy(v: BookView | null): string {
  if (!v?.background) return "Pintando las páginas: tarda unos minutos. Deja esta pestaña abierta hasta que terminen.";
  return `Pintando las páginas: tarda unos minutos. Puedes cerrar esta pestaña: seguimos pintando${v.mail ? " y te avisamos por email cuando esté" : ""}, y con tu enlace vuelves al libro.`;
}

/**
 * Paso 5: el libro. Antes del pago, la portada y las 12 páginas veladas con el precio. Tras el pago, las 12
 * ilustraciones (el servidor las pinta en segundo plano y el navegador, si sigue abierto, también tira de ellas),
 * revisión página a página con una versión más incluida, y el PDF.
 * `confirming`: se vuelve de Stripe (?pagado=1) y el webhook puede tardar unos segundos en registrar el pago.
 */
export function StepBook({ bookId, confirming = false, onBack, onPlan }: { bookId: string; confirming?: boolean; onBack: () => void; onPlan: (p: Plan) => void }) {
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

  /** Tira de las páginas en cola o pintándose hasta que terminan. */
  const drive = useCallback(
    async (label?: string) => {
      const v = await refresh();
      const ids = (v?.jobs ?? []).filter((j) => isPage(j) && inFlight(j)).map((j) => j.id);
      if (ids.length === 0) return;
      setBusy(label ?? paintingCopy(v));
      const outcomes: JobOutcome[] = [];
      await runJobs(ids, 3, (_, o) => {
        outcomes.push(o);
        void refresh();
      }, cancel.current);
      await refresh();
      setBusy(null);
      if (outcomes.includes("budget")) setError(errorMessage({ error: "budget", reason: "diario" }));
    },
    [refresh],
  );

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
      await drive(body.page ? `Pintando otra versión de la página ${body.page}…` : undefined);
      setBusy(null);
    },
    [bookId, drive],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const c = cancel.current;
    void (async () => {
      let v = await refresh();
      if (!v) return;
      if (!v.paid && confirming) {
        // vuelta de Stripe: el webhook registra el pago en unos segundos
        setBusy("Confirmando el pago…");
        for (let i = 0; i < 40 && !v.paid && !c.cancelled; i++) {
          await sleep(3000);
          v = (await refresh()) ?? v;
        }
        setBusy(null);
        if (!v.paid) {
          setError("El pago aún no nos ha llegado. Si ya se ha cobrado, el libro aparecerá aquí en unos minutos: recarga esta página o vuelve con tu enlace.");
          return;
        }
      }
      if (!v.paid) return;
      // con Stripe las páginas las encola el webhook: se le da un momento antes de pedirlas desde aquí
      if (v.payment === "stripe" && !v.jobs.some(isPage)) {
        setBusy("Preparando las ilustraciones…");
        for (let i = 0; i < 15 && !v.jobs.some(isPage) && !c.cancelled; i++) {
          await sleep(3000);
          v = (await refresh()) ?? v;
        }
        setBusy(null);
      }
      if (c.cancelled) return;
      if (needsRequest(v)) await paintPages();
      else await drive();
    })();
  }, [confirming, drive, paintPages, refresh]);

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

      {!view.paid && !busy && <Paywall bookId={bookId} payment={view.payment ?? "none"} onPaid={() => void paintPages()} />}
      {/* el aviso se va en cuanto el libro está completo (el navegador puede seguir unos segundos esperando a jobs que ya ha terminado el servidor) */}
      {busy && !(view.paid && allDone && !busy.startsWith("Pintando otra versión")) && (
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

      <BookLink bookId={bookId} mail={view.mail} />

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

function Paywall({ bookId, payment, onPaid }: { bookId: string; payment: NonNullable<BookView["payment"]>; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card grid gap-3" data-testid="paywall">
      <p className="display text-2xl">Edición ilustrada · {PRICE_ILLUSTRATED}</p>
      <p className="text-ink-soft">Doce ilustraciones con tus personajes, revisión página a página (una versión más de cada ilustración incluida) y el PDF para imprimir en casa en A4.</p>
      {payment === "stripe" && (
        <>
          <button
            className="btn-primary justify-self-start"
            disabled={busy}
            data-testid="pay"
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const r = await postJson<{ url?: string }>("/api/libro/checkout", { bookId });
              if (r.status === 200 && r.json.url) {
                window.location.assign(r.json.url);
                return;
              }
              setBusy(false);
              setErr(errorMessage(r.json));
            }}
          >
            {busy ? "Abriendo el pago…" : `Pagar ${PRICE_ILLUSTRATED}`}
          </button>
          <p className="text-xs text-ink-soft">Pago seguro con Stripe. Al terminar vuelves aquí y empezamos a pintar.</p>
        </>
      )}
      {payment === "dry-run" && (
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
      )}
      {payment === "none" && <p className="text-sm text-ink-soft">El pago estará disponible muy pronto. Tu libro queda guardado 30 días en tu enlace.</p>}
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
