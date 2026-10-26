"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookCover, Icon, Sparkle } from "@/components/brand";
import { Wordmark } from "@/components/SiteHeader";
import { StepIdea } from "@/components/crear/StepIdea";
import { StepHero } from "@/components/crear/StepHero";
import { StepStory } from "@/components/crear/StepStory";
import { StepCast } from "@/components/crear/StepCast";
import { StepBook } from "@/components/crear/StepBook";
import { track } from "@/lib/analytics";
import { errorMessage, fetchView, postJson } from "@/lib/bookClient";
import { fichaHash, TONES } from "@/lib/plan/ficha";
import { STARTERS, starterIdea } from "@/lib/plan/starters";
import { resetCrear, setCrear, useCrear, type CrearState, type Step } from "@/lib/crearStore";
import type { Plan } from "@/lib/plan/types";

/**
 * /crear (B2): el padre cuenta la historia que quiere y nosotros hacemos el libro.
 *   1 La idea · 2 Quién · 3 El cuento · 4 Los personajes (email) · 5 El libro (pago)
 * /crear?b=<bookId> recupera un libro guardado (enlace del email); /crear?idea=<starter> llega con una idea elegida en
 * la landing.
 */
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "La idea" },
  { n: 2, label: "Quién" },
  { n: 3, label: "El cuento" },
  { n: 4, label: "Personajes" },
  { n: 5, label: "El libro" },
];

export default function CrearPage() {
  return (
    <Suspense fallback={null}>
      <Crear />
    </Suspense>
  );
}

function Crear() {
  const s = useCrear();
  const params = useSearchParams();
  const b = params.get("b");
  const pagado = params.get("pagado") === "1";
  const mejora = pagado && params.get("mejora") === "1";
  const ideaParam = params.get("idea");
  const [recovering, setRecovering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  // recuperar un libro por enlace
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!b || !/^[a-z0-9]{8,16}$/.test(b) || tried.current === b) return;
    tried.current = b;
    setRecovering(b);
    void fetchView(b).then((v) => {
      setRecovering(null);
      if (!v) {
        setNotice({ text: "Este enlace ya no es válido. Guardamos los libros 30 días.", ok: false });
        return;
      }
      setCrear((prev) => ({
        v: 2,
        step: v.paid || v.approvedSheetJobId || pagado ? 5 : 4,
        ficha: v.ficha,
        record: { plan: v.plan, provider: "guardado", model: "", fichaHash: fichaHash(v.ficha), createdAt: Date.now() },
        bookId: v.bookId,
        email: prev.email,
      }));
      setNotice(pagado ? null : { text: "Libro recuperado.", ok: true });
    });
  }, [b, pagado]);

  // el aviso de «recuperado» se va solo; el de error se queda
  useEffect(() => {
    if (!notice?.ok) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // llega con una idea elegida en la landing: se marca si aún no ha escrito la suya
  const ideaApplied = useRef(false);
  useEffect(() => {
    if (ideaApplied.current || !ideaParam || b) return;
    ideaApplied.current = true;
    const st = STARTERS.find((x) => x.id === ideaParam);
    if (!st) return;
    setCrear((prev) => {
      const f = prev.ficha;
      if (prev.step !== 1 || prev.record || (f.idea.trim() && !f.starter)) return prev;
      return { ...prev, ficha: { ...f, starter: st.id, idea: starterIdea(st.id, f.hero.name) ?? f.idea, tone: f.tone ?? st.tone } };
    });
  }, [ideaParam, b]);

  // tras el email, los textos editados se guardan en el libro (con un respiro entre teclas)
  const plan = s?.record?.plan;
  const bookId = s?.bookId;
  const saved = useRef<string>("");
  // si un cambio no se guarda, se dice (auditoría 26 oct, B6): antes se perdía sin aviso y el PDF llevaba el texto viejo
  const [saveError, setSaveError] = useState<string | null>(null);
  // solo cuenta la respuesta del último guardado: una vieja que llega tarde no pisa a la nueva (revisión 26 oct)
  const saveSeq = useRef(0);
  // «Guardando…» y «Guardado» junto al texto; «Reintentar» vuelve a mandar lo último (auditoría 26 oct, I13)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!bookId || !plan) return;
    const json = JSON.stringify(plan);
    if (!saved.current) {
      saved.current = json;
      return;
    }
    if (json === saved.current) {
      // se ha deshecho lo que no se pudo guardar: lo que se ve ya es lo guardado
      const t = setTimeout(() => setSaveError(null), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      async () => {
        const seq = ++saveSeq.current;
        setSaveState("saving");
        let r: Awaited<ReturnType<typeof postJson>> | null = null;
        try {
          r = await postJson("/api/libro/plan", { bookId, plan });
        } catch {
          r = null;
        }
        if (seq !== saveSeq.current) return;
        // solo se da por guardado cuando el servidor lo dice: antes se marcaba al mandarlo y un fallo no se repetía
        if (r?.status === 200) {
          saved.current = json;
          setSaveError(null);
          setSaveState("saved");
        } else {
          setSaveState("idle");
          setSaveError(r ? errorMessage(r.json, "Inténtalo de nuevo en un momento.") : "Sin conexión.");
        }
      },
      retry ? 0 : 1200,
    );
    return () => clearTimeout(t);
  }, [bookId, plan, retry]);
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  // embudo (lib/analytics.ts): un evento cada vez que se ve un paso; sin datos del niño
  const step = s?.step;
  useEffect(() => {
    if (step) track({ name: "crear_paso", props: { paso: step } });
  }, [step]);

  if (!s || recovering) return null;
  const go = (step: Step) => {
    setCrear((x) => ({ ...x, step }));
    window.scrollTo({ top: 0 });
  };
  const update = (patch: Partial<CrearState>) => setCrear((x) => ({ ...x, ...patch }));
  const maxStep: Step = s.bookId ? 5 : s.record ? 3 : s.ficha.hero.name ? 2 : 1;
  const reachable = (n: Step) => n <= Math.max(maxStep, s.step) && !(n >= 4 && !s.record);
  const dirty = !!(s.ficha.hero.name || s.ficha.idea || s.record);
  const aside = s.step <= 3;

  return (
    <main className="min-h-dvh pb-16">
      <h1 className="sr-only">Crear su cuento</h1>
      <CrearHeader step={s.step} reachable={reachable} go={go} dirty={dirty} />
      <div className={`mx-auto w-full px-4 pt-6 sm:px-6 lg:pt-10 ${aside ? "max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14" : "max-w-3xl"}`}>
        <div className="min-w-0 lg:max-w-3xl">
          {notice && (
            <p className={`rise mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[15px] ${notice.ok ? "bg-sage text-sage-ink" : "bg-[#f6ded6] text-danger"}`} role="status">
              <span>{notice.text}</span>
              <button type="button" aria-label="Cerrar el aviso" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5" onClick={() => setNotice(null)}>
                <Icon.close size={15} />
              </button>
            </p>
          )}
          {saveError && (
            <p className="rise fixed inset-x-4 top-3 z-30 mx-auto flex max-w-xl items-start justify-between gap-3 rounded-2xl bg-[#f6ded6] px-4 py-3 text-[15px] text-danger shadow-[0_12px_30px_-18px_rgba(35,32,54,0.6)]" role="alert" data-testid="save-error">
              <span>No se ha guardado tu último cambio. {saveError}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded-full px-3 py-1 text-sm font-semibold underline-offset-2 hover:underline"
                  onClick={() => {
                    setSaveError(null);
                    setRetry((x) => x + 1);
                  }}
                  data-testid="save-retry"
                >
                  Reintentar
                </button>
                <button type="button" aria-label="Cerrar el aviso" className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5" onClick={() => setSaveError(null)}>
                  <Icon.close size={15} />
                </button>
              </span>
            </p>
          )}
          {saveState !== "idle" && !saveError && (
            <p className="rise fixed inset-x-0 top-3 z-30 mx-auto w-fit rounded-full bg-ink px-3 py-1.5 text-[13px] text-paper shadow-[0_8px_20px_-12px_rgba(35,32,54,0.7)]" role="status" data-testid="save-state">
              {saveState === "saving" ? "Guardando…" : "Guardado"}
            </p>
          )}
          <div key={s.step} className="rise">
            {s.step === 1 && <StepIdea ficha={s.ficha} onChange={(ficha) => update({ ficha })} onNext={() => go(2)} />}
            {s.step === 2 && <StepHero ficha={s.ficha} onChange={(ficha) => update({ ficha })} onNext={() => go(3)} asked={!!s.quickAsked} onAsked={() => update({ quickAsked: true })} />}
            {s.step === 3 && <StepStory ficha={s.ficha} record={s.record} drawn={!!s.bookId} onRecord={(record) => update({ record })} onFicha={(ficha) => update({ ficha })} onBack={() => go(2)} onNext={() => go(4)} />}
            {s.step === 4 && s.record && <StepCast ficha={s.ficha} record={s.record} bookId={s.bookId} email={s.email} onBook={(id, email) => {
                  update({ bookId: id, email });
                  track({ name: "libro_empezado" });
                }} onNext={() => go(5)} />}
            {s.step === 5 && s.bookId && <StepBook bookId={s.bookId} confirming={pagado && s.bookId === b} upgrading={mejora && s.bookId === b} onPlan={(p: Plan) => s.record && update({ record: { ...s.record, plan: p } })} />}
          </div>
        </div>
        {aside && <BookAside s={s} />}
      </div>
    </main>
  );
}

/**
 * Cabecera del flujo. Móvil y tableta: volver, «Paso n de 5» y barra de cinco tramos. Escritorio: marca, pasos
 * numerados (se puede volver a los ya hechos) y «Empezar otro».
 */
function CrearHeader({ step, reachable, go, dirty }: { step: Step; reachable: (n: Step) => boolean; go: (n: Step) => void; dirty: boolean }) {
  const label = STEPS[step - 1].label;
  return (
    <header className="no-print">
      <div className="mx-auto max-w-3xl px-4 pt-3 sm:px-6 lg:hidden">
        <div className="grid grid-cols-[72px_1fr_72px] items-center">
          {step === 1 ? (
            <Link href="/" aria-label="Salir al inicio" className="btn-icon">
              <Icon.close />
            </Link>
          ) : (
            <button type="button" aria-label="Paso anterior" className="btn-icon" onClick={() => go((step - 1) as Step)}>
              <Icon.back />
            </button>
          )}
          <div className="text-center">
            <p className="text-[11px] font-bold tracking-[0.16em] text-mute uppercase">Paso {step} de 5</p>
            <p className="display text-[19px]">{label}</p>
          </div>
          <div className="justify-self-end">{dirty ? <NewBook compact /> : <Sparkle size={18} className="mr-3" />}</div>
        </div>
        <div aria-hidden className="mt-3 grid grid-cols-5 gap-1.5">
          {STEPS.map((x) => (
            <span key={x.n} className={`h-1.5 rounded-full transition-colors duration-500 ${x.n < step ? "bg-accent" : x.n === step ? "bg-star" : "bg-[#eadfcb]"}`} />
          ))}
        </div>
      </div>

      <div className="mx-auto hidden max-w-6xl items-center justify-between gap-6 px-6 py-5 lg:flex">
        <Link href="/" aria-label="Érase su vez, inicio" className="text-ink">
          <Wordmark />
        </Link>
        <nav aria-label="Pasos">
          <ol className="flex items-center gap-2">
            {STEPS.map((x, i) => {
              const done = x.n < step;
              const now = x.n === step;
              return (
                <li key={x.n} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className={`h-[2px] w-7 rounded-full ${x.n <= step ? "bg-accent/60" : "bg-[#e6d8c1]"}`} />}
                  <button
                    type="button"
                    className={`group flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-[14px] transition-colors disabled:cursor-default ${now ? "font-bold text-ink" : "font-semibold text-ink-soft hover:text-ink disabled:text-ink-soft/50 disabled:hover:text-ink-soft/50"}`}
                    disabled={!reachable(x.n)}
                    aria-current={now ? "step" : undefined}
                    onClick={() => go(x.n)}
                  >
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${done ? "bg-accent text-white" : now ? "bg-ink text-paper" : "border-[1.5px] border-[#dccdb4] text-ink-soft"}`}>
                      {done ? <Icon.check size={13} /> : x.n}
                    </span>
                    {x.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        {dirty ? <NewBook /> : <span className="w-24" />}
      </div>
    </header>
  );
}

/** «Empezar otro», con la confirmación en la propia página (sin ventanas del navegador). */
function NewBook({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} className={`rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink ${compact ? "" : "border-[1.5px] border-[#e5d7c1]"}`} onClick={() => setOpen((v) => !v)}>
        {compact ? "Nuevo" : "Empezar otro"}
      </button>
      {open && (
        <div className="rise absolute top-full right-0 z-30 mt-2 grid w-[min(300px,calc(100vw-32px))] gap-3 rounded-[22px] bg-card p-5 text-left shadow-[0_2px_0_#e6d8c1,0_30px_60px_-30px_rgba(35,32,54,0.6)]" role="dialog" aria-label="Empezar un cuento nuevo">
          <p className="display text-[19px]">¿Empezar un cuento nuevo?</p>
          <p className="text-sm text-ink-soft">Este se queda guardado en el enlace del email, si lo pediste.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                setOpen(false);
                resetCrear();
                window.scrollTo({ top: 0 });
              }}
            >
              Empezar otro
            </button>
            <button type="button" className="btn-soft btn-sm" onClick={() => setOpen(false)}>
              Seguir con este
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Escritorio, pasos 1–3: el libro que se va armando, con lo que ya está decidido. */
function BookAside({ s }: { s: CrearState }) {
  const f = s.ficha;
  const name = f.hero.name.trim();
  const starter = STARTERS.find((x) => x.id === f.starter)?.label.toLowerCase();
  const tone = TONES.find((t) => t.id === f.tone)?.label.toLowerCase();
  const about = [starter ?? (f.idea.trim() ? "idea propia" : "sorpresa"), tone].filter(Boolean).join(", ");
  const items = [
    { done: !!name, text: name ? `${name}, ${f.hero.age} ${f.hero.age === 1 ? "año" : "años"} · ${about}` : "Para quién es y de qué va" },
    { done: s.step > 2 || !!s.record, text: `Cómo es y quién ${f.hero.gender === "nina" ? "la" : f.hero.gender === "nino" ? "lo" : "le"} acompaña` },
    { done: !!s.record && s.step >= 3, text: "El cuento, página a página" },
    { done: false, text: "Sus personajes y la portada" },
  ];
  return (
    <aside className="sticky top-8 hidden rounded-[28px] bg-paper-deep p-7 lg:grid lg:gap-6" aria-label="Así va su libro">
      <p className="hand text-[20px] text-accent">así va su libro</p>
      <BookCover name={name} title={s.step >= 3 ? s.record?.plan.title : undefined} from={f.from?.trim()} tilt={-3} className="mx-auto w-full max-w-[300px]" />
      <ul className="grid gap-2">
        {items.map((it) => (
          <li key={it.text} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] ${it.done ? "bg-card font-semibold text-ink" : "text-ink-soft"}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${it.done ? "bg-sage text-sage-ink" : "border-[1.5px] border-[#d9c9ae]"}`}>{it.done && <Icon.check size={12} />}</span>
            {it.text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
