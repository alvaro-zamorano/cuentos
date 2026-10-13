"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookView } from "@/lib/book/service";
import { errorMessage, fetchView, postJson, runJobs, type JobOutcome } from "@/lib/bookClient";
import { normalizeFicha } from "@/lib/plan/ficha";
import type { Ficha, PlanRecord } from "@/lib/plan/types";
import { BookImage } from "./BookImage";

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
  onBack,
  onNext,
}: {
  ficha: Ficha;
  record: PlanRecord;
  bookId?: string;
  email?: string;
  onBook: (bookId: string, email: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [view, setView] = useState<BookView | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setPainting("Dibujando a los personajes. Tarda alrededor de un minuto.");
      const outcomes: JobOutcome[] = [];
      await runJobs([sheetJobId], 1, (_, o) => outcomes.push(o), cancel.current);
      await refresh(id);
      setPainting("Pintando la portada…");
      await runJobs([coverJobId], 1, (_, o) => outcomes.push(o), cancel.current);
      await refresh(id);
      setPainting(null);
      if (outcomes.includes("budget")) setError(errorMessage({ error: "budget", reason: "diario" }));
      else if (outcomes.some((o) => o !== "done")) setError("Alguna imagen no ha salido. Vuelve a intentarlo en un momento.");
    },
    [refresh],
  );

  // al volver a este paso con un libro ya creado: cargar y terminar lo que quedara a medias
  const resumed = useRef(false);
  useEffect(() => {
    if (!bookId || resumed.current) return;
    resumed.current = true;
    void (async () => {
      const v = await refresh(bookId);
      if (!v) return;
      const sheets = v.jobs.filter((j) => j.kind === "sheet");
      const last = sheets[sheets.length - 1];
      const cover = last ? v.jobs.find((j) => j.kind === "cover" && j.sheetJobId === last.id) : undefined;
      if (last && cover && (last.status === "pending" || cover.status === "pending")) await paint(bookId, last.id, cover.id);
    })();
  }, [bookId, paint, refresh]);

  if (!bookId) return <EmailGate ficha={ficha} record={record} initialEmail={email} onBack={onBack} onStarted={async (id, mail, sheet, cover) => {
    onBook(id, mail);
    resumed.current = true;
    await refresh(id);
    await paint(id, sheet, cover);
  }} />;

  const sheets = view?.jobs.filter((j) => j.kind === "sheet") ?? [];
  const current = sheets[sheets.length - 1];
  const chosenSheet = view?.chosen.sheet ? view.jobs.find((j) => j.id === view.chosen.sheet) : undefined;
  const shownSheet = chosenSheet ?? current;
  const cover = shownSheet ? view?.jobs.find((j) => j.kind === "cover" && j.sheetJobId === shownSheet.id) : undefined;
  const name = ficha.hero.name.trim();

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h2 className="display text-3xl sm:text-4xl">Así será {name}</h2>
        <p className="text-ink-soft">La hoja de personajes es la referencia del ilustrador: así saldrán en todas las páginas. Si algo no encaja, pídelo con palabras.</p>
      </div>

      {painting && (
        <p className="notice" aria-live="polite" data-testid="painting">
          {painting}
        </p>
      )}
      {error && <p className="notice !text-[#8a2a1c]">{error}</p>}

      <figure className="grid gap-2">
        <BookImage job={shownSheet} alt={`Hoja de personajes de ${name}`} testId="sheet" />
        <figcaption className="text-sm text-ink-soft">Hoja de personajes{sheets.length > 1 ? ` · versión ${shownSheet?.variant}` : ""}</figcaption>
      </figure>
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Versiones de la hoja">
          {sheets.map((s) => (
            <button
              key={s.id}
              className={`chip ${s.id === shownSheet?.id ? "chip-on" : ""}`}
              disabled={s.status !== "done"}
              onClick={async () => {
                const r = await postJson("/api/libro/approve", { bookId, sheetJobId: s.id });
                if (r.status === 200) await refresh(bookId);
              }}
            >
              Versión {s.variant}
            </button>
          ))}
        </div>
      )}

      <figure className="grid gap-2">
        <BookImage job={cover} alt="Portada" testId="cover" title={record.plan.title} />
        <figcaption className="text-sm text-ink-soft">Portada (el título lo componemos encima)</figcaption>
      </figure>

      {view && current?.status === "done" && !painting && (
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

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={onBack}>
          Volver al texto
        </button>
        <button
          className="btn-primary"
          disabled={!shownSheet || shownSheet.status !== "done" || !!painting}
          data-testid="approve"
          onClick={async () => {
            const r = await postJson("/api/libro/approve", { bookId, sheetJobId: shownSheet!.id });
            if (r.status === 200) onNext();
            else setError(errorMessage(r.json));
          }}
        >
          Me gustan, seguir
        </button>
        {cover?.status === "done" && (
          <a className="link text-sm" href={`/api/libro/pdf?b=${bookId}&kind=free`} data-testid="free-pdf">
            Descargar el cuento gratis en PDF (portada + texto)
          </a>
        )}
      </div>
    </div>
  );
}

function ChangeSheet({ left, onAsk }: { left: number; onAsk: (instruction: string) => Promise<string | null> }) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (left <= 0) return <p className="text-sm text-ink-soft">Ya has usado los dos cambios de la hoja. Puedes elegir cualquiera de las versiones.</p>;
  return (
    <form
      className="card grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ask.trim()) return;
        setBusy(true);
        setErr(await onAsk(ask.trim()));
        setBusy(false);
        setAsk("");
      }}
    >
      <label className="grid gap-1">
        <span className="field-label">¿Cambiamos algo? (te quedan {left})</span>
        <input className="input" value={ask} maxLength={240} onChange={(e) => setAsk(e.target.value)} placeholder="más rizos; que el perro sea más pequeño; sin pecas" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn-sm" disabled={busy || !ask.trim()}>
          {busy ? "Preparando…" : "Pedir el cambio"}
        </button>
        {err && <span className="text-sm text-[#8a2a1c]">{err}</span>}
      </div>
    </form>
  );
}

function EmailGate({
  ficha,
  record,
  initialEmail,
  onBack,
  onStarted,
}: {
  ficha: Ficha;
  record: PlanRecord;
  initialEmail?: string;
  onBack: () => void;
  onStarted: (bookId: string, email: string, sheetJobId: string, coverJobId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = ficha.hero.name.trim();

  return (
    <form
      className="grid max-w-xl gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await postJson<{ bookId?: string; sheetJobId?: string; coverJobId?: string }>("/api/libro/start", {
            email,
            consent,
            marketing,
            ficha: normalizeFicha(ficha),
            plan: record.plan,
            planMeta: { provider: record.provider, model: record.model },
          });
          if (r.status !== 200 || !r.json.bookId) {
            setErr(errorMessage(r.json));
            setBusy(false);
            return;
          }
          await onStarted(r.json.bookId, email.trim().toLowerCase(), r.json.sheetJobId!, r.json.coverJobId!);
        } catch {
          setErr("Sin conexión. Inténtalo de nuevo.");
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2">
        <h2 className="display text-3xl sm:text-4xl">Vamos a dibujar a {name}</h2>
        <p className="text-ink-soft">
          Te enseñamos cómo serán {name} y su reparto, y la portada del libro, en alrededor de un minuto. Es gratis, igual que el cuento en PDF con la portada. Necesitamos tu email para guardarlo
          y mandarte el enlace.
        </p>
      </div>
      <label className="grid gap-1">
        <span className="field-label">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" className="input" data-testid="email" />
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" data-testid="consent" />
        <span>
          Declaro ser madre, padre o tutor legal del menor, o contar con su autorización. Acepto que el cuento se guarde 30 días para poder recuperarlo con un enlace; después se borra. He leído la{" "}
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
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <span>Quiero recibir avisos de nuevas ideas y ediciones. Opcional; puedes darte de baja cuando quieras.</span>
      </label>
      {err && <p className="text-sm text-[#8a2a1c]">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Atrás
        </button>
        <button type="submit" className="btn-primary" disabled={busy} data-testid="start">
          {busy ? "Preparando…" : `Dibujar a ${name}`}
        </button>
      </div>
    </form>
  );
}
