"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookPreview } from "@/components/BookPreview";
import { CharacterSheet } from "@/components/CharacterSheet";
import { GeneratedPicture, LockedPicture } from "@/components/GeneratedPicture";
import { IllustratedScene, paintedStyleFor } from "@/components/IllustratedScene";
import { SiteHeader } from "@/components/SiteHeader";
import { StyleImage } from "@/components/StyleImage";
import { getDraft, setDraft, useDraft } from "@/lib/draftStore";
import { saveBook, syncBook } from "@/lib/bookSync";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { MAX_PAGE_VERSIONS, MAX_SHEET_VERSIONS, SAMPLE_PAGE } from "@/lib/generation/keys";
import { STYLES, getStyle } from "@/lib/generation/styles";
import {
  chosenPageVersion,
  chosenSheet,
  coverJob,
  currentKeys,
  isCurrentJob,
  pageVersions,
  sampleJob,
  sheetVersions,
  type CurrentKeys,
} from "@/lib/generation/view";
import { getIllustration, pagesKey, sheetKey } from "@/lib/illustration";
import { DEFAULT_PAINTED_STYLE, piecesFor } from "@/lib/pieces";
import { PRICE_ILLUSTRATED } from "@/lib/pricing";
import { buildBook } from "@/lib/story";
import { useGeneration, type GenJobView } from "@/lib/useGeneration";
import type { Book, BookPage, Draft, Illustration, StyleId } from "@/lib/types";
import { IllustratedPdfButton } from "@/components/IllustratedPdfButton";

/**
 * Edición ilustrada (B3): muestra gratuita tras el email (hoja + página 9), resto bloqueado con el precio, pago
 * (simulado con NEXT_PUBLIC_DRY_RUN_PAYMENT=1; si no, «próximamente») y libro completo. Las imágenes las pinta el
 * servidor job a job (/api/generate/*), lanzados desde aquí de uno en uno (lib/useGeneration.ts).
 */

type Stage = "estilo" | "muestra" | "pago" | "libro";
type Gen = ReturnType<typeof useGeneration>;

function patchIllustration(patch: Partial<Illustration> | ((ill: Illustration, d: Draft) => Partial<Illustration>), extra: Partial<Draft> = {}) {
  setDraft((d) => {
    const ill = getIllustration(d);
    const p = typeof patch === "function" ? patch(ill, d) : patch;
    return { ...d, ...extra, illustration: { ...ill, ...p } };
  });
}

const isDone = (j: GenJobView | undefined) => j?.status === "done";
const isOpen = (j: GenJobView | undefined) => !!j && (j.status === "pending" || j.status === "running");

export default function IlustradoPage() {
  const draft = useDraft();
  if (!draft) return null;
  if (!draft.hero.name.trim())
    return (
      <Shell>
        <h1 className="display text-[34px]">Primero, el cuento</h1>
        <p className="text-ink-soft">Para empezar basta con el nombre del protagonista.</p>
        <Link href="/crear" className="btn-primary self-start">
          Crear el cuento
        </Link>
      </Shell>
    );
  if (!draft.email)
    return (
      <Shell>
        <h1 className="display text-[34px]">Primero, tu email</h1>
        <p className="max-w-[60ch] text-ink-soft">
          La muestra de la edición ilustrada se prepara después de dejar un email en el paso «Edición». Así guardamos el cuento y la muestra 30
          días.
        </p>
        <Link href="/crear?paso=4" className="btn-primary self-start">
          Ir al paso «Edición»
        </Link>
      </Shell>
    );
  return <Flow draft={draft} />;
}

function Flow({ draft }: { draft: Draft }) {
  const ill = getIllustration(draft);
  // un estilo «Próximamente» se anota, pero se pinta en el estilo disponible por defecto
  const styleId = paintedStyleFor(draft.styleId ?? DEFAULT_PAINTED_STYLE);
  const book = useMemo(() => buildBook(draft), [draft]);
  const keys = useMemo(() => currentKeys(draft, styleId, book), [draft, styleId, book]);
  const paid = ill.paid;
  const gen = useGeneration(ill.bookId, (j) => isCurrentJob(j, keys) && (paid || j.kind === "sheet" || j.kind === "sample"));
  const [stage, setStage] = useState<Stage | null>(null);

  const sheets = sheetVersions(gen.jobs, keys);
  const sampleReady = isDone(sampleJob(gen.jobs, keys)) && isDone(sheets[0]);
  const view: Stage = paid ? "libro" : stage === "estilo" ? "estilo" : stage === "pago" && sampleReady ? "pago" : "muestra";

  // sincroniza el estado ilustrado con cuentos_books.draft si el libro ya existe en el servidor (503 sin Supabase: no pasa nada)
  const syncKey = JSON.stringify([draft.styleId, draft.illustration, draft.textOverrides]);
  useEffect(() => {
    const t = setTimeout(() => void syncBook(draft), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const go = (s: Stage) => {
    setStage(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <Shell bottomBar={view === "muestra" && sampleReady}>
      <Steps view={view} paid={paid} sampleReady={sampleReady} onGo={go} />
      {view === "estilo" && <StylePicker draft={draft} keys={keys} gen={gen} onDone={() => go("muestra")} />}
      {view === "muestra" && <SampleStep draft={draft} ill={ill} styleId={styleId} book={book} keys={keys} gen={gen} onPay={() => go("pago")} />}
      {view === "pago" && <PaymentStep draft={draft} styleId={styleId} keys={keys} gen={gen} onBack={() => go("muestra")} />}
      {view === "libro" && <BookStage draft={draft} ill={ill} styleId={styleId} book={book} keys={keys} gen={gen} />}
    </Shell>
  );
}

function Shell({ children, bottomBar = false }: { children: React.ReactNode; bottomBar?: boolean }) {
  return (
    <main className="flex-1">
      <SiteHeader>
        <Link href="/crear?paso=3" className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink">
          Volver al cuento
        </Link>
      </SiteHeader>
      <section className={`mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 sm:px-6 ${bottomBar ? "pb-32" : "pb-20"}`}>{children}</section>
    </main>
  );
}

function Steps({ view, paid, sampleReady, onGo }: { view: Stage; paid: boolean; sampleReady: boolean; onGo: (v: Stage) => void }) {
  const items: { v: Stage; label: string; reachable: boolean }[] = [
    { v: "estilo", label: "Estilo", reachable: !paid },
    { v: "muestra", label: "Muestra", reachable: !paid },
    { v: "pago", label: "Pago", reachable: !paid && sampleReady },
    { v: "libro", label: "El libro", reachable: paid },
  ];
  return (
    <nav aria-label="Pasos de la edición ilustrada">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-3 text-[13px] text-ink-soft">
        {items.map((it, i) => (
          <li key={it.v} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-ink-soft/50">
                ·
              </span>
            )}
            <button
              type="button"
              disabled={!it.reachable || it.v === view}
              aria-current={it.v === view ? "step" : undefined}
              onClick={() => onGo(it.v)}
              className={`py-1 ${it.v === view ? "font-medium text-ink" : it.reachable ? "hover:text-ink hover:underline" : "text-ink-soft/60"}`}
            >
              <span className="tabular-nums">{i + 1}</span> {it.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* --------------------------------- estilo --------------------------------- */

function StylePicker({ draft, keys, gen, onDone }: { draft: Draft; keys: CurrentKeys; gen: Gen; onDone: () => void }) {
  const chosen = draft.styleId ? getStyle(draft.styleId) : getStyle(DEFAULT_PAINTED_STYLE);
  const chosenPending = !!draft.styleId && !piecesFor(draft.styleId);
  const painted = isDone(sampleJob(gen.jobs, keys));
  const current = getStyle(paintedStyleFor(draft.styleId ?? DEFAULT_PAINTED_STYLE));
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Elige el estilo</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          {painted
            ? `La muestra está pintada en ${current?.label.toLowerCase()}. Si eliges otro estilo, la muestra nueva cuenta en el límite de muestras de este email.`
            : "Así se pintarán la hoja de personaje y las doce páginas."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {STYLES.map((s) => {
          const on = (draft.styleId ?? DEFAULT_PAINTED_STYLE) === s.id;
          const available = !!piecesFor(s.id);
          return (
            <button
              key={s.id}
              type="button"
              data-testid={`style-${s.id}`}
              data-available={available ? "1" : "0"}
              aria-pressed={on}
              onClick={() => {
                setDraft((d) => ({ ...d, styleId: s.id }));
                if (available) onDone();
              }}
              className={`overflow-hidden rounded-[8px] border bg-card text-left transition-colors ${on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line hover:border-ink/40"}`}
            >
              <StyleImage styleId={s.id} className={`aspect-[3/2] w-full object-cover ${available ? "" : "opacity-60 grayscale-[35%]"}`} />
              <div className="grid gap-0.5 px-3 py-2.5">
                <span className="text-[15px] font-medium text-ink">{s.label}</span>
                <span className={`text-xs ${available ? "text-accent" : "text-ink-soft"}`}>{available ? "Disponible" : "Próximamente"}</span>
              </div>
            </button>
          );
        })}
      </div>
      {chosenPending && chosen && (
        <div className="notice grid gap-3" data-testid="style-pending-choice">
          <p>
            {chosen.label} estará disponible próximamente. Hemos anotado tu preferencia. Mientras tanto, la hoja de personaje y las páginas se
            pintan en {getStyle(paintedStyleFor(chosen.id))?.label.toLowerCase()}.
          </p>
          <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={onDone}>
            Continuar en {getStyle(paintedStyleFor(chosen.id))?.label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- muestra --------------------------------- */

type ReqError = "budget" | "max_versions" | "error";

function SampleStep({
  draft,
  ill,
  styleId,
  book,
  keys,
  gen,
  onPay,
}: {
  draft: Draft;
  ill: Illustration;
  styleId: StyleId;
  book: Book;
  keys: CurrentKeys;
  gen: Gen;
  onPay: () => void;
}) {
  const name = draft.hero.name.trim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReqError | null>(null);
  const [versionError, setVersionError] = useState<ReqError | null>(null);
  const inflight = useRef(false);

  const sheets = sheetVersions(gen.jobs, keys);
  const sample = sampleJob(gen.jobs, keys);
  const sheet = chosenSheet(ill, sheets);
  const requestedCurrent = !!ill.bookId && ill.sampleKey === keys.sample;
  const loaded = !ill.bookId || gen.jobs !== null;
  // la muestra anterior ya se pintó con otros rasgos, estilo o cuento: se avisa antes de volver a gastar
  const stalePainted =
    !!ill.sampleKey && ill.sampleKey !== keys.sample && (gen.jobs ?? []).some((j) => j.kind === "sample" && j.key === ill.sampleKey && j.status === "done");
  // el servidor no conoce la muestra pedida (almacén en memoria reiniciado): se vuelve a pedir; el servidor no duplica
  const lost = requestedCurrent && gen.jobs !== null && !sample;
  const shouldRequest = loaded && !busy && !error && ((!requestedCurrent && !stalePainted) || lost);

  async function request(sheetVersion = false) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      const d = getDraft();
      const saved = await saveBook(d, d.email);
      const res = await fetch("/api/generate/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: saved?.public_id ?? getIllustration(d).bookId,
          email: d.email,
          styleId,
          draft: { ...d, email: undefined },
          sheetVersion,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const e: ReqError = json?.error === "budget" ? "budget" : json?.error === "max_versions" ? "max_versions" : "error";
        if (sheetVersion) setVersionError(e);
        else setError(e);
        return;
      }
      patchIllustration((cur) => ({
        bookId: json.bookId,
        sampleKey: json.sampleKey,
        sampleJobId: json.sampleJobId,
        sheetVersions: json.sheetVersions,
        sheetJobId: sheetVersion ? json.sheetJobId : cur.sheetJobId ?? json.sheetJobId,
      }));
      gen.refresh();
    } catch {
      if (sheetVersion) setVersionError("error");
      else setError("error");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!shouldRequest) return;
    const t = setTimeout(() => void request(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRequest]);

  if (error)
    return (
      <div className="grid gap-4" data-testid="sample-error">
        <h1 className="display text-[34px] md:text-[44px]">No hemos podido pintar la muestra</h1>
        <p className="max-w-[60ch] text-ink-soft">
          {error === "budget"
            ? "Este email ya ha usado las muestras gratuitas, o hoy se ha alcanzado el límite de muestras. La edición clásica sigue disponible y es gratuita."
            : "Ha fallado la conexión o el servicio de ilustración. Puedes intentarlo de nuevo en unos minutos."}
        </p>
        <div className="flex flex-wrap gap-3">
          {error !== "budget" && (
            <button type="button" className="btn-primary" onClick={() => setError(null)}>
              Intentarlo de nuevo
            </button>
          )}
          <Link href="/crear?paso=4" className="btn-ghost">
            Volver a las ediciones
          </Link>
        </div>
      </div>
    );

  if (stalePainted && !requestedCurrent)
    return (
      <div className="grid gap-4" data-testid="sample-stale">
        <h1 className="display text-[34px] md:text-[44px]">La muestra ya no corresponde al cuento</h1>
        <p className="max-w-[60ch] text-ink-soft">
          Desde que se pintó la muestra han cambiado los rasgos, el estilo o el texto del cuento. Pintar una muestra nueva cuenta en el límite de
          muestras de este email.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void request()} data-testid="sample-repaint">
            Pintar una muestra nueva
          </button>
          <Link href="/crear?paso=3" className="btn-ghost">
            Volver al cuento
          </Link>
        </div>
      </div>
    );

  const failed = sample?.status === "failed" || sheets[0]?.status === "failed";
  if (failed)
    return (
      <div className="grid gap-4" data-testid="sample-error">
        <h1 className="display text-[34px] md:text-[44px]">No hemos podido pintar la muestra</h1>
        <p className="max-w-[60ch] text-ink-soft">
          {sample?.error === "budget" || sheets[0]?.error === "budget"
            ? "Hoy se ha alcanzado el límite de muestras. Puedes volver mañana; el cuento queda guardado."
            : "El servicio de ilustración ha fallado. Puedes intentarlo de nuevo."}
        </p>
        <button type="button" className="btn-primary self-start" disabled={busy} onClick={() => void request()}>
          Intentarlo de nuevo
        </button>
      </div>
    );

  if (!isDone(sample) || !isDone(sheets[0])) return <PaintingState name={name} />;

  const p9 = book.pages.find((p) => p.n === SAMPLE_PAGE)!;
  const others = book.pages.filter((p) => p.n !== SAMPLE_PAGE);
  const styleLabel = getStyle(styleId)?.label.toLowerCase();
  const versionPending = sheets.some(isOpen);
  const canAskVersion = sheets.length < MAX_SHEET_VERSIONS && !versionError;

  return (
    <div className="grid gap-8" data-testid="sample">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Así quedaría el libro de {name}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          La hoja de personaje y la página 9, pintadas en {styleLabel}. Las otras once páginas y la portada se pintan al confirmar, con la misma
          hoja como referencia.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
        <section className="grid gap-3" aria-labelledby="sheet-title">
          <h2 id="sheet-title" className="font-display text-xl font-medium">
            Hoja de personaje
          </h2>
          <GeneratedPicture
            job={sheet}
            provider={gen.provider}
            aspect="aspect-square"
            alt={`Hoja de personaje de ${name}`}
            className="overflow-hidden rounded-[8px] border border-line"
            labelPlacement="below"
            fallback={<CharacterSheet styleId={styleId} traits={draft.hero.traits} name={name} />}
          />
          {sheets.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Versiones de la hoja">
              {sheets.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sheet?.id === s.id}
                  disabled={!isDone(s)}
                  className={`chip ${sheet?.id === s.id ? "chip-on" : ""}`}
                  onClick={() => patchIllustration({ sheetJobId: s.id })}
                  data-testid={`sheet-version-${i + 1}`}
                >
                  {isDone(s) ? `Versión ${i + 1}` : "Pintando…"}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {canAskVersion && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={busy || versionPending}
                onClick={() => void request(true)}
                data-testid="sheet-another"
              >
                {versionPending ? "Pintando otra versión…" : "Otra versión de la hoja"}
              </button>
            )}
            <span className="text-sm text-ink-soft" data-testid="sheet-versions-note">
              {versionError === "budget"
                ? "No quedan versiones de la hoja para este email."
                : versionError === "error"
                  ? "No se ha podido pedir otra versión. Inténtalo más tarde."
                  : !canAskVersion
                    ? "Ya has pedido las dos versiones adicionales de la hoja."
                    : sheets.length === 1
                      ? "Puedes pedir otra versión dos veces."
                      : "Puedes pedir otra versión una vez más."}
            </span>
          </div>
        </section>

        <section className="grid gap-3" aria-labelledby="page9-title">
          <h2 id="page9-title" className="font-display text-xl font-medium">
            Página {SAMPLE_PAGE}
          </h2>
          <article className="overflow-hidden rounded-[8px] border border-line bg-card" data-testid="sample-page">
            <div className="border-b border-line">
              <GeneratedPicture
                job={sample}
                provider={gen.provider}
                alt={`Página ${SAMPLE_PAGE}`}
                fallback={<IllustratedScene styleId={styleId} page={p9} variant={0} draft={draft} showNotice={false} />}
              />
            </div>
            <p className="story p-4 text-[19px] leading-[1.55] text-ink md:p-5">{p9.text}</p>
          </article>
        </section>
      </div>

      <section className="grid gap-4" aria-labelledby="locked-title">
        <div>
          <h2 id="locked-title" className="font-display text-xl font-medium">
            Las otras once páginas
          </h2>
          <p className="mt-1 text-sm text-ink-soft">El texto es el definitivo y se puede cambiar en el cuento. Las ilustraciones se pintan al confirmar.</p>
        </div>
        {others.map((p) => (
          <LockedPage key={p.n} page={p} />
        ))}
      </section>

      <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="hidden text-sm text-ink-soft sm:block">Doce páginas y portada, PDF para imprimir.</span>
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={onPay} data-testid="cta-illustrate">
            Ilustrar el libro completo · {PRICE_ILLUSTRATED}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockedPage({ page }: { page: BookPage }) {
  return (
    <article className="grid overflow-hidden rounded-[8px] border border-line bg-card md:grid-cols-[3fr_2fr]" data-testid="locked-page" data-page={page.n}>
      <div className="border-b border-line md:border-b-0 md:border-r">
        <LockedPicture />
      </div>
      <div className="flex flex-col gap-2 p-4 md:p-5">
        <span className="text-xs text-ink-soft">Página {page.n}</span>
        <p className="story text-[17px] leading-[1.5] text-ink">{page.text}</p>
      </div>
    </article>
  );
}

const PAINTING_LINES = ["Preparando la hoja de personaje", "Pintando la página 9", "Comprobando que es la misma cara en las dos"];

function PaintingState({ name }: { name: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % PAINTING_LINES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid gap-6 py-6" role="status" aria-live="polite" data-testid="sample-waiting">
      <h1 className="display text-[34px] md:text-[44px]">Pintando a {name}</h1>
      <ol className="grid gap-3 text-ink-soft">
        {PAINTING_LINES.map((t, i) => (
          <li key={t} className={`flex items-center gap-3 transition-colors duration-500 ${i === line ? "text-ink" : "text-ink-soft/45"}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${i === line ? "animate-pulse bg-accent" : "bg-ink-soft/25"}`} />
            {t}
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink-soft">Puede tardar alrededor de un minuto. Si cierras esta página, la muestra sigue guardada.</p>
    </div>
  );
}

/* --------------------------------- pago --------------------------------- */

async function requestBookJobs(styleId: StyleId, extra: { page?: number } = {}): Promise<boolean> {
  const d = getDraft();
  const ill = getIllustration(d);
  try {
    const saved = await saveBook(d, d.email);
    const res = await fetch("/api/generate/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: saved?.public_id ?? ill.bookId, email: d.email, styleId, sheetJobId: ill.sheetJobId, draft: { ...d, email: undefined }, ...extra }),
    });
    const json = await res.json().catch(() => null);
    return res.ok && !!json?.ok;
  } catch {
    return false;
  }
}

function PaymentStep({ draft, styleId, keys, gen, onBack }: { draft: Draft; styleId: StyleId; keys: CurrentKeys; gen: Gen; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const styleLabel = getStyle(styleId)?.label.toLowerCase();

  if (!DRY_RUN_PAYMENT)
    return (
      <div className="grid gap-5" data-testid="payment-soon">
        <h1 className="display text-[34px] md:text-[44px]">Pago disponible próximamente</h1>
        <p className="max-w-[60ch] text-ink-soft">
          Todavía no se puede pagar la edición ilustrada. Te escribiremos a <span className="text-ink">{draft.email}</span> en cuanto se pueda. El
          cuento y la muestra quedan guardados 30 días.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={onBack}>
            Volver a la muestra
          </button>
          <Link href="/crear?paso=4" className="btn-ghost">
            Descargar la edición clásica
          </Link>
        </div>
      </div>
    );

  const pay = async () => {
    setBusy(true);
    const chosen = chosenSheet(getIllustration(getDraft()), sheetVersions(gen.jobs, keys));
    patchIllustration(
      (_ill, d) => ({ paid: true, sheetApproved: true, sheetKey: sheetKey(d), pagesKey: pagesKey(d), sheetJobId: chosen?.id, pages: {}, pageVersions: {} }),
      { edition: "illustrated" },
    );
    await requestBookJobs(styleId);
    gen.refresh();
    setBusy(false);
  };

  return (
    <div className="grid gap-6">
      <p className="notice" role="note">
        Pago de prueba — sin cargo. No se piden datos de pago.
      </p>
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Ilustrar el libro completo</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          Se pintan las otras once páginas y la portada en {styleLabel}, con la hoja de personaje como referencia. La página 9 ya está pintada y
          no se repite. Después puedes pedir otra versión de cada página y seguir cambiando el texto.
        </p>
      </div>
      <div className="grid gap-5 rounded-[8px] border border-line bg-card p-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="font-display text-lg font-medium">Ilustrado · PDF</span>
          <span className="font-display text-xl">{PRICE_ILLUSTRATED}</span>
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">
          Un libro personalizado no admite desistimiento (art. 103.c TRLGDCU). Ver{" "}
          <Link href="/condiciones" target="_blank" className="link">
            condiciones
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={busy} data-testid="simulate-payment" onClick={pay}>
            {busy ? "Confirmando…" : "Confirmar pago de prueba"}
          </button>
          <button type="button" className="btn-ghost" onClick={onBack}>
            Volver a la muestra
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- libro --------------------------------- */

function BookStage({ draft, ill, styleId, book, keys, gen }: { draft: Draft; ill: Illustration; styleId: StyleId; book: Book; keys: CurrentKeys; gen: Gen }) {
  const versions = useMemo(() => Object.fromEntries(book.pages.map((p) => [p.n, pageVersions(gen.jobs, keys, p.n)])) as Record<number, GenJobView[]>, [book, gen.jobs, keys]);
  const cover = coverJob(gen.jobs, keys);
  const chosen = (n: number) => chosenPageVersion(ill, n, versions[n] ?? []);
  const doneCount = book.pages.filter((p) => isDone(chosen(p.n))).length + (isDone(cover) ? 1 : 0);
  const allDone = doneCount === book.pages.length + 1;
  const asked = useRef(false);

  // tras el pago (o al volver): si faltan jobs del libro, se piden; el servidor no crea ninguno dos veces
  const missing = gen.jobs !== null && (!cover || book.pages.some((p) => (versions[p.n] ?? []).length === 0));
  useEffect(() => {
    if (!missing || asked.current) return;
    asked.current = true;
    void requestBookJobs(styleId).then(() => gen.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  // refleja en el borrador las páginas terminadas (las usa /libro para saber si el ilustrado está completo)
  const doneKey = book.pages.map((p) => (isDone(chosen(p.n)) ? 1 : 0)).join("");
  useEffect(() => {
    patchIllustration((cur, d) => {
      const pages = { ...cur.pages };
      for (const p of book.pages) if (isDone(chosen(p.n)) && !pages[p.n]) pages[p.n] = { variant: 0 };
      return { pages, pagesKey: pagesKey(d), sheetKey: sheetKey(d), sheetApproved: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  if (!allDone) return <ProgressView draft={draft} styleId={styleId} book={book} versions={versions} cover={cover} chosen={chosen} doneCount={doneCount} gen={gen} />;
  return <PreviewView draft={draft} styleId={styleId} book={book} versions={versions} chosen={chosen} gen={gen} />;
}

function ProgressView({
  draft,
  styleId,
  book,
  versions,
  cover,
  chosen,
  doneCount,
  gen,
}: {
  draft: Draft;
  styleId: StyleId;
  book: Book;
  versions: Record<number, GenJobView[]>;
  cover: GenJobView | undefined;
  chosen: (n: number) => GenJobView | undefined;
  doneCount: number;
  gen: Gen;
}) {
  const total = book.pages.length + 1;
  const failed = book.pages.some((p) => (versions[p.n] ?? []).every((v) => v.status === "failed") && (versions[p.n] ?? []).length > 0) || cover?.status === "failed";
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Pintando el cuento de {draft.hero.name.trim()}</h1>
        <p className="mt-2 text-ink-soft" data-testid="progress-count" aria-live="polite">
          {doneCount} de {total} ilustraciones
        </p>
      </div>
      <div className="h-px w-full bg-line" aria-hidden>
        <div className="h-px bg-ink transition-[width] duration-300" style={{ width: `${(doneCount / total) * 100}%` }} />
      </div>
      {gen.paused && (
        <p className="notice" data-testid="progress-paused">
          Hoy se ha alcanzado el límite diario de ilustraciones. El libro se termina de pintar en cuanto haya cupo; puedes cerrar esta página y
          volver.
        </p>
      )}
      {failed && (
        <div className="notice grid gap-3" data-testid="progress-failed">
          <p>Alguna ilustración no se ha podido pintar.</p>
          <button
            type="button"
            className="btn-ghost btn-sm justify-self-start"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              await requestBookJobs(styleId);
              gen.refresh();
              setRetrying(false);
            }}
          >
            Intentarlo de nuevo
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3" data-testid="progress-grid">
        <Slot id="slot-cover" label="Portada" job={cover} gen={gen} fallback={<CoverThumb draft={draft} styleId={styleId} />} />
        {book.pages.map((p) => (
          <Slot
            key={p.n}
            id={`slot-${p.n}`}
            label={String(p.n)}
            job={chosen(p.n)}
            gen={gen}
            fallback={<IllustratedScene styleId={styleId} page={p} variant={Math.max(0, (chosen(p.n)?.variant ?? 1) - 1)} draft={draft} showNotice={false} />}
          />
        ))}
      </div>
    </div>
  );
}

function Slot({ id, label, job, gen, fallback }: { id: string; label: string; job: GenJobView | undefined; gen: Gen; fallback: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[4px] border border-line bg-card" data-testid={id} data-done={isDone(job) ? "1" : "0"}>
      {isDone(job) ? (
        <GeneratedPicture job={job} provider={gen.provider} alt="" label={false} fallback={fallback} />
      ) : (
        <div className="flex aspect-[3/2] flex-col items-center justify-center gap-1 bg-paper text-sm text-ink-soft/70">
          <span className="tabular-nums">{label}</span>
          {job?.status === "failed" && <span className="text-[11px]">Sin pintar</span>}
        </div>
      )}
    </div>
  );
}

function CoverThumb({ draft, styleId }: { draft: Draft; styleId: StyleId }) {
  const p = buildBook(draft).pages[0];
  return <IllustratedScene styleId={styleId} page={{ ...p, scene: "salon-globos", expression: "orgullo" }} variant={0} draft={draft} showNotice={false} />;
}

function PreviewView({
  draft,
  styleId,
  book,
  versions,
  chosen,
  gen,
}: {
  draft: Draft;
  styleId: StyleId;
  book: Book;
  versions: Record<number, GenJobView[]>;
  chosen: (n: number) => GenJobView | undefined;
  gen: Gen;
}) {
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const [asking, setAsking] = useState<Record<number, boolean>>({});
  const [askError, setAskError] = useState<Record<number, boolean>>({});

  const askVersion = async (n: number) => {
    setAsking((a) => ({ ...a, [n]: true }));
    const ok = await requestBookJobs(styleId, { page: n });
    if (ok) {
      // la versión nueva se elige al terminar (mientras tanto se ve la anterior)
      patchIllustration((cur) => ({ pageVersions: { ...cur.pageVersions, [n]: 2 }, pages: { ...cur.pages, [n]: { variant: 1 } } }));
      gen.refresh();
    } else setAskError((e) => ({ ...e, [n]: true }));
    setAsking((a) => ({ ...a, [n]: false }));
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">{book.title}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          Estilo {getStyle(styleId)?.label.toLowerCase()}. Puedes cambiar cualquier texto. Cada página admite una versión más; después eliges la
          que prefieres.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
        <span className="text-sm text-ink-soft">13 hojas A4 apaisadas, portada incluida.</span>
        <IllustratedPdfButton draft={draft} />
      </div>
      <BookPreview
        book={book}
        draft={draft}
        update={update}
        renderImage={(p) => {
          const job = chosen(p.n);
          return (
            <GeneratedPicture
              job={job}
              provider={gen.provider}
              alt={`Página ${p.n}`}
              fallback={<IllustratedScene styleId={styleId} page={p} variant={Math.max(0, (job?.variant ?? 1) - 1)} draft={draft} />}
            />
          );
        }}
        renderActions={(p) => {
          const vs = versions[p.n] ?? [];
          const current = chosen(p.n);
          if (vs.length < MAX_PAGE_VERSIONS)
            return (
              <button
                type="button"
                className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-40"
                disabled={asking[p.n]}
                data-testid={`regen-${p.n}`}
                onClick={() => askVersion(p.n)}
              >
                {askError[p.n] ? "No se ha podido pedir; reintentar" : asking[p.n] ? "Pidiendo…" : "Otra versión"}
              </button>
            );
          return (
            <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-ink-soft" data-testid={`versions-${p.n}`}>
              {vs.map((v, i) =>
                isDone(v) ? (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={current?.id === v.id}
                    className={current?.id === v.id ? "font-medium text-ink" : "underline underline-offset-2 hover:text-ink"}
                    onClick={() => patchIllustration((cur) => ({ pages: { ...cur.pages, [p.n]: { variant: i } } }))}
                    data-testid={`version-${p.n}-${i + 1}`}
                  >
                    Versión {i + 1}
                  </button>
                ) : (
                  <span key={v.id}>{v.status === "failed" ? `Versión ${i + 1} sin pintar` : "Pintando otra versión…"}</span>
                ),
              )}
              <span className="basis-full text-right text-[11px] text-ink-soft/80">Ya has pedido la otra versión de esta página.</span>
            </span>
          );
        }}
      />
    </div>
  );
}
