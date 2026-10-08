"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookPreview } from "@/components/BookPreview";
import { CharacterSheet } from "@/components/CharacterSheet";
import { IllustratedScene } from "@/components/IllustratedScene";
import { StyleImage } from "@/components/StyleImage";
import { getDraft, setDraft, useDraft } from "@/lib/draftStore";
import { saveBook, storedBookId, syncBook } from "@/lib/bookSync";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { STYLES, getStyle } from "@/lib/generation/styles";
import {
  DRY_RUN_NOTICE,
  dryRunIllustratePage,
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
        <p className="text-lg font-bold">Primero crea el cuento: con el nombre basta.</p>
        <Link href="/crear" className="btn-primary mt-4 self-start">
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
      {view === "estilo" && <StylePicker draft={draft} onPicked={() => setOverride(null)} />}
      {view === "hoja" && draft.styleId && <SheetStep draft={draft} styleId={draft.styleId} onBack={() => setOverride("estilo")} onApproved={() => setOverride(null)} />}
      {view === "progreso" && draft.styleId && <ProgressStep draft={draft} styleId={draft.styleId} />}
      {view === "preview" && draft.styleId && <PreviewStep draft={draft} styleId={draft.styleId} onChangeStyle={() => setOverride("estilo")} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-lg font-black tracking-tight">
          cuentos<span className="text-coral">.</span>
        </Link>
        <Link href="/crear?paso=3" className="text-sm font-bold text-ink-soft underline">
          Volver al cuento
        </Link>
      </header>
      <section className="mx-auto flex max-w-4xl flex-col gap-5 px-5 pb-16">{children}</section>
    </main>
  );
}

function NotAvailable() {
  return (
    <Shell>
      <h1 className="text-3xl font-black">La edición ilustrada llega pronto</h1>
      <p className="text-ink-soft">Mientras tanto, el cuento clásico es gratis y se imprime en casa.</p>
      <Link href="/crear" className="btn-primary self-start">
        Crear el cuento clásico
      </Link>
    </Shell>
  );
}

function Steps({ view, derived, onGo }: { view: View; derived: View; onGo: (v: View) => void }) {
  const items: { v: View; label: string }[] = [
    { v: "estilo", label: "Estilo" },
    { v: "hoja", label: "Personaje" },
    { v: "progreso", label: "Ilustrando" },
    { v: "preview", label: "Tu libro" },
  ];
  const order = items.map((i) => i.v);
  return (
    <ol className="flex flex-wrap gap-1 text-xs font-bold text-ink-soft">
      {items.map((it, i) => {
        const reachable = i <= order.indexOf(derived) && it.v !== "progreso";
        return (
          <li key={it.v}>
            <button
              type="button"
              disabled={!reachable || it.v === view}
              onClick={() => onGo(it.v)}
              className={`rounded-full px-3 py-1 ${it.v === view ? "bg-ink text-white" : reachable ? "border border-line bg-white" : "opacity-50"}`}
            >
              {i + 1}. {it.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ pago simulado ------------------------------ */

function SimulatedPayment() {
  const [declared, setDeclared] = useState(false);
  return (
    <Shell>
      <div className="rounded-2xl border-2 border-dashed border-coral bg-white px-4 py-3 text-sm font-black text-coral" role="note">
        PAGO SIMULADO · modo demostración · no se cobra nada ni se piden datos de pago
      </div>
      <h1 className="text-3xl font-black">Edición ilustrada</h1>
      <div className="card grid gap-3">
        <p className="text-ink-soft">
          En la versión real aquí iría el pago con Stripe. En esta demo el botón solo marca el pedido como «pagado» en tu navegador para que
          puedas ver el resto del proceso: elegir estilo, aprobar la hoja de personaje y ver el libro ilustrado.
        </p>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-1" data-testid="buyer-declaration" />
          <span>
            Declaro que soy madre, padre o tutor del peque, o que cuento con su autorización. Sé que un libro personalizado no admite desistimiento
            (art. 103.c TRLGDCU). Ver{" "}
            <Link href="/condiciones" target="_blank" className="underline">
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
          Simular pago (0 €)
        </button>
      </div>
    </Shell>
  );
}

/* --------------------------------- estilo --------------------------------- */

function StylePicker({ draft, onPicked }: { draft: Draft; onPicked: () => void }) {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-3xl font-black">Elige el estilo</h1>
        <p className="text-ink-soft">Así se verán las doce páginas. Si cambias de estilo después, la hoja de personaje se vuelve a aprobar.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {STYLES.map((s) => {
          const on = draft.styleId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              data-testid={`style-${s.id}`}
              aria-pressed={on}
              onClick={() => {
                setDraft((d) => ({ ...d, styleId: s.id }));
                onPicked();
              }}
              className={`card overflow-hidden p-0 text-left transition ${on ? "border-ink shadow-[0_4px_0_var(--ink)]" : ""}`}
            >
              <StyleImage styleId={s.id} className="aspect-[3/2] w-full object-cover" />
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-black">{s.label}</span>
                {on && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-black text-white">Elegido</span>}
              </div>
            </button>
          );
        })}
      </div>
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
    <div className="grid gap-4">
      <div>
        <h1 className="text-3xl font-black">Así va a ser {name}</h1>
        <p className="text-ink-soft">Esta hoja es la referencia de todas las páginas. Si algo no encaja, cambia los rasgos antes de seguir.</p>
      </div>
      <p className="rounded-2xl bg-sun/30 px-4 py-2 text-sm font-bold">{DRY_RUN_NOTICE}.</p>
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
          const r = await dryRunIllustratePage(styleId, n, 0, ctrl.signal);
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
    <div className="grid gap-4">
      <div>
        <h1 className="text-3xl font-black">Ilustrando el cuento de {draft.hero.name.trim()}</h1>
        <p className="text-ink-soft" data-testid="progress-count">
          {doneCount} de 12 páginas
        </p>
      </div>
      <p className="rounded-2xl bg-sun/30 px-4 py-2 text-sm font-bold">{DRY_RUN_NOTICE}.</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="progress-grid">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <div key={n} className="overflow-hidden rounded-2xl border-2 border-line bg-white" data-testid={`slot-${n}`} data-done={done[n] ? "1" : "0"}>
            {done[n] ? (
              <IllustratedScene
                styleId={styleId}
                n={n}
                variant={done[n].variant}
                traits={draft.hero.traits}
                companion={book.pages[n - 1]?.withCompanion ? draft.companion : undefined}
              />
            ) : (
              <div className="flex aspect-[3/2] items-center justify-center text-sm font-black text-ink-soft">
                <span className="animate-pulse">{n}</span>
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
    await dryRunIllustratePage(styleId, n, next);
    patchIllustration((ill) => ({ pages: { ...ill.pages, [n]: { variant: next } } }));
    setBusy((b) => ({ ...b, [n]: false }));
  };

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-3xl font-black">{book.title}</h1>
        <p className="text-ink-soft">
          Estilo {getStyle(styleId)?.label}. Toca cualquier texto para cambiarlo; «Otra versión» cambia la ilustración de esa página.
        </p>
      </div>
      <p className="rounded-2xl bg-sun/30 px-4 py-2 text-sm font-bold" data-testid="dry-run-notice">
        {DRY_RUN_NOTICE}.
      </p>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <span className="font-bold">13 hojas A4 apaisadas, con las ilustraciones.</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={onChangeStyle}>
            Cambiar estilo
          </button>
          <a href="/libro?edition=illustrated&print=1" target="_blank" className="btn-primary px-4 py-2 text-sm" data-testid="illustrated-pdf">
            Descargar PDF ilustrado
          </a>
        </div>
      </div>
      <BookPreview
        book={book}
        draft={draft}
        update={update}
        renderImage={(p) => (
          <IllustratedScene
            styleId={styleId}
            n={p.n}
            variant={pages[p.n]?.variant ?? 0}
            traits={draft.hero.traits}
            companion={p.withCompanion ? draft.companion : undefined}
            className={busy[p.n] ? "opacity-50" : ""}
          />
        )}
        renderActions={(p) => (
          <button
            type="button"
            className="text-xs font-bold text-ink-soft underline disabled:opacity-40"
            disabled={busy[p.n]}
            data-testid={`regen-${p.n}`}
            onClick={() => regenerate(p.n)}
          >
            {busy[p.n] ? "Generando…" : "Otra versión"}
          </button>
        )}
      />
    </div>
  );
}
