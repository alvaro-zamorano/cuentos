"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BookJobView, BookView } from "@/lib/book/service";
import { track } from "@/lib/analytics";
import { errorMessage, fetchView, postJson, runJobs, type JobOutcome } from "@/lib/bookClient";
import { MAX_PAGE_REDOS, REDO_NOTE_MAX, REDO_REASONS, type RedoReason } from "@/lib/book/feedback";
import type { Plan, PlanPage } from "@/lib/plan/types";
import { EDITION_LABEL, PRICE_CENTS, eur } from "@/lib/print/prices";
import { LOCKED_PRINT_STATUSES, type PaidEdition } from "@/lib/print/types";
import { BookCover, BookSpread, Icon, Moon, Sparkle } from "@/components/brand";
import { AutoTextarea } from "./AutoTextarea";
import { Book3D } from "@/components/book3d/Book3D";
import type { Book3DData } from "@/lib/book3d/scene";
import { BookImage } from "./BookImage";
import { BookLink } from "./BookLink";
import { PrintPanel } from "./PrintPanel";
import { UpgradeCard } from "./UpgradeCard";
import { ShippingForm, type ShippingDraft } from "./ShippingForm";
import { ErrorNote, Status } from "./ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPage = (j: BookJobView) => j.kind === "page";
/** Lo que el navegador ayuda a pintar tras el pago: las páginas y los retratos de la página de personajes. */
const isPaid = (j: BookJobView) => j.kind === "page" || j.kind === "portrait";
const inFlight = (j: BookJobView) => j.status === "pending" || j.status === "running";

/** Alguna página no tiene una ilustración de su escena actual hecha o en marcha: hay que pedirla. */
function needsRequest(v: BookView): boolean {
  return v.plan.pages.some((p) => !v.jobs.some((j) => isPage(j) && j.page === p.n && j.current && j.status !== "failed")) || (v.paid && v.portraitsToRequest);
}

function paintingCopy(v: BookView | null): string {
  if (!v?.background) return "Pintando las páginas: tarda unos minutos. Deja esta pestaña abierta hasta que terminen.";
  return `Pintando las páginas: tarda unos minutos. Puedes cerrar esta pestaña: seguimos pintando${v.mail ? " y te avisamos por email cuando esté" : ""}, y con tu enlace vuelves al libro.`;
}

/**
 * Paso 5: el libro. Antes del pago, la portada y las 12 páginas veladas con el precio. Tras el pago, las 12
 * ilustraciones (el servidor las pinta en segundo plano y el navegador, si sigue abierto, también tira de ellas),
 * revisión página a página (otra versión con motivo, hasta dos por página; después, «Sigue sin estar bien»), y el PDF.
 * `confirming`: se vuelve de Stripe (?pagado=1) y el webhook puede tardar unos segundos en registrar el pago.
 */
export function StepBook({ bookId, confirming = false, upgrading = false, onPlan }: { bookId: string; confirming?: boolean; upgrading?: boolean; onPlan: (p: Plan) => void }) {
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
      const ids = (v?.jobs ?? []).filter((j) => isPaid(j) && inFlight(j)).map((j) => j.id);
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
    async (body: { page?: number; reason?: RedoReason; note?: string } = {}) => {
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
      if (confirming && !upgrading) trackPaid(bookId, v.edition ?? "illustrated");
      if (upgrading && v.edition !== "hardcover") {
        // vuelta de Stripe tras pasar a tapa dura: el webhook crea el pedido en unos segundos
        setBusy("Confirmando el pago de la tapa dura…");
        for (let i = 0; i < 40 && v.edition !== "hardcover" && !c.cancelled; i++) {
          await sleep(3000);
          v = (await refresh()) ?? v;
        }
        setBusy(null);
        if (v.edition !== "hardcover") setError("El pago de la tapa dura aún no nos ha llegado. Si ya se ha cobrado, aparecerá aquí en unos minutos: recarga esta página o vuelve con tu enlace.");
      }
      if (upgrading && v.edition === "hardcover") trackPaid(bookId, "mejora");
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
  }, [bookId, confirming, upgrading, drive, paintPages, refresh]);

  if (!view)
    return (
      <div className="grid gap-6" aria-busy="true">
        <div className="shimmer h-10 w-3/4 rounded-2xl" />
        <div className="shimmer mx-auto aspect-[4/3] w-[280px] rounded-[10px]" />
      </div>
    );
  const { plan } = view;
  const byId = new Map(view.jobs.map((j) => [j.id, j]));
  const cover = view.chosen.cover ? byId.get(view.chosen.cover) : undefined;
  // el libro está listo cuando lo están las 12 páginas y no queda ningún retrato pintándose (si falla, va la hoja)
  const allDone = Object.values(view.chosen.pages).every(Boolean) && !view.jobs.some((j) => j.kind === "portrait" && j.current && inFlight(j));
  const pagesDone = Object.values(view.chosen.pages).filter(Boolean).length;
  const name = view.ficha.hero.name.trim();

  const setText = (n: number, text: string) => {
    const next = { ...plan, pages: plan.pages.map((p) => (p.n === n ? { ...p, text } : p)) };
    setView({ ...view, plan: next });
    onPlan(next);
  };
  const showBusy = busy && !(view.paid && allDone && !busy.startsWith("Pintando otra versión"));
  const locked = !!view.print && LOCKED_PRINT_STATUSES.includes(view.print.status);
  const hardcover = view.edition === "hardcover";
  // El libro en 3D: antes de pagar, si se vende la tapa dura aquí (su portada y las páginas por pintar); con la tapa
  // dura pagada y las doce páginas hechas, la última revisión antes de mandarlo a la imprenta.
  const show3D = view.paid ? hardcover && allDone : !!view.printMode && view.printMode !== "none";
  const sheetUrl = view.chosen.sheet ? byId.get(view.chosen.sheet)?.url : null;
  const book3D: Book3DData = {
    title: plan.title,
    name,
    from: view.ficha.from?.trim() || undefined,
    dedication: plan.dedication,
    coverUrl: cover?.url ?? null,
    sheetUrl: sheetUrl ?? null,
    sheetKey: view.chosen.sheet,
    locked: !view.paid,
    pages: plan.pages.map((p) => {
      const chosen = view.chosen.pages[p.n];
      const url = view.paid && chosen ? byId.get(chosen)?.url ?? null : null;
      return { n: p.n, text: p.text, scene: p.scene, imageUrl: url, imageKey: url ? chosen : null };
    }),
  };
  const coverEl = (tilt: number, className: string) => (
    <BookCover name={name} title={plan.title} from={view.ficha.from?.trim()} tilt={tilt} className={className} image={<BookImage job={cover} alt="Portada" testId="book-cover" box="absolute inset-0 overflow-hidden" />} />
  );

  /** «Mandar a imprimir»: guarda los textos tal como están, lo manda y espera a que la imprenta lo acepte. */
  const sendToPrint = async (): Promise<string | null> => {
    const saved = await postJson("/api/libro/plan", { bookId, plan });
    if (saved.status !== 200) return errorMessage(saved.json);
    const r = await postJson("/api/libro/print", { bookId });
    if (r.status !== 200) return errorMessage(r.json);
    let v = await refresh();
    for (let i = 0; i < 80 && v?.print?.status === "sending" && !cancel.current.cancelled; i++) {
      await sleep(3000);
      v = (await refresh()) ?? v;
    }
    return null;
  };

  return (
    <div className="grid gap-8">
      <div className={`grid items-center gap-7 ${show3D ? "" : "sm:grid-cols-[1fr_300px] sm:gap-10"}`}>
        <div className="grid gap-2">
          <p className="hand text-[20px] text-accent">{view.paid ? (locked ? "su libro, en marcha" : allDone ? "su libro, terminado" : "pintando su libro") : "así queda"}</p>
          <h2 className="display text-[32px] sm:text-[42px]">{plan.title}</h2>
          <p className="text-ink-soft">
            {view.paid
              ? locked
                ? "Así va impreso. Ya no se puede cambiar."
                : `Tu libro${hardcover ? " de tapa dura" : " ilustrado"}. Revisa cada página: el texto se puede retocar y, si una ilustración no te convence, dinos qué cambiar y pintamos otra.`
              : "Portada, dedicatoria y doce páginas, que se pintarán con la hoja que has aprobado."}
          </p>
        </div>
        {!show3D && coverEl(2, "w-[280px] justify-self-center sm:w-full")}
      </div>

      {show3D && (
        <section className="grid gap-2" aria-label="El libro en 3D" data-testid="book3d-section">
          <p className="hand m-0 text-center text-[20px] text-accent">{view.paid ? (locked ? "así va impreso" : "así quedará impreso") : "así será en tapa dura"}</p>
          <Book3D data={book3D} poster={coverEl(0, "w-full")} hint={view.paid ? "Arrastra para girarlo · toca para abrirlo y revisarlo" : "Arrastra para girarlo · toca para abrirlo"} />
          {!view.paid && <p className="m-0 text-center text-sm text-ink-soft">Las ilustraciones se pintan al pagar. Hasta entonces ves su portada y el texto de cada página.</p>}
        </section>
      )}

      {/* el aviso se va en cuanto el libro está completo (el navegador puede seguir unos segundos esperando a jobs que ya ha terminado el servidor) */}
      {showBusy && (
        <Status testId="pages-busy">
          {busy}
          {view.paid && pagesDone > 0 && !allDone && ` Van ${pagesDone} de ${plan.pages.length}: puedes ir revisándolas.`}
        </Status>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {view.paid && view.print && (
        <PrintPanel view={view} allDone={allDone} onSend={sendToPrint} onShipping={(shipping) => setView({ ...view, print: { ...view.print!, shipping } })} />
      )}
      {view.paid && !view.print && view.edition === "illustrated" && view.upgrade && !showBusy && <UpgradeCard view={view} onUpgraded={() => void refresh()} />}

      {view.paid && view.chosen.portraits.length > 0 && <CastPortraits view={view} />}

      {view.paid ? (
        <ol className="m-0 grid list-none gap-8 p-0">
          {plan.pages.map((p) => (
            <PageView
              key={p.n}
              page={p}
              jobs={view.jobs.filter((j) => j.kind === "page" && j.page === p.n)}
              chosen={view.chosen.pages[p.n] ?? null}
              disabled={!!busy}
              locked={locked}
              onText={(t) => setText(p.n, t)}
              onChoose={async (jobId) => {
                const r = await postJson("/api/libro/page", { bookId, jobId });
                if (r.status === 200) await refresh();
              }}
              redosLeft={view.redosLeft}
              reported={view.reported.includes(p.n)}
              onAnother={(reason, note) => void paintPages({ page: p.n, reason, note })}
              onReport={async (note) => {
                const r = await postJson("/api/libro/report", { bookId, page: p.n, note });
                if (r.status !== 200) return errorMessage(r.json);
                await refresh();
                return null;
              }}
            />
          ))}
        </ol>
      ) : (
        <>
          <LockedPages pages={plan.pages} onText={setText} />
          {!busy && <Paywall bookId={bookId} name={name} payment={view.payment ?? "none"} print={view.printMode ?? "none"} onPaid={() => void paintPages()} />}
        </>
      )}

      <BookLink bookId={bookId} mail={view.mail} />

      {view.paid && allDone ? (
        <div className="actionbar">
          <a className="btn-primary btn-lg w-full sm:w-auto" href={`/api/libro/pdf?b=${bookId}&kind=full`} data-testid="full-pdf">
            <Icon.download />
            Descargar el libro en PDF
          </a>
          <p className="w-full text-center text-[13px] text-mute sm:w-auto sm:text-left">{hardcover ? "A4 apaisado, para leerlo mientras llega el impreso" : "A4 apaisado, listo para imprimir en casa"}</p>
        </div>
      ) : (
        <a className="link justify-self-center text-sm font-semibold" href={`/api/libro/pdf?b=${bookId}&kind=free`}>
          Prefiero el PDF gratis, con la portada y el texto
        </a>
      )}
    </div>
  );
}

/** Antes del pago: las doce páginas en una tira (texto editable y lo que se pintará), con el papel tramado. */
function LockedPages({ pages, onText }: { pages: PlanPage[]; onText: (n: number, t: string) => void }) {
  const rail = useRef<HTMLOListElement>(null);
  const move = (d: number) => {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector("li");
    el.scrollBy({ left: d * ((card?.clientWidth ?? 300) + 12), behavior: "smooth" });
  };
  return (
    <section className="grid gap-3" aria-label="Las doce páginas">
      <div className="flex items-center justify-between gap-3">
        <h3 className="display text-[24px]">Las doce páginas</h3>
        <div className="flex gap-2">
          <button type="button" className="btn-icon" aria-label="Páginas anteriores" onClick={() => move(-1)}>
            <Icon.back />
          </button>
          <button type="button" className="btn-icon" aria-label="Páginas siguientes" onClick={() => move(1)}>
            <Icon.next />
          </button>
        </div>
      </div>
      <ol ref={rail} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 sm:[mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%-48px),transparent)]">
        {pages.map((p) => (
          <li key={p.n} className="flex w-[84%] max-w-[340px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] bg-card shadow-[0_2px_0_#e6d8c1,0_24px_40px_-32px_rgba(35,32,54,0.5)]" data-testid={`book-page-${p.n}`}>
            <div className="locked-paper relative grid aspect-[4/3] place-items-center px-7 text-center">
              <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold text-ink">
                <Icon.lock size={13} />
                Al pagar
              </span>
              <span className="grid justify-items-center gap-1.5">
                <Icon.brush size={22} className="text-accent" />
                <span className="hand line-clamp-4 text-[16px] leading-snug text-ink-soft">se pintará: {p.scene}</span>
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-2 px-5 pt-4 pb-3">
              <AutoTextarea
                className="story -mx-2 block w-[calc(100%+1rem)] resize-none rounded-xl border-2 border-transparent bg-transparent px-2 py-1 text-[16.5px] leading-[1.6] text-ink outline-none focus:border-[#e5d7c1] focus:bg-white focus-visible:outline-none"
                value={p.text}
                maxLength={1500}
                onChange={(e) => onText(p.n, e.target.value)}
                aria-label={`Texto de la página ${p.n}`}
              />
              <span className="self-center text-[12px] tracking-[0.14em] text-mute">{p.n}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Paywall({ bookId, name, payment, print, onPaid }: { bookId: string; name: string; payment: NonNullable<BookView["payment"]>; print: NonNullable<BookView["printMode"]>; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  // la tapa dura solo si hay imprenta aquí (real o simulada en la preview)
  const [edition, setEdition] = useState<PaidEdition>(print !== "none" ? "hardcover" : "illustrated");
  const [shipping, setShipping] = useState<ShippingDraft>({});
  // renuncia al desistimiento (condiciones §7): sin marcarla no se abre el pago, ni el real ni el de prueba
  const [waiver, setWaiver] = useState(false);
  const price = eur(PRICE_CENTS[edition]);
  const body = () => ({ bookId, waiver, edition, ...(edition === "hardcover" ? { shipping } : {}) });
  const failed = (json: { field?: string } & Parameters<typeof errorMessage>[0]) => {
    setBusy(false);
    setField(json?.field ?? null);
    setErr(errorMessage(json));
  };
  const checkout = async () => {
    setBusy(true);
    setErr(null);
    setField(null);
    const r = await postJson<{ url?: string; field?: string }>("/api/libro/checkout", body());
    if (r.status === 200 && r.json.url) {
      track({ name: "pago_iniciado", props: { edicion: edition } }, { beacon: true });
      window.location.assign(r.json.url);
      return;
    }
    failed(r.json);
  };
  const dryRun = async () => {
    setBusy(true);
    setErr(null);
    setField(null);
    const r = await postJson<{ field?: string }>("/api/libro/pay", body());
    if (r.status === 200) {
      setBusy(false);
      onPaid();
    } else failed(r.json);
  };
  const perks: Record<PaidEdition, string[]> = {
    hardcover: [`Libro apaisado de tapa dura, con ${name || "tus personajes"} en las doce ilustraciones`, "Revisas cada página y no lo imprimimos hasta que nos lo digas", "Envío a casa incluido (Península y Baleares) y el PDF para leerlo ya"],
    illustrated: [`Doce ilustraciones con ${name || "tus personajes"} de protagonista`, "Revisas cada página; si una ilustración no te convence, la repetimos una vez", "PDF en A4 apaisado: imprímelo en casa o en una copistería"],
  };
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-night p-6 text-moon shadow-[0_40px_70px_-40px_rgba(29,39,71,0.9)] sm:p-9" data-testid="paywall">
      <Moon className="absolute top-6 right-7" size={42} />
      <Sparkle className="twinkle absolute top-16 right-24" size={10} />
      {print !== "none" && (
        <div className="relative mt-12 mb-6 grid gap-2 sm:mt-14 sm:grid-cols-2" role="radiogroup" aria-label="Edición">
          {(["hardcover", "illustrated"] as PaidEdition[]).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={edition === e}
              onClick={() => setEdition(e)}
              className={`rounded-2xl border-2 px-4 py-3 text-left transition-colors ${edition === e ? "border-star bg-white/[0.1]" : "border-white/15 hover:border-white/35"}`}
              data-testid={`edition-${e}`}
            >
              <span className="block text-[14px] font-semibold text-moon-soft">{EDITION_LABEL[e]}</span>
              <span className="display block text-[26px] leading-tight text-moon">{eur(PRICE_CENTS[e])}</span>
              <span className="block text-[12.5px] text-moon-soft">{e === "hardcover" ? "con envío y el PDF" : "para imprimir en casa"}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-sm font-semibold text-moon-soft">{edition === "hardcover" ? "Libro de tapa dura · envío incluido" : "Libro ilustrado · PDF"}</p>
      <p className="display mt-1 text-[50px] leading-none text-moon">{price}</p>
      <ul className="mt-5 grid gap-2.5 text-[15.5px]">
        {perks[edition].map((t) => (
          <li key={t} className="flex items-start gap-2.5">
            <Sparkle className="mt-1 shrink-0" size={14} />
            {t}
          </li>
        ))}
      </ul>
      {edition === "hardcover" && payment !== "none" && (
        <div className="mt-7 rounded-2xl bg-white/[0.07] p-4 text-ink">
          <ShippingForm value={shipping} onChange={setShipping} field={field} tone="night" />
        </div>
      )}
      {payment !== "none" && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/[0.07] p-4 text-[14px] leading-snug text-moon">
          <input
            type="checkbox"
            checked={waiver}
            onChange={(e) => setWaiver(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            data-testid="waiver"
          />
          <span>
            Quiero que empecéis a pintar el libro en cuanto pague. Sé que, al ser un libro personalizado, no podré desistir de la compra (
            <Link href="/condiciones" target="_blank" className="underline underline-offset-2">
              condiciones
            </Link>
            ).
          </span>
        </label>
      )}
      {payment === "stripe" && (
        <>
          <button className="btn-primary btn-lg mt-4 w-full" disabled={busy || !waiver} data-testid="pay" onClick={() => void checkout()}>
            {busy ? "Abriendo el pago…" : `Pagar ${price} y pintar el libro`}
          </button>
          <p className="mt-3 flex items-start gap-2 text-[13px] text-moon-soft">
            <Icon.lock size={14} className="mt-0.5 shrink-0" />
            Pago seguro con Stripe. Al terminar vuelves aquí y empezamos a pintar.
          </p>
        </>
      )}
      {payment === "dry-run" && (
        <button
          className="btn-primary btn-lg mt-4 w-full"
          disabled={busy || !waiver}
          data-testid="pay"
          onClick={() => void dryRun()}
        >
          {busy ? "Procesando…" : `Pagar ${price} (pago de prueba)`}
        </button>
      )}
      {payment === "none" && <p className="mt-6 text-sm text-moon-soft">El pago estará disponible muy pronto. Tu libro queda guardado 30 días en tu enlace.</p>}
      {err && <p className="mt-3 rounded-xl bg-[#f6ded6] px-3 py-2 text-sm text-danger">{err}</p>}
    </div>
  );
}

function PageView({
  page,
  jobs,
  chosen,
  disabled,
  locked,
  redosLeft,
  reported,
  onText,
  onChoose,
  onAnother,
  onReport,
}: {
  page: PlanPage;
  jobs: BookJobView[];
  chosen: string | null;
  disabled: boolean;
  /** Ya en la imprenta: solo se ve. */
  locked: boolean;
  /** Versiones con motivo que quedan en el libro. */
  redosLeft: number;
  /** Ya avisó de esta página con «Sigue sin estar bien». */
  reported: boolean;
  onText: (t: string) => void;
  onChoose: (jobId: string) => void;
  onAnother: (reason: RedoReason, note: string) => void;
  onReport: (note: string) => Promise<string | null>;
}) {
  const [panel, setPanel] = useState<"redo" | "report" | null>(null);
  const current = jobs.filter((j) => j.current);
  const shown = current.find((j) => j.id === chosen) ?? current[current.length - 1];
  const done = current.filter((j) => j.status === "done");
  const busyHere = current.some(inFlight);
  const canAnother = !locked && jobs.length < 2 + MAX_PAGE_REDOS && done.length > 0 && current.filter((j) => j.status !== "failed").length < 1 + MAX_PAGE_REDOS && redosLeft > 0;
  // sin versiones (de la página o del libro) y con alguna hecha: nos avisa y la arreglamos a mano
  const canReport = !locked && !reported && done.length > 0 && !canAnother && !busyHere;
  const left = Math.min(1 + MAX_PAGE_REDOS - current.filter((j) => j.status !== "failed").length, redosLeft);
  return (
    <BookSpread
      as="li"
      testId={`book-page-${page.n}`}
      left={<BookImage job={shown} alt={`Ilustración de la página ${page.n}`} scene={page.scene} tint={page.n} box="absolute inset-0 overflow-hidden bg-paper-deep" />}
      right={
        <div className="grid flex-1 content-between gap-3 px-5 pt-5 pb-4 sm:px-8 sm:pt-7">
          <div className="grid gap-3">
            {done.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Versiones de la página ${page.n}`}>
                {done.map((j) => (
                  <button key={j.id} aria-pressed={j.id === shown?.id} disabled={locked} className={`chip btn-sm ${j.id === shown?.id ? "chip-on" : ""}`} onClick={() => onChoose(j.id)}>
                    Versión {j.variant}
                  </button>
                ))}
              </div>
            )}
            <AutoTextarea
              className="story -mx-2 block w-[calc(100%+1rem)] resize-none rounded-xl border-2 border-transparent bg-transparent px-2 py-1 text-[18px] leading-[1.6] text-ink outline-none focus:border-[#e5d7c1] focus:bg-white focus-visible:outline-none"
              value={page.text}
              maxLength={1500}
              readOnly={locked}
              onChange={(e) => onText(e.target.value)}
              aria-label={`Texto de la página ${page.n}`}
            />
          </div>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] tracking-[0.14em] text-mute">{page.n}</span>
              {canAnother && panel !== "redo" && (
                <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep hover:underline disabled:opacity-40" disabled={disabled} onClick={() => setPanel("redo")} data-testid={`another-${page.n}`}>
                  <Icon.brush size={15} />
                  Otra versión de esta ilustración
                </button>
              )}
              {canReport && panel !== "report" && (
                <button className="text-sm font-semibold text-ink-soft hover:text-ink hover:underline" onClick={() => setPanel("report")} data-testid={`report-${page.n}`}>
                  ¿Sigue sin estar bien? Avísanos
                </button>
              )}
              {reported && !locked && <span className="text-[13px] text-mute">Nos has avisado: la estamos mirando.</span>}
            </div>
            {panel === "redo" && canAnother && (
              <RedoForm
                left={left}
                disabled={disabled}
                onCancel={() => setPanel(null)}
                onSubmit={(reason, note) => {
                  setPanel(null);
                  onAnother(reason, note);
                }}
              />
            )}
            {panel === "report" && canReport && <ReportForm onCancel={() => setPanel(null)} onSubmit={onReport} />}
          </div>
        </div>
      }
    />
  );
}

/** «Otra versión»: qué no le gusta (obligatorio) y, si quiere, qué cambiaría. Con eso se corrige la versión nueva. */
function RedoForm({ left, disabled, onCancel, onSubmit }: { left: number; disabled: boolean; onCancel: () => void; onSubmit: (reason: RedoReason, note: string) => void }) {
  const [reason, setReason] = useState<RedoReason | null>(null);
  const [note, setNote] = useState("");
  const ready = !!reason || !!note.trim();
  return (
    <form
      className="grid gap-3 rounded-2xl bg-paper-deep/60 p-4"
      data-testid="redo-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(reason ?? "otro", note.trim());
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="display text-[18px]">¿Qué no te gusta?</p>
        <span className="text-[13px] text-mute">{left === 1 ? "te queda 1 versión" : `te quedan ${left} versiones`}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo">
        {(Object.keys(REDO_REASONS) as RedoReason[]).map((k) => (
          <button type="button" key={k} aria-pressed={reason === k} className={`chip btn-sm ${reason === k ? "chip-on" : ""}`} onClick={() => setReason(reason === k ? null : k)}>
            {REDO_REASONS[k]}
          </button>
        ))}
      </div>
      <input
        className="input"
        value={note}
        maxLength={REDO_NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Cuéntanos qué cambiarías (opcional)"
        aria-label="Qué cambiarías"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-sm" disabled={disabled || !ready} data-testid="redo-submit">
          <Icon.brush size={15} />
          Pintar otra versión
        </button>
        <button type="button" className="text-sm font-semibold text-ink-soft hover:text-ink hover:underline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** «Sigue sin estar bien»: nos llega un aviso con la página y lo arreglamos a mano. */
function ReportForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (note: string) => Promise<string | null> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-2xl bg-paper-deep/60 p-4"
      data-testid="report-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(await onSubmit(note.trim()));
        setBusy(false);
      }}
    >
      <p className="display text-[18px]">Lo arreglamos nosotros</p>
      <p className="text-sm text-ink-soft">Cuéntanos qué falla y te escribimos cuando esté. Mientras, puedes elegir la versión que menos te disguste.</p>
      <input className="input" value={note} maxLength={REDO_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Qué falla en esta ilustración" aria-label="Qué falla" />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-sm" disabled={busy} data-testid="report-submit">
          Enviar aviso
        </button>
        <button type="button" className="text-sm font-semibold text-ink-soft hover:text-ink hover:underline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  );
}

/** Un «pago_confirmado» por libro y pestaña: recargar la vuelta de Stripe no cuenta dos veces. */
function trackPaid(bookId: string, edicion: string) {
  const key = `cuentos:paid-tracked:${bookId}:${edicion}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sin almacenamiento: se manda igual */
  }
  track({ name: "pago_confirmado", props: { edicion } });
}

/**
 * Página «así son los personajes» del libro (25 oct): el padre ve los retratos antes de descargar o mandar a imprimir.
 * Si alguno no ha salido, el libro usa la hoja de personajes (lo dice aquí).
 */
function CastPortraits({ view }: { view: BookView }) {
  const byKey = new Map(view.jobs.filter((j) => j.kind === "portrait" && j.current).map((j) => [j.page, j]));
  const chosen = new Map(view.jobs.map((j) => [j.id, j]));
  const all = view.chosen.portraits.every((p) => p.job);
  const failed = view.chosen.portraits.some((p, i) => !p.job && byKey.get(i + 1)?.status === "failed" && !view.portraitsToRequest);
  return (
    <section className="grid gap-3" aria-label="Página de personajes" data-testid="cast-portraits">
      <h3 className="display text-[22px]">Así son los personajes</h3>
      <p className="m-0 text-sm text-ink-soft">
        {failed ? "Algún retrato no ha salido: en el libro irá la hoja de personajes en esta página." : all ? "Esta página va al principio del libro." : "Se están pintando los retratos de esta página."}
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3">
        {view.chosen.portraits.map((p, i) => (
          <li key={i} className="grid gap-1.5 text-center">
            <BookImage job={p.job ? chosen.get(p.job) : byKey.get(i + 1)} alt={`Retrato de ${p.name}`} testId={`portrait-${i + 1}`} box="relative aspect-square w-full overflow-hidden rounded-[18px] bg-paper-deep" />
            <span className="font-display text-[17px]">{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
