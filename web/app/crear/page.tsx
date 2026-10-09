"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { Scene } from "@/components/Scene";
import { SiteHeader } from "@/components/SiteHeader";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { COMPANIONS, SPECIALS, companionVariants, defaultVariant, randomTraits } from "@/lib/traits";
import { BookPreview } from "@/components/BookPreview";
import { EmailForm } from "@/components/EmailForm";
import { buildBook, normalizeDraft } from "@/lib/story";
import { setDraft, useDraft } from "@/lib/draftStore";
import { saveBook, storeBookId } from "@/lib/bookSync";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { EDITION_PRICE } from "@/lib/pricing";
import type { CompanionKind, Draft, Edition, SpecialId } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Quién" },
  { n: 2, label: "Su mundo" },
  { n: 3, label: "El libro" },
  { n: 4, label: "Edición" },
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
          setRecovery({ id: b, ok: true, notice: "Cuento recuperado." });
        } else {
          setRecovery({ id: b, ok: false, notice: "Este enlace ya no es válido. Guardamos los cuentos 30 días." });
        }
      })
      .catch(() => alive && setRecovery({ id: b, ok: false, notice: "No se ha podido recuperar el cuento. Inténtalo de nuevo más tarde." }));
    return () => {
      alive = false;
    };
  }, [b]);

  if (!draft || recovering) return null;
  const initial: Step = recovery?.ok ? 3 : paso >= 1 && paso <= 4 ? (paso as Step) : 1;
  // la key reinicia el paso cuando cambia la URL (p. ej. «Cambiar rasgos» → /crear?paso=1)
  return <CrearSteps key={`${b ?? ""}:${params.get("paso") ?? ""}`} draft={draft} initialStep={initial} notice={recovery?.notice ?? null} />;
}

function Progress({ step, onGo }: { step: Step; onGo: (s: Step) => void }) {
  return (
    <nav aria-label="Pasos" className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-3 text-[13px] text-ink-soft">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-ink-soft/50">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => s.n < step && onGo(s.n)}
              disabled={s.n > step}
              aria-current={s.n === step ? "step" : undefined}
              className={`py-1 ${s.n === step ? "font-medium text-ink" : s.n < step ? "hover:text-ink hover:underline" : "text-ink-soft/60"}`}
            >
              <span className="tabular-nums">{s.n}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CrearSteps({ draft, initialStep, notice }: { draft: Draft; initialStep: Step; notice: string | null }) {
  const [step, setStep] = useState<Step>(initialStep);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const book = useMemo(() => buildBook(draft), [draft]);
  const canContinue = step !== 1 || draft.hero.name.trim().length > 0;
  const name = draft.hero.name.trim();
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="flex-1">
      <SiteHeader />
      <Progress step={step} onGo={go} />

      <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6">
        {draft.illustration?.paid && (
          <p className="notice mb-6">
            Tienes una edición ilustrada en curso.{" "}
            <Link href="/ilustrado" className="link">
              Volver a la edición ilustrada
            </Link>
          </p>
        )}
        {notice && (
          <p role="status" className="notice mb-6">
            {notice}
          </p>
        )}

        {step === 1 && (
          <div className="grid gap-8">
            <h1 className="display text-[34px] md:text-[44px]">¿Quién es el protagonista?</h1>
            <div className="grid grid-cols-[1fr_7.5rem] gap-6">
              <label className="grid gap-1">
                <span className="field-label">Nombre</span>
                <input
                  value={draft.hero.name}
                  onChange={(e) => update({ hero: { ...draft.hero, name: e.target.value.slice(0, 20) } })}
                  placeholder="Lucas, Vera, Mateo…"
                  autoFocus
                  className="input"
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">Cumple</span>
                <select value={draft.hero.age} onChange={(e) => update({ hero: { ...draft.hero, age: Number(e.target.value) } })} className="input">
                  {[2, 3, 4, 5, 6, 7, 8].map((a) => (
                    <option key={a} value={a}>
                      {a} años
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Section title="Cómo es">
              <AvatarBuilder traits={draft.hero.traits} onChange={(traits) => update({ hero: { ...draft.hero, traits } })} />
            </Section>
            <p className="text-sm text-ink-soft">No pedimos fotos. El avatar es todo lo que necesita el cuento y se queda en tu navegador.</p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-8">
            <h1 className="display text-[34px] md:text-[44px]">El mundo de {name}</h1>

            <Section title="Ocasión" hint="Navidad, primera bici, un hermano nuevo y el primer día de colegio llegarán más adelante.">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="chip chip-on" aria-pressed>
                  Cumpleaños
                </button>
                {["Navidad", "Primera bici", "Un hermano nuevo", "Primer día de colegio"].map((t) => (
                  <span key={t} className="chip cursor-not-allowed opacity-45" title="Próximamente">
                    {t}
                  </span>
                ))}
              </div>
            </Section>

            <Section title="Quién le acompaña">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`chip ${!draft.companion ? "chip-on" : ""}`} aria-pressed={!draft.companion} onClick={() => update({ companion: undefined })}>
                  Solo {name || "el protagonista"}
                </button>
                {COMPANIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={draft.companion?.kind === c.id}
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
                <div className="mt-6 grid gap-6">
                  <label className="grid max-w-xs gap-1">
                    <span className="field-label">Nombre (opcional)</span>
                    <input
                      value={draft.companion.name ?? ""}
                      onChange={(e) => update({ companion: { ...draft.companion!, name: e.target.value.slice(0, 20) } })}
                      placeholder={draft.companion.kind === "perro" ? "Toby" : draft.companion.kind === "gato" ? "Misi" : "Pili"}
                      className="input"
                    />
                  </label>
                  {companionVariants(draft.companion.kind).length > 0 && (
                    <div>
                      <div className="field-label mb-2">Cuál se parece más</div>
                      <div className="flex flex-wrap gap-2">
                        {companionVariants(draft.companion.kind).map((v) => {
                          const on = (draft.companion?.variant ?? defaultVariant(draft.companion!.kind)) === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              aria-pressed={on}
                              className={`chip ${on ? "chip-on" : ""}`}
                              onClick={() => update({ companion: { ...draft.companion!, variant: v.id } })}
                            >
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(draft.companion.kind === "hermano" || draft.companion.kind === "hermana") && draft.companion.traits && (
                    <div>
                      <div className="field-label mb-2">Cómo es</div>
                      <AvatarBuilder compact traits={draft.companion.traits} onChange={(traits) => update({ companion: { ...draft.companion!, traits } })} />
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Lo que más le gusta" hint="Aparece en su deseo y en el regalo del final.">
              <div className="flex flex-wrap gap-2">
                {SPECIALS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={draft.special === s.id}
                    className={`chip ${draft.special === s.id ? "chip-on" : ""}`}
                    onClick={() => update({ special: s.id as SpecialId })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Section>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-6">
            <div>
              <h1 className="display text-[34px] md:text-[44px]">{book.title}</h1>
              <p className="mt-2 text-ink-soft">Doce páginas. Puedes cambiar cualquier texto.</p>
            </div>
            <BookPreview
              book={book}
              draft={draft}
              update={update}
              renderImage={(p) => (
                <Scene
                  style={DEFAULT_PAINTED_STYLE}
                  scene={p.scene}
                  traits={draft.hero.traits}
                  expression={p.expression}
                  companion={p.withCompanion ? draft.companion : undefined}
                  special={draft.special}
                  age={draft.hero.age}
                  className="block w-full"
                />
              )}
            />
          </div>
        )}

        {step === 4 && <EditionStep draft={draft} update={update} />}
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" className="btn-ghost" disabled={step === 1} onClick={() => go((step - 1) as Step)}>
            Atrás
          </button>
          {step < 4 ? (
            <button type="button" className="btn-primary min-w-36" disabled={!canContinue} onClick={() => go((step + 1) as Step)}>
              Continuar
            </button>
          ) : (
            <span className="text-sm text-ink-soft">Elige una edición</span>
          )}
        </div>
      </nav>
    </main>
  );
}

function EditionStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const choose = (edition: Edition) => update({ edition });
  const name = draft.hero.name.trim();
  const illustratedTrial = DRY_RUN_PAYMENT && draft.edition === "illustrated";

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="display text-[34px] md:text-[44px]">Elige la edición</h1>
        <p className="mt-2 text-ink-soft">El texto es el mismo en las tres. Cambia cómo se ilustra y cómo llega.</p>
      </div>
      <div className="grid gap-3" role="radiogroup" aria-label="Edición">
        <EditionCard
          on={draft.edition === "classic"}
          onClick={() => choose("classic")}
          title="Clásico · PDF"
          price={EDITION_PRICE.classic}
          desc="Las doce páginas ilustradas en gouache, en A4 apaisado para imprimir en casa."
        />
        <EditionCard
          on={draft.edition === "illustrated"}
          onClick={() => choose("illustrated")}
          title="Ilustrado · PDF"
          price={EDITION_PRICE.illustrated}
          desc={`Eliges el estilo, apruebas la hoja de personaje de ${name || "tu hijo"} y puedes pedir otra versión de cada página.`}
          status={DRY_RUN_PAYMENT ? undefined : "Próximamente"}
        />
        <EditionCard
          on={draft.edition === "hardcover"}
          onClick={() => choose("hardcover")}
          title="Tapa dura"
          price={EDITION_PRICE.hardcover}
          desc="El libro ilustrado, impreso y encuadernado, enviado a tu casa."
          status="Próximamente"
        />
      </div>

      {illustratedTrial ? (
        <section className="border-t border-line pt-6">
          <h2 className="font-display text-xl font-medium">Edición ilustrada</h2>
          <p className="mt-2 max-w-[60ch] text-ink-soft">
            Primero el pago. Después eliges el estilo, apruebas la hoja de personaje y se pinta el libro página a página.
          </p>
          <Link href="/ilustrado" className="btn-primary mt-5" data-testid="go-illustrated">
            Continuar al pago
          </Link>
        </section>
      ) : (
        <section className="border-t border-line pt-6">
          <h2 className="font-display text-xl font-medium">{draft.edition === "classic" ? `Descargar el cuento de ${name}` : "Avisarme cuando esté disponible"}</h2>
          <p className="mb-5 mt-2 max-w-[60ch] text-ink-soft">
            {draft.edition === "classic"
              ? "Te pedimos un email para enviarte un enlace al cuento por si lo pierdes. El PDF se abre al instante."
              : "Te escribiremos una vez, cuando esta edición esté disponible."}
          </p>
          <EmailForm
            key={draft.edition}
            edition={draft.edition}
            source="cuentos-web"
            initialEmail={draft.email ?? ""}
            submitLabel={draft.edition === "classic" ? "Descargar PDF" : "Avisarme"}
            openUrl={draft.edition === "classic" ? "/libro?print=1" : undefined}
            successMessage={
              draft.edition === "classic" ? (
                <p className="text-sm text-ink">
                  El cuento se ha abierto en una pestaña nueva. Si no aparece,{" "}
                  <a className="link" href="/libro?print=1" target="_blank">
                    ábrelo aquí
                  </a>{" "}
                  y elige «Guardar como PDF».
                </p>
              ) : (
                <p className="text-sm text-ink">Hecho. Te avisaremos. Mientras tanto, la edición clásica es gratuita.</p>
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
              <div className="rounded-[6px] border border-line bg-card p-4 text-sm" data-testid="book-link">
                <p className="text-ink-soft">Enlace para volver a este cuento durante 30 días:</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all text-ink">{link}</code>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(link)}>
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </EmailForm>
        </section>
      )}
    </div>
  );
}

function EditionCard({ on, onClick, title, price, desc, status }: { on: boolean; onClick: () => void; title: string; price: string; desc: string; status?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`grid grid-cols-[auto_1fr] gap-x-4 rounded-[8px] border bg-card p-4 text-left transition-colors ${on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line hover:border-ink/40"}`}
    >
      <span className={`mt-1 h-4 w-4 rounded-full border ${on ? "border-ink bg-[radial-gradient(circle,var(--ink)_0_40%,transparent_45%)]" : "border-ink/40"}`} aria-hidden />
      <span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="font-display text-lg font-medium">{title}</span>
          <span className="font-display text-lg">{price}</span>
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{desc}</span>
        {status && <span className="mt-1 block text-xs text-ink-soft/80">{status}</span>}
      </span>
    </button>
  );
}
