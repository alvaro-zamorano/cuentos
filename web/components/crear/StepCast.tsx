"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookJobView, BookView } from "@/lib/book/service";
import { track } from "@/lib/analytics";
import { errorMessage, fetchView, loadView, postJson, runJobs, viewErrorMessage, type JobOutcome } from "@/lib/bookClient";
import { MARKETING_TEXT } from "@/lib/marketing";
import { normalizeFicha } from "@/lib/plan/ficha";
import type { Ficha, PlanRecord } from "@/lib/plan/types";
import { BookCover, Icon, Sparkle } from "@/components/brand";
import { BookImage } from "./BookImage";
import { BookLink } from "./BookLink";
import { PdfLink } from "./PdfLink";
import { WaitCard } from "./Waiting";
import { ErrorNote, LoadError, Status, Taped } from "./ui";

/** La portada más reciente de una hoja: si una falla del todo, se pinta otra para la misma hoja (auditoría 26 oct, B8). */
function coverOf(jobs: BookJobView[] | undefined, sheetId: string | undefined): BookJobView | undefined {
  const mine = (jobs ?? []).filter((j) => j.kind === "cover" && !!sheetId && j.sheetJobId === sheetId);
  return mine[mine.length - 1];
}

const going = (j?: BookJobView) => j?.status === "pending" || j?.status === "running";

/**
 * Paso 4: con el email (captura del lead, D3) pintamos la hoja de personajes y la portada (≈ 10 c, D2). El padre las
 * aprueba o pide hasta dos cambios con palabras. También puede descargar ya el PDF casero gratis (portada + texto).
 */
export function StepCast({
  ficha,
  record,
  bookId,
  email,
  onBook,
  onNext,
}: {
  ficha: Ficha;
  record: PlanRecord;
  bookId?: string;
  email?: string;
  onBook: (bookId: string, email: string) => void;
  onNext: () => void;
}) {
  const [view, setView] = useState<BookView | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // el último cuento con dibujos gratis del periodo: se dice una vez, con suavidad (26 oct)
  const [lastFree, setLastFree] = useState(false);
  // la última tanda no terminó bien (falló o tardó demasiado): se ofrece «Reintentar» (B8)
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // el libro no se ha podido cargar al volver a este paso (I9)
  const [loadError, setLoadError] = useState<string | null>(null);
  const cancel = useRef({ cancelled: false });
  useEffect(() => {
    const c = cancel.current;
    return () => {
      c.cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (id: string) => {
    const v = await fetchView(id);
    if (v) setView(v);
    return v;
  }, []);

  /** Pinta lo pendiente: primero la hoja, después su portada (la portada la lleva de referencia). */
  const paint = useCallback(
    async (id: string, sheetJobId: string, coverJobId: string) => {
      setError(null);
      setStalled(false);
      setPainting("Dibujando a los personajes. Tarda alrededor de un minuto.");
      const outcomes: JobOutcome[] = [];
      await runJobs([sheetJobId], 1, (_, o) => outcomes.push(o), cancel.current);
      await refresh(id);
      setPainting("Pintando la portada…");
      await runJobs([coverJobId], 1, (_, o) => outcomes.push(o), cancel.current);
      await refresh(id);
      setPainting(null);
      if (outcomes.includes("budget")) setError(errorMessage({ error: "budget", reason: "diario" }));
      else if (outcomes.some((o) => o !== "done")) setStalled(true);
    },
    [refresh],
  );

  // al volver a este paso con un libro ya creado: cargar y terminar lo que quedara a medias (en cola o pintándose; si
  // se quedó colgado, el servidor lo da por perdido a los 330 s y lo repite). Lo fallido espera a «Reintentar»
  const resumed = useRef(false);
  useEffect(() => {
    if (!bookId || resumed.current) return;
    resumed.current = true;
    void (async () => {
      const r = await loadView(bookId);
      if (!r.ok) {
        setLoadError(viewErrorMessage(r.error));
        return;
      }
      const v = r.view;
      setView(v);
      const sheets = v.jobs.filter((j) => j.kind === "sheet");
      const last = sheets[sheets.length - 1];
      const cover = coverOf(v.jobs, last?.id);
      if (last && cover && (going(last) || going(cover))) await paint(bookId, last.id, cover.id);
    })();
  }, [bookId, paint, refresh]);

  if (!bookId)
    return (
      <EmailGate
        ficha={ficha}
        record={record}
        initialEmail={email}
        onStarted={async (id, mail, sheet, cover, freeLeft) => {
          setLastFree(freeLeft === 0);
          onBook(id, mail);
          resumed.current = true;
          await refresh(id);
          await paint(id, sheet, cover);
        }}
      />
    );

  const sheets = view?.jobs.filter((j) => j.kind === "sheet") ?? [];
  const current = sheets[sheets.length - 1];
  const currentCover = coverOf(view?.jobs, current?.id);
  const chosenSheet = view?.chosen.sheet ? view.jobs.find((j) => j.id === view.chosen.sheet) : undefined;
  const shownSheet = chosenSheet ?? current;
  const cover = coverOf(view?.jobs, shownSheet?.id);
  // las versiones que se pueden elegir: un dibujo que falló no es una versión
  const versions = sheets.filter((s) => s.status !== "failed" || s.id === shownSheet?.id);
  const versionOf = (id?: string) => versions.findIndex((s) => s.id === id) + 1;
  const name = ficha.hero.name.trim();

  // «Reintentar» (B8): lo fallido se vuelve a poner en cola en el servidor; lo que tardó demasiado, se sigue esperando
  const failed = current?.status === "failed" ? current : currentCover?.status === "failed" ? currentCover : undefined;
  const stuck = stalled && (going(current) || going(currentCover));
  const retry = async () => {
    if (!bookId || !current) return;
    setRetrying(true);
    setError(null);
    try {
      if (failed) {
        const r = await postJson<{ sheetJobId?: string; coverJobId?: string; freeLeft?: number }>("/api/libro/retry", { bookId });
        if (r.status !== 200 || !r.json.sheetJobId || !r.json.coverJobId) {
          setError(errorMessage(r.json));
          return;
        }
        if (r.json.freeLeft === 0) setLastFree(true);
        await refresh(bookId);
        await paint(bookId, r.json.sheetJobId, r.json.coverJobId);
      } else if (currentCover) await paint(bookId, current.id, currentCover.id);
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setRetrying(false);
    }
  };

  const ready = shownSheet?.status === "done";
  // pagado: los personajes ya no cambian (I2). Ni otra versión, ni elegir otra hoja: repintaba el libro entero
  const paid = !!view?.paid;
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <p className="hand text-[20px] text-accent">{ready ? "aquí están" : "manos a la obra"}</p>
        <h2 className="display text-[32px] sm:text-[42px]">Así será {name}</h2>
        <p className="text-ink-soft">
          {paid
            ? "Con este dibujo se pintan las doce páginas. El libro ya está pagado, así que los personajes ya no cambian: si una ilustración no te gusta, pide otra versión desde esa página del libro."
            : "Con este dibujo pintamos las doce páginas: así saldrán en todo el libro. Si algo no encaja, pídelo con palabras."}
        </p>
        {lastFree && <p className="m-0 text-[13px] text-mute" data-testid="last-free">Es tu tercer cuento con dibujos gratis de este mes.</p>}
      </div>

      {/* la tarjeta de espera, solo hasta que estén los personajes: la portada (otro minuto) se espera ya viéndolos */}
      {painting &&
        current?.status !== "done" &&
        (view ? (
          <WaitCard sheet={current} cover={currentCover} pages={record.plan.pages} background={view.background} mail={view.mail} testId="painting" />
        ) : (
          <Status testId="painting">{painting}</Status>
        ))}
      {loadError && !view && <LoadError text={loadError} />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {view && !paid && !painting && (failed || stuck) && <RetryNote failed={failed} busy={retrying} onRetry={retry} />}

      <figure className="m-0 grid gap-3">
        <Taped>
          <BookImage job={shownSheet} alt={`Así será ${name} en el libro: varias poses y caras`} testId="sheet" box="relative aspect-[3/2] w-full overflow-hidden rounded-[3px] bg-paper-deep" />
        </Taped>
        <figcaption className="text-sm text-mute">Sus personajes{versions.length > 1 && !paid ? ` · versión ${versionOf(shownSheet?.id)}` : ""}</figcaption>
      </figure>
      {versions.length > 1 && !paid && (
        <div className="-mt-4 flex flex-wrap gap-2" role="group" aria-label="Versiones de los personajes">
          {versions.map((s) => (
            <button
              key={s.id}
              aria-pressed={s.id === shownSheet?.id}
              className={`chip ${s.id === shownSheet?.id ? "chip-on" : ""}`}
              disabled={s.status !== "done"}
              onClick={async () => {
                const r = await postJson("/api/libro/approve", { bookId, sheetJobId: s.id });
                if (r.status === 200) await refresh(bookId);
              }}
            >
              Versión {versionOf(s.id)}
            </button>
          ))}
        </div>
      )}

      {view && !paid && current?.status === "done" && !painting && (
        <ChangeSheet
          left={view.sheetsLeft}
          onAsk={async (instruction) => {
            const r = await postJson<{ sheetJobId?: string; coverJobId?: string }>("/api/libro/sheet", { bookId, instruction });
            if (r.status !== 200 || !r.json.sheetJobId) return errorMessage(r.json);
            await refresh(bookId);
            await paint(bookId, r.json.sheetJobId, r.json.coverJobId!);
            return null;
          }}
        />
      )}

      <section className="grid items-center gap-6 sm:grid-cols-[300px_1fr] sm:gap-9" aria-label="La portada">
        <BookCover
          name={name}
          title={record.plan.title}
          from={ficha.from?.trim()}
          tilt={-2}
          className="w-[280px] justify-self-center sm:w-full"
          image={<BookImage job={cover} alt="Portada" testId="cover" box="absolute inset-0 overflow-hidden" />}
        />
        <div className="grid gap-3">
          <h3 className="display text-[26px]">La portada</h3>
          <p className="text-ink-soft">Pintada con estos personajes. El título lo componemos encima, como en el libro.</p>
          {cover?.status === "done" && (
            <PdfLink bookId={bookId} kind="free" className="rise flex items-center gap-3 rounded-[18px] bg-sage p-4 text-sage-ink transition-transform hover:-translate-y-0.5" testId="free-pdf">
              {(preparing) => (
                <>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card">
                    <Icon.download />
                  </span>
                  <span className="grid">
                    <span className="font-bold">{preparing ? "Preparando el PDF…" : "Tu cuento gratis en PDF"}</span>
                    <span className="text-sm">Portada y texto, para imprimir en A4 apaisado</span>
                  </span>
                </>
              )}
            </PdfLink>
          )}
        </div>
      </section>

      <BookLink bookId={bookId} mail={view?.mail} />

      <div className="actionbar">
        <button
          className="btn-primary btn-lg w-full sm:w-auto"
          disabled={!ready || !!painting}
          data-testid="approve"
          onClick={async () => {
            if (paid) return onNext();
            const r = await postJson("/api/libro/approve", { bookId, sheetJobId: shownSheet!.id });
            if (r.status === 200) {
              track({ name: "personajes_aprobados" });
              onNext();
            }
            else setError(errorMessage(r.json));
          }}
        >
          {paid ? "Volver al libro" : "Me gustan, ver el libro"}
          <Icon.arrow />
        </button>
        <p className="w-full text-center text-[13px] text-mute sm:w-auto sm:text-left">
          {paid ? "" : !ready ? "En cuanto estén, podrás seguir." : painting && cover?.status !== "done" ? "Falta la portada, alrededor de un minuto. Mientras, mira sus personajes." : "Gratis hasta aquí. Después decides si lo quieres ilustrado."}
        </p>
      </div>
    </div>
  );
}

function RetryNote({ failed, busy, onRetry }: { failed?: BookJobView; busy: boolean; onRetry: () => void }) {
  // el tope del libro no se renueva: sin botón, que solo volvería a fallar
  if (failed?.error === "limit")
    return (
      <p className="rise m-0 rounded-2xl bg-[#f6ded6] px-4 py-3.5 text-[15px] leading-snug text-ink" role="status" data-testid="cast-retry">
        Este cuento ya ha usado todos sus dibujos gratis. Escríbenos y lo miramos.
      </p>
    );
  const text =
    failed?.error === "budget"
      ? "Hoy ya hemos dibujado todo lo que podemos. Vuelve mañana y dale a «Reintentar»."
      : failed?.kind === "sheet"
        ? "El dibujo de los personajes no ha salido. Suele ser un fallo pasajero: dale a «Reintentar» y lo repetimos aquí, sin empezar otro cuento."
        : failed
          ? "La portada no ha salido. Dale a «Reintentar» y la repetimos."
          : "Está tardando más de lo normal. Dale a «Reintentar» y seguimos.";
  return (
    <div className="rise grid gap-3 rounded-2xl bg-[#f6ded6] px-4 py-3.5 text-[15px] leading-snug text-ink" role="status" data-testid="cast-retry">
      <p className="m-0">{text}</p>
      <div>
        <button className="btn-soft" disabled={busy} onClick={onRetry} data-testid="retry">
          {busy ? <Sparkle className="twinkle" size={14} /> : <Icon.brush size={16} />}
          Reintentar
        </button>
      </div>
    </div>
  );
}

function ChangeSheet({ left, onAsk }: { left: number; onAsk: (instruction: string) => Promise<string | null> }) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (left <= 0) return <p className="notice">Ya has usado los dos cambios de la hoja. Puedes elegir cualquiera de las versiones.</p>;
  return (
    <form
      className="card grid gap-3 p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ask.trim()) return;
        setBusy(true);
        setErr(await onAsk(ask.trim()));
        setBusy(false);
        setAsk("");
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor="change-sheet" className="display text-[20px]">
          ¿Cambiamos algo?
        </label>
        <span className="text-[13px] text-mute">te quedan {left}</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border-2 border-[#e5d7c1] bg-white py-1.5 pr-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_5px_rgba(200,73,44,0.12)]">
        <input
          id="change-sheet"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-soft/55 focus-visible:outline-none"
          value={ask}
          maxLength={240}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="más rizos; que el perro sea más pequeño; sin pecas"
        />
        <button aria-label="Pedir el cambio" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-paper transition-[transform,opacity] active:scale-95 disabled:opacity-35" disabled={busy || !ask.trim()}>
          {busy ? <Sparkle className="twinkle" size={16} /> : <Icon.arrow />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["sin pecas", "otras gafas", "el pelo más corto"].map((t) => (
          <button type="button" key={t} className="rounded-full bg-paper-deep px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink" onClick={() => setAsk(t)}>
            {t}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  );
}

function EmailGate({
  ficha,
  record,
  initialEmail,
  onStarted,
}: {
  ficha: Ficha;
  record: PlanRecord;
  initialEmail?: string;
  onStarted: (bookId: string, email: string, sheetJobId: string, coverJobId: string, freeLeft?: number) => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 26 oct: el buzón ya tiene sus cuentos gratis del periodo; no es un error, se le mandan por email
  const [limit, setLimit] = useState(false);
  const name = ficha.hero.name.trim();
  const others = ficha.cast.map((c) => c.name.trim()).filter(Boolean);
  const who = others.length ? `a ${name} y a ${others.join(" y a ")}` : `a ${name}`;
  const check = "flex cursor-pointer items-start gap-3 rounded-[18px] bg-card p-4 text-sm leading-relaxed text-ink-soft shadow-[0_2px_0_#eaddc6] transition-shadow has-checked:shadow-[0_0_0_2px_var(--ink)]";

  return (
    <form
      className="grid gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await postJson<{ bookId?: string; sheetJobId?: string; coverJobId?: string; freeLeft?: number; error?: string }>("/api/libro/start", {
            email,
            consent,
            marketing,
            ficha: normalizeFicha(ficha),
            plan: record.plan,
            planMeta: { provider: record.provider, model: record.model },
          });
          if (r.json.error === "free_limit") {
            setLimit(true);
            setBusy(false);
            return;
          }
          if (r.status !== 200 || !r.json.bookId) {
            setErr(errorMessage(r.json));
            setBusy(false);
            return;
          }
          await onStarted(r.json.bookId, email.trim().toLowerCase(), r.json.sheetJobId!, r.json.coverJobId!, r.json.freeLeft);
        } catch {
          setErr("Sin conexión. Inténtalo de nuevo.");
          setBusy(false);
        }
      }}
    >
      <div className="relative overflow-hidden rounded-[28px] bg-night px-6 pt-7 pb-7 text-moon sm:px-9 sm:pt-9">
        <Sparkle className="twinkle absolute top-6 right-7" size={16} />
        <Sparkle className="twinkle-slow absolute top-[46%] left-[46%]" size={9} color="var(--moon)" />
        <h2 className="display max-w-[16ch] text-[32px] text-moon sm:text-[42px]">
          Vamos a dibujar a <span className="text-star">{name}</span>
        </h2>
        <p className="mt-3 max-w-[48ch] text-moon-soft">
          En uno o dos minutos verás {who} y la portada del libro. Es gratis, igual que el cuento en PDF con la portada.
        </p>
        <div aria-hidden className="mt-7 grid max-w-[460px] grid-cols-2 items-end gap-5">
          <div className="grid aspect-[3/2] place-items-center rounded-2xl border-2 border-dashed border-moon/25 bg-night-2">
            <span className="hand px-3 text-center text-[18px] text-moon-soft">sus personajes</span>
          </div>
          <BookCover name={name} tilt={3} placeholder="su portada" />
        </div>
      </div>

      <label className="grid gap-1.5">
        <span className="field-label text-ink">Tu email</span>
        <input type="email" required value={email} onChange={(e) => {
            setEmail(e.target.value);
            setLimit(false);
          }} placeholder="tu@email.com" autoComplete="email" className="input" data-testid="email" />
        <span className="text-[13px] text-mute">Lo necesitamos para guardar el libro y mandarte el enlace con el que vuelves a él desde cualquier sitio.</span>
      </label>
      <div className="grid gap-2.5">
        <label className={check}>
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" data-testid="consent" />
          <span>
            Declaro ser madre, padre o tutor legal del menor, o contar con su autorización. Acepto que el cuento se guarde 30 días para poder recuperarlo con un enlace; después se borra. Si he
            contado algo de su salud, consiento que se use solo para hacer este libro. He leído la{" "}
            <Link href="/privacidad" target="_blank" className="link">
              política de privacidad
            </Link>{" "}
            y las{" "}
            <Link href="/condiciones" target="_blank" className="link">
              condiciones
            </Link>
            .
          </span>
        </label>
        <label className={check}>
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" />
          <span>{MARKETING_TEXT}</span>
        </label>
      </div>
      <p className="flex items-start gap-2 text-[13px] text-mute">
        <Icon.lock size={15} className="mt-0.5 shrink-0" />
        No pedimos fotos, apellidos ni fecha de nacimiento. A los 30 días, el libro se borra.
      </p>
      {err && <ErrorNote>{err}</ErrorNote>}
      {limit && (
        <div className="rise grid gap-2 rounded-[22px] bg-sage px-5 py-4 text-sage-ink" role="status" data-testid="free-limit">
          <p className="m-0 flex items-center gap-2 font-display text-[20px]">
            <Sparkle size={14} color="currentColor" /> Tus cuentos te esperan
          </p>
          <p className="m-0 text-[15px] leading-relaxed">
            Con este email ya tienes tres cuentos con sus personajes dibujados. Te los acabamos de mandar para que elijas el que más te guste y lo termines.
            En cuanto tengas uno, puedes empezar otro.
          </p>
          <p className="m-0 text-[13px]">Este cuento escrito no se pierde: se queda guardado en este navegador.</p>
        </div>
      )}
      <div className="actionbar">
        <button type="submit" className="btn-primary btn-lg w-full sm:w-auto" disabled={busy || limit} data-testid="start">
          {busy ? <Sparkle className="twinkle" size={16} color="#fff" /> : <Icon.brush />}
          {busy ? "Preparando…" : `Dibujar a ${name}`}
        </button>
        <p className="w-full text-center text-[13px] text-mute sm:w-auto sm:text-left">Gratis · Tarda alrededor de un minuto</p>
      </div>
    </form>
  );
}
