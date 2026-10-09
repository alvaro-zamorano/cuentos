"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookPreview } from "@/components/BookPreview";
import { CharacterSheet } from "@/components/CharacterSheet";
import { IllustratedScene, paintedStyleFor, pendingStyleNotice } from "@/components/IllustratedScene";
import { SiteHeader } from "@/components/SiteHeader";
import { StyleImage } from "@/components/StyleImage";
import { getDraft, setDraft, useDraft } from "@/lib/draftStore";
import { saveBook, storedBookId, syncBook } from "@/lib/bookSync";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { STYLES, getStyle } from "@/lib/generation/styles";
import { piecesFor } from "@/lib/pieces";
import { PRICE_ILLUSTRATED } from "@/lib/pricing";
import {
  illustratePage,
  getIllustration,
  pagesKey,
  sheetIsValid,
  sheetKey,
  validPages,
} from "@/lib/illustration";
import { buildBook } from "@/lib/story";
import type { Draft, Illustration, StyleId } from "@/lib/types";

type View = "estilo" | "hoja" | "progreso" | "preview";
const VARIANTS = 6;

function patchIllustration(patch: Partial<Illustration> | ((ill: Illustration, d: Draft) => Partial<Illustration>), extra: Partial<Draft> = {}) {
  setDraft((d) => {
    const ill = getIllustration(d);
    const p = typeof patch === "function" ? patch(ill, d) : patch;
    return { ...d, ...extra, illustration: { ...ill, ...p } };
  });
}

export default function IlustradoPage() {
  const draft = useDraft();
  if (!draft) return null;
  if (!DRY_RUN_PAYMENT) return <NotAvailable />;
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
  return <Flow draft={draft} />;
}

function derivedView(draft: Draft): View {
  if (!draft.styleId) return "estilo";
  if (!sheetIsValid(draft)) return "hoja";
  return Object.keys(validPages(draft)).length >= 12 ? "preview" : "progreso";
}

function Flow({ draft }: { draft: Draft }) {
  const ill = getIllustration(draft);
  const [override, setOverride] = useState<View | null>(null);
  const derived = derivedView(draft);
  // solo se puede «volver atrás» a una vista anterior a la derivada (nunca saltarse la hoja)
  const order: View[] = ["estilo", "hoja", "progreso", "preview"];
  const view = override && order.indexOf(override) <= order.indexOf(derived) ? override : derived;

  // sincroniza el estado ilustrado con cuentos_books.draft si el libro ya existe en el servidor (503 sin Supabase: no pasa nada)
  const syncKey = JSON.stringify([draft.styleId, draft.illustration, draft.textOverrides]);
  useEffect(() => {
    const t = setTimeout(() => void syncBook(draft), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  if (!ill.paid) return <SimulatedPayment />;

  return (
    <Shell>
      <Steps view={view} onGo={(v) => setOverride(v)} derived={derived} />
      {view === "estilo" && <StylePicker draft={draft} onPicked={() => setOverride(null)} onPendingPicked={() => setOverride("estilo")} />}
      {view === "hoja" && draft.styleId && <SheetStep draft={draft} styleId={draft.styleId} onBack={() => setOverride("estilo")} onApproved={() => setOverride(null)} />}
      {view === "progreso" && draft.styleId && <ProgressStep draft={draft} styleId={draft.styleId} />}
      {view === "preview" && draft.styleId && <PreviewStep draft={draft} styleId={draft.styleId} onChangeStyle={() => setOverride("estilo")} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <SiteHeader>
        <Link href="/crear?paso=3" className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink">
          Volver al cuento
        </Link>
      </SiteHeader>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-20 pt-2 sm:px-6">{children}</section>
    </main>
  );
}

function NotAvailable() {
  return (
    <Shell>
      <h1 className="display text-[34px] md:text-[44px]">Edición ilustrada</h1>
      <p className="max-w-[60ch] text-ink-soft">Disponible próximamente. La edición clásica es gratuita y se imprime en casa.</p>
      <Link href="/crear" className="btn-primary self-start">
        Crear la edición clásica
      </Link>
    </Shell>
  );
}

function Steps({ view, derived, onGo }: { view: View; derived: View; onGo: (v: View) => void }) {
  const items: { v: View; label: string }[] = [
    { v: "estilo", label: "Estilo" },
    { v: "hoja", label: "Personaje" },
    { v: "progreso", label: "Pintado" },
    { v: "preview", label: "El libro" },
  ];
  const order = items.map((i) => i.v);
  return (
    <nav aria-label="Pasos de la edición ilustrada">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-3 text-[13px] text-ink-soft">
        {items.map((it, i) => {
          const reachable = i <= order.indexOf(derived) && it.v !== "progreso";
          return (
            <li key={it.v} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-ink-soft/50">
                  ·
                </span>
              )}
              <button
                type="button"
                disabled={!reachable || it.v === view}
                aria-current={it.v === view ? "step" : undefined}
                onClick={() => onGo(it.v)}
                className={`py-1 ${it.v === view ? "font-medium text-ink" : reachable ? "hover:text-ink hover:underline" : "text-ink-soft/60"}`}
              >
                <span className="tabular-nums">{i + 1}</span> {it.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------ pago simulado ------------------------------ */

function SimulatedPayment() {
  const [declared, setDeclared] = useState(false);
  return (
    <Shell>
      <p className="notice" role="note">
        Pago de prueba — sin cargo. No se piden datos de pago.
      </p>
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Edición ilustrada</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          Después del pago eliges el estilo, apruebas la hoja de personaje y se pinta el libro página a página. Puedes pedir otra versión de cada
          página y seguir cambiando el texto.
        </p>
      </div>
      <div className="grid gap-5 rounded-[8px] border border-line bg-card p-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="font-display text-lg font-medium">Ilustrado · PDF</span>
          <span className="font-display text-xl">{PRICE_ILLUSTRATED}</span>
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
            data-testid="buyer-declaration"
          />
          <span>
            Declaro ser madre, padre o tutor legal del menor, o contar con su autorización. Sé que un libro personalizado no admite desistimiento
            (art. 103.c TRLGDCU). Ver{" "}
            <Link href="/condiciones" target="_blank" className="link">
              condiciones
            </Link>
            .
          </span>
        </label>
        <button
          type="button"
          className="btn-primary justify-self-start"
          disabled={!declared}
          data-testid="simulate-payment"
          onClick={() => {
            patchIllustration({ paid: true, buyerDeclaration: true }, { edition: "illustrated" });
            // crea o actualiza el libro en Supabase si hay backend; si no, sigue en el navegador
            void saveBook(getDraft());
          }}
        >
          Confirmar pago de prueba
        </button>
      </div>
    </Shell>
  );
}

/* --------------------------------- estilo --------------------------------- */

function StylePicker({ draft, onPicked, onPendingPicked }: { draft: Draft; onPicked: () => void; onPendingPicked: () => void }) {
  const chosen = draft.styleId ? getStyle(draft.styleId) : undefined;
  const chosenPending = !!draft.styleId && !piecesFor(draft.styleId);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Elige el estilo</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">Así se pintarán las doce páginas. Si cambias de estilo después, la hoja de personaje se vuelve a aprobar.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {STYLES.map((s) => {
          const on = draft.styleId === s.id;
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
                if (available) onPicked();
                else onPendingPicked();
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
          <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={onPicked}>
            Continuar en {getStyle(paintedStyleFor(chosen.id))?.label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ hoja de personaje ------------------------------ */

function SheetStep({ draft, styleId, onBack, onApproved }: { draft: Draft; styleId: StyleId; onBack: () => void; onApproved: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = draft.hero.name.trim();
  const approve = async () => {
    setBusy(true);
    let jobId: string | undefined;
    // con Supabase: guarda el libro y crea el job `sheet` (dry-run, sin coste); sin Supabase sigue en cliente
    const saved = (storedBookId() ? { public_id: storedBookId()! } : null) ?? (await saveBook(draft));
    if (saved) {
      try {
        await saveBook(draft);
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: saved.public_id, kind: "sheet", style_id: styleId, dry_run: true }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) jobId = json.jobs?.[0];
      } catch {
        /* sin backend: seguimos en cliente */
      }
    }
    patchIllustration((_ill, d) => ({ sheetApproved: true, sheetKey: sheetKey(d), sheetJobId: jobId, pages: {}, pagesKey: undefined }));
    setBusy(false);
    onApproved();
  };
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Así va a ser {name}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">Esta hoja es la referencia de las doce páginas. Si algo no encaja, cambia los rasgos antes de aprobarla.</p>
      </div>
      <CharacterSheet styleId={styleId} traits={draft.hero.traits} name={name} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={approve} disabled={busy} data-testid="approve-sheet">
          {busy ? "Guardando…" : "Aprobar"}
        </button>
        <Link href="/crear?paso=1" className="btn-ghost" data-testid="change-traits">
          Cambiar rasgos
        </Link>
        <button type="button" className="btn-ghost" onClick={onBack}>
          Otro estilo
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- progreso --------------------------------- */

function ProgressStep({ draft, styleId }: { draft: Draft; styleId: StyleId }) {
  const done = validPages(draft);
  const book = useMemo(() => buildBook(draft), [draft]);
  const doneCount = Object.keys(done).length;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctrl = new AbortController();
    (async () => {
      // si cambió algo desde la última vez, se empieza de cero
      patchIllustration((ill, d) => (ill.pagesKey === pagesKey(d) ? {} : { pages: {}, pagesKey: pagesKey(d) }));
      for (let n = 1; n <= 12; n++) {
        if (validPages(getDraft())[n]) continue;
        try {
          const r = await illustratePage(styleId, n, 0, ctrl.signal);
          patchIllustration((ill) => ({ pages: { ...ill.pages, [n]: { variant: r.variant } } }));
        } catch {
          return;
        }
      }
    })();
    return () => {
      ctrl.abort();
      started.current = false;
    };
  }, [styleId]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Pintando el cuento de {draft.hero.name.trim()}</h1>
        <p className="mt-2 text-ink-soft" data-testid="progress-count" aria-live="polite">
          {doneCount} de 12 páginas
        </p>
      </div>
      <div className="h-px w-full bg-line" aria-hidden>
        <div className="h-px bg-ink transition-[width] duration-300" style={{ width: `${(doneCount / 12) * 100}%` }} />
      </div>
      {paintedStyleFor(styleId) !== styleId && <p className="text-sm text-ink-soft">{pendingStyleNotice()}.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3" data-testid="progress-grid">
        {book.pages.map((p) => (
          <div key={p.n} className="overflow-hidden rounded-[4px] border border-line bg-card" data-testid={`slot-${p.n}`} data-done={done[p.n] ? "1" : "0"}>
            {done[p.n] ? (
              <IllustratedScene styleId={styleId} page={p} variant={done[p.n].variant} draft={draft} showNotice={false} />
            ) : (
              <div className="flex aspect-[3/2] items-center justify-center bg-paper text-sm text-ink-soft/70">
                <span className="tabular-nums">{p.n}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- preview --------------------------------- */

function PreviewStep({ draft, styleId, onChangeStyle }: { draft: Draft; styleId: StyleId; onChangeStyle: () => void }) {
  const book = useMemo(() => buildBook(draft), [draft]);
  const pages = validPages(draft);
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const regenerate = async (n: number) => {
    const next = ((pages[n]?.variant ?? 0) + 1) % VARIANTS;
    setBusy((b) => ({ ...b, [n]: true }));
    await illustratePage(styleId, n, next);
    patchIllustration((ill) => ({ pages: { ...ill.pages, [n]: { variant: next } } }));
    setBusy((b) => ({ ...b, [n]: false }));
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">{book.title}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          Estilo {getStyle(styleId)?.label.toLowerCase()}. Puedes cambiar cualquier texto; «Otra versión» vuelve a pintar esa página.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
        <span className="text-sm text-ink-soft">13 hojas A4 apaisadas, portada incluida.</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onChangeStyle}>
            Cambiar estilo
          </button>
          <a href="/libro?edition=illustrated&print=1" target="_blank" className="btn-primary btn-sm" data-testid="illustrated-pdf">
            Descargar PDF
          </a>
        </div>
      </div>
      <BookPreview
        book={book}
        draft={draft}
        update={update}
        renderImage={(p) => (
          <IllustratedScene styleId={styleId} page={p} variant={pages[p.n]?.variant ?? 0} draft={draft} className={busy[p.n] ? "opacity-50" : ""} />
        )}
        renderActions={(p) => (
          <button
            type="button"
            className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-40"
            disabled={busy[p.n]}
            data-testid={`regen-${p.n}`}
            onClick={() => regenerate(p.n)}
          >
            {busy[p.n] ? "Pintando…" : "Otra versión"}
          </button>
        )}
      />
    </div>
  );
}
