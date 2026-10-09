"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { Avatar } from "@/components/Avatar";
import { Scene } from "@/components/Scene";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { COMPANIONS, SPECIALS, companionVariants, defaultVariant, randomTraits } from "@/lib/traits";
import { BookPreview } from "@/components/BookPreview";
import { EmailForm } from "@/components/EmailForm";
import { buildBook, normalizeDraft } from "@/lib/story";
import { setDraft, useDraft } from "@/lib/draftStore";
import { saveBook, storeBookId } from "@/lib/bookSync";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import type { CompanionKind, Draft, Edition, SpecialId } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Quién" },
  { n: 2, label: "Su mundo" },
  { n: 3, label: "Leer" },
  { n: 4, label: "Imprimir" },
];

export default function CrearPage() {
  return (
    <Suspense fallback={null}>
      <Crear />
    </Suspense>
  );
}

function Crear() {
  const params = useSearchParams();
  const draft = useDraft();
  const b = params.get("b");
  const paso = Number(params.get("paso"));
  const [recovery, setRecovery] = useState<{ id: string; ok: boolean | null; notice: string | null } | null>(null);
  const recovering = !!b && recovery?.id !== b;

  useEffect(() => {
    if (!b) return;
    let alive = true;
    // enlace de recuperación: /crear?b=<public_id>
    fetch(`/api/books/${encodeURIComponent(b)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json?.ok && json.book?.draft) {
          setDraft(normalizeDraft(json.book.draft));
          storeBookId(b);
          setRecovery({ id: b, ok: true, notice: "Hemos recuperado tu cuento." });
        } else {
          setRecovery({ id: b, ok: false, notice: "Ese enlace ya no existe o ha caducado (guardamos los cuentos 30 días)." });
        }
      })
      .catch(() => alive && setRecovery({ id: b, ok: false, notice: "No hemos podido recuperar el cuento. Prueba otra vez más tarde." }));
    return () => {
      alive = false;
    };
  }, [b]);

  if (!draft || recovering) return null;
  const initial: Step = recovery?.ok ? 3 : paso >= 1 && paso <= 4 ? (paso as Step) : 1;
  // la key reinicia el paso cuando cambia la URL (p. ej. «Cambiar rasgos» → /crear?paso=1)
  return <CrearSteps key={`${b ?? ""}:${params.get("paso") ?? ""}`} draft={draft} initialStep={initial} notice={recovery?.notice ?? null} />;
}

function CrearSteps({ draft, initialStep, notice }: { draft: Draft; initialStep: Step; notice: string | null }) {
  const [step, setStep] = useState<Step>(initialStep);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const book = useMemo(() => buildBook(draft), [draft]);
  const canContinue = step !== 1 || draft.hero.name.trim().length > 0;

  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-lg font-black tracking-tight">
          cuentos<span className="text-coral">.</span>
        </Link>
        <ol className="flex items-center gap-1 text-xs font-bold text-ink-soft">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => s.n < step && setStep(s.n)}
                className={`rounded-full px-3 py-1 ${s.n === step ? "bg-ink text-white" : s.n < step ? "bg-white border border-line" : "opacity-50"}`}
              >
                {s.n}. {s.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <section className="mx-auto max-w-4xl px-5 pb-28">
        {draft.illustration?.paid && (
          <p className="mb-4 rounded-2xl border-2 border-line bg-white px-4 py-3 text-sm font-bold">
            Tienes una edición ilustrada en marcha.{" "}
            <Link href="/ilustrado" className="underline">
              Volver a la edición ilustrada
            </Link>
          </p>
        )}
        {notice && (
          <p role="status" className="mb-4 rounded-2xl border-2 border-line bg-white px-4 py-3 text-sm font-bold">
            {notice}
          </p>
        )}
        {step === 1 && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-black">¿Quién es el protagonista?</h1>
            <div className="card grid gap-4 md:grid-cols-[1fr_140px]">
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-wide text-ink-soft">Nombre</span>
                <input
                  value={draft.hero.name}
                  onChange={(e) => update({ hero: { ...draft.hero, name: e.target.value.slice(0, 20) } })}
                  placeholder="Lucas, Vera, Mateo…"
                  autoFocus
                  className="rounded-2xl border-2 border-line bg-cream px-4 py-3 text-lg font-bold outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-wide text-ink-soft">Cumple</span>
                <select
                  value={draft.hero.age}
                  onChange={(e) => update({ hero: { ...draft.hero, age: Number(e.target.value) } })}
                  className="rounded-2xl border-2 border-line bg-cream px-4 py-3 text-lg font-bold outline-none focus:border-ink"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((a) => (
                    <option key={a} value={a}>
                      {a} años
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="card">
              <h2 className="mb-4 text-lg font-black">¿Cómo es?</h2>
              <AvatarBuilder traits={draft.hero.traits} onChange={(traits) => update({ hero: { ...draft.hero, traits } })} />
            </div>
            <p className="text-sm text-ink-soft">
              No pedimos fotos a propósito: el avatar es lo único que necesita el cuento, y se queda en tu navegador.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-black">El mundo de {draft.hero.name.trim()}</h1>

            <div className="card">
              <h2 className="text-lg font-black">La ocasión</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="chip chip-on">
                  🎂 Cumpleaños
                </button>
                {["🎄 Navidad", "🚲 Primera bici", "👶 Hermanito nuevo", "🏫 Primer día de cole"].map((t) => (
                  <span key={t} className="chip cursor-not-allowed opacity-50" title="Pronto">
                    {t}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-soft">Las demás ocasiones llegan pronto. Si dejas tu email al final, te avisamos.</p>
            </div>

            <div className="card">
              <h2 className="text-lg font-black">¿Quién le acompaña?</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`chip ${!draft.companion ? "chip-on" : ""}`} onClick={() => update({ companion: undefined })}>
                  Nadie, solo {draft.hero.name.trim() || "el peque"}
                </button>
                {COMPANIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip ${draft.companion?.kind === c.id ? "chip-on" : ""}`}
                    onClick={() =>
                      update({
                        companion: {
                          kind: c.id as CompanionKind,
                          name: draft.companion?.name,
                          traits: c.needsTraits ? draft.companion?.traits ?? randomTraits(7) : undefined,
                          variant: draft.companion?.kind === c.id ? draft.companion.variant : defaultVariant(c.id as CompanionKind),
                        },
                      })
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {draft.companion && (
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-1 md:max-w-xs">
                    <span className="text-xs font-black uppercase tracking-wide text-ink-soft">Nombre (opcional)</span>
                    <input
                      value={draft.companion.name ?? ""}
                      onChange={(e) => update({ companion: { ...draft.companion!, name: e.target.value.slice(0, 20) } })}
                      placeholder={draft.companion.kind === "perro" ? "Toby" : draft.companion.kind === "gato" ? "Misi" : "Pili"}
                      className="rounded-2xl border-2 border-line bg-cream px-4 py-2 font-bold outline-none focus:border-ink"
                    />
                  </label>
                  {companionVariants(draft.companion.kind).length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-black uppercase tracking-wide text-ink-soft">¿Cuál se parece más?</div>
                      <div className="flex flex-wrap gap-2">
                        {companionVariants(draft.companion.kind).map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className={`chip ${(draft.companion?.variant ?? defaultVariant(draft.companion!.kind)) === v.id ? "chip-on" : ""}`}
                            onClick={() => update({ companion: { ...draft.companion!, variant: v.id } })}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(draft.companion.kind === "hermano" || draft.companion.kind === "hermana") && draft.companion.traits && (
                    <div>
                      <div className="mb-2 text-xs font-black uppercase tracking-wide text-ink-soft">¿Cómo es?</div>
                      <AvatarBuilder compact traits={draft.companion.traits} onChange={(traits) => update({ companion: { ...draft.companion!, traits } })} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="text-lg font-black">¿Qué le vuelve loco?</h2>
              <p className="text-sm text-ink-soft">Aparece en su deseo y en el regalo final.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SPECIALS.map((s) => (
                  <button key={s.id} type="button" className={`chip ${draft.special === s.id ? "chip-on" : ""}`} onClick={() => update({ special: s.id as SpecialId })}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <div>
              <h1 className="text-3xl font-black">{book.title}</h1>
              <p className="text-ink-soft">Doce páginas. Toca cualquier texto para cambiarlo.</p>
            </div>
            <BookPreview
              book={book}
              draft={draft}
              update={update}
              renderImage={(p) => (
                <Scene style={DEFAULT_PAINTED_STYLE}
                  scene={p.scene}
                  traits={draft.hero.traits}
                  expression={p.expression}
                  companion={p.withCompanion ? draft.companion : undefined}
                  special={draft.special}
                  age={draft.hero.age}
                  className="w-full"
                />
              )}
            />
          </div>
        )}

        {step === 4 && <EditionStep draft={draft} update={update} />}
      </section>

      <nav className="no-print fixed inset-x-0 bottom-0 border-t-2 border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3">
          <button type="button" className="btn-ghost" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
            Atrás
          </button>
          {step < 4 ? (
            <button type="button" className="btn-primary" disabled={!canContinue} onClick={() => setStep((s) => (s + 1) as Step)}>
              {step === 3 ? "Me gusta, a imprimir" : "Seguir"}
            </button>
          ) : (
            <span className="text-sm text-ink-soft">Elige una edición arriba</span>
          )}
        </div>
      </nav>
    </main>
  );
}

function EditionStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const choose = (edition: Edition) => update({ edition });
  const illustratedDemo = DRY_RUN_PAYMENT && draft.edition === "illustrated";

  return (
    <div className="grid gap-5">
      <h1 className="text-3xl font-black">¿Cómo lo quieres?</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <EditionCard
          on={draft.edition === "classic"}
          onClick={() => choose("classic")}
          title="Clásico · PDF"
          price="Gratis"
          desc="Las doce páginas en estilo clásico, en A4 para imprimir en casa. Listo ahora."
        />
        <EditionCard
          on={draft.edition === "illustrated"}
          onClick={() => choose("illustrated")}
          title="Ilustrado · PDF"
          price={DRY_RUN_PAYMENT ? "Demo" : "Pronto"}
          desc={
            DRY_RUN_PAYMENT
              ? "Cada página ilustrada en el estilo que elijas. En esta demo el pago es simulado y las ilustraciones son una vista previa."
              : "Cada página ilustrada en el estilo que elijas, con tu peque reconocible en todas. Te avisamos."
          }
          soon={!DRY_RUN_PAYMENT}
        />
        <EditionCard
          on={draft.edition === "hardcover"}
          onClick={() => choose("hardcover")}
          title="Tapa dura"
          price="Pronto"
          desc="El cuento ilustrado, impreso y encuadernado, en tu casa. Te avisamos."
          soon
        />
      </div>

      {illustratedDemo ? (
        <div className="card grid gap-3">
          <h2 className="text-lg font-black">Edición ilustrada (demo)</h2>
          <p className="text-sm text-ink-soft">
            Sigues a un paso de <strong>pago simulado</strong>: no se cobra nada. Después eliges el estilo, apruebas la hoja de personaje y ves
            el libro ilustrado en vista previa.
          </p>
          <Link href="/ilustrado" className="btn-primary justify-self-start" data-testid="go-illustrated">
            Seguir al pago simulado
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="mb-3 flex items-center gap-3">
            <Avatar traits={draft.hero.traits} expression="orgullo" size={56} />
            <div>
              <h2 className="text-lg font-black">{draft.edition === "classic" ? "Descarga el cuento" : "Avísame cuando esté"}</h2>
              <p className="text-sm text-ink-soft">
                {draft.edition === "classic"
                  ? "Te pedimos un email para guardarte un enlace al cuento por si lo pierdes. Se abre el PDF al instante."
                  : "Te escribimos solo cuando esta edición esté lista."}
              </p>
            </div>
          </div>
          <EmailForm
            key={draft.edition}
            edition={draft.edition}
            source="cuentos-web"
            initialEmail={draft.email ?? ""}
            submitLabel={draft.edition === "classic" ? "Abrir el PDF para imprimir" : "Avisadme"}
            openUrl={draft.edition === "classic" ? "/libro?print=1" : undefined}
            successMessage={
              draft.edition === "classic" ? (
                <p className="text-sm font-bold text-leaf">
                  Se ha abierto el cuento en una pestaña nueva. Si no,{" "}
                  <a className="underline" href="/libro?print=1" target="_blank">
                    ábrelo aquí
                  </a>{" "}
                  y usa «Guardar como PDF».
                </p>
              ) : (
                <p className="text-sm font-bold text-leaf">Apuntado. Mientras tanto, el clásico es gratis.</p>
              )
            }
            onSaved={async (email) => {
              update({ email });
              // guardar el cuento para el enlace de recuperación; si falla, el cuento sigue en este navegador
              const saved = await saveBook(draft, email);
              if (saved) setLink(`${window.location.origin}${saved.url}`);
            }}
          >
            {link && (
              <div className="rounded-2xl border-2 border-line bg-cream p-3 text-sm" data-testid="book-link">
                <p className="font-bold">Tu enlace para volver a este cuento (30 días):</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-lg bg-white px-2 py-1">{link}</code>
                  <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => navigator.clipboard?.writeText(link)}>
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </EmailForm>
        </div>
      )}
    </div>
  );
}

function EditionCard({ on, onClick, title, price, desc, soon = false }: { on: boolean; onClick: () => void; title: string; price: string; desc: string; soon?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`card text-left transition ${on ? "border-ink shadow-[0_4px_0_var(--ink)]" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${soon ? "bg-line text-ink-soft" : "bg-leaf text-white"}`}>{price}</span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{desc}</p>
    </button>
  );
}
