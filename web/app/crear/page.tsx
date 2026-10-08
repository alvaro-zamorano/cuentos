"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { Avatar } from "@/components/Avatar";
import { Scene } from "@/components/Scene";
import { COMPANIONS, SPECIALS, companionVariants, defaultVariant, randomTraits } from "@/lib/traits";
import { DEFAULT_DRAFT, buildBook, loadDraft, normalizeDraft, saveDraft } from "@/lib/story";
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

const BOOK_KEY = "cuentos:book:v1";

function Crear() {
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [step, setStep] = useState<Step>(1);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const b = params.get("b");
    const fallback = () => {
      const saved = loadDraft();
      if (saved) setDraft(saved);
      else setDraft({ ...DEFAULT_DRAFT, hero: { ...DEFAULT_DRAFT.hero, traits: randomTraits() } });
    };
    if (!b) {
      fallback();
      setReady(true);
      return;
    }
    // enlace de recuperación: /crear?b=<public_id>
    fetch(`/api/books/${encodeURIComponent(b)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok && json.book?.draft) {
          setDraft(normalizeDraft(json.book.draft));
          try {
            window.localStorage.setItem(BOOK_KEY, b);
          } catch {
            /* sin almacenamiento */
          }
          setStep(3);
          setNotice("Hemos recuperado tu cuento.");
        } else {
          fallback();
          setNotice("Ese enlace ya no existe o ha caducado (guardamos los cuentos 30 días).");
        }
      })
      .catch(() => {
        fallback();
        setNotice("No hemos podido recuperar el cuento. Prueba otra vez más tarde.");
      })
      .finally(() => setReady(true));
  }, [params]);

  useEffect(() => {
    if (ready) saveDraft(draft);
  }, [draft, ready]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const book = useMemo(() => buildBook(draft), [draft]);
  const canContinue = step !== 1 || draft.hero.name.trim().length > 0;

  if (!ready) return null;

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
            {book.pages.map((p) => (
              <article key={p.n} className="card grid gap-3 p-0 overflow-hidden md:grid-cols-[3fr_2fr]">
                <Scene
                  scene={p.scene}
                  traits={draft.hero.traits}
                  expression={p.expression}
                  companion={p.withCompanion ? draft.companion : undefined}
                  special={draft.special}
                  age={draft.hero.age}
                  className="w-full"
                />
                <div className="flex flex-col gap-2 p-4">
                  <span className="text-xs font-black text-ink-soft">Página {p.n}</span>
                  <textarea
                    value={p.text}
                    rows={5}
                    maxLength={draft.hero.age <= 4 ? 120 : 360}
                    onChange={(e) => update({ textOverrides: { ...draft.textOverrides, [p.n]: e.target.value } })}
                    className="min-h-28 w-full resize-none rounded-2xl border-2 border-transparent bg-cream p-3 font-story text-[17px] leading-snug outline-none focus:border-ink"
                  />
                  {draft.textOverrides[p.n] !== undefined && (
                    <button
                      type="button"
                      className="self-start text-xs font-bold text-ink-soft underline"
                      onClick={() => {
                        const next = { ...draft.textOverrides };
                        delete next[p.n];
                        update({ textOverrides: next });
                      }}
                    >
                      Volver al texto original
                    </button>
                  )}
                </div>
              </article>
            ))}
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
  const [email, setEmail] = useState(draft.email ?? "");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const choose = (edition: Edition) => update({ edition });

  const [link, setLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    // la pestaña se abre en el gesto del usuario (si no, los navegadores la bloquean)
    const tab = draft.edition === "classic" ? window.open("/libro?print=1", "_blank") : null;
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, marketing, edition: draft.edition, consent }),
      });
      if (!res.ok) throw new Error("bad");
      update({ email });
      setStatus("ok");
    } catch {
      tab?.close();
      setStatus("error");
      return;
    }
    // guardar el cuento para el enlace de recuperación; si falla, el cuento sigue en este navegador
    try {
      let previous: string | null = null;
      try {
        previous = window.localStorage.getItem(BOOK_KEY);
      } catch {
        /* sin almacenamiento */
      }
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { ...draft, email: undefined }, email, public_id: previous ?? undefined }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.public_id) {
        try {
          window.localStorage.setItem(BOOK_KEY, json.public_id);
        } catch {
          /* sin almacenamiento */
        }
        setLink(`${window.location.origin}${json.url}`);
      }
    } catch {
      /* sin enlace: no bloquea */
    }
  };

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
          price="Pronto"
          desc="Cada página ilustrada en el estilo que elijas, con tu peque reconocible en todas. Te avisamos."
          soon
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
        <form onSubmit={submit} className="grid gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="rounded-2xl border-2 border-line bg-cream px-4 py-3 font-bold outline-none focus:border-ink"
          />
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>
              Soy madre, padre o tutor del peque, o cuento con su autorización para crear este cuento. Acepto que el cuento se
              guarde 30 días para poder recuperarlo con un enlace; después se borra.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1" />
            <span>Quiero que me aviséis de nuevas ocasiones y ediciones (opcional).</span>
          </label>
          <button type="submit" className="btn-primary" disabled={status === "sending"}>
            {draft.edition === "classic" ? "Abrir el PDF para imprimir" : "Avisadme"}
          </button>
          {status === "ok" && draft.edition === "classic" && (
            <p className="text-sm text-leaf font-bold">
              Se ha abierto el cuento en una pestaña nueva. Si no, <a className="underline" href="/libro?print=1" target="_blank">ábrelo aquí</a> y usa «Guardar como PDF».
            </p>
          )}
          {status === "ok" && draft.edition !== "classic" && <p className="text-sm font-bold text-leaf">Apuntado. Mientras tanto, el clásico es gratis.</p>}
          {status === "ok" && link && (
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
          {status === "error" && <p className="text-sm font-bold text-coral">No se ha podido guardar el email. Prueba otra vez.</p>}
        </form>
      </div>
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
