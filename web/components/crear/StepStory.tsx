"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fichaHash, normalizeFicha } from "@/lib/plan/ficha";
import { familyGiven, familyMentions } from "@/lib/plan/validate";
import type { Ficha, Plan, PlanPage, PlanRecord } from "@/lib/plan/types";
import { track } from "@/lib/analytics";
import { errorMessage, postJson } from "@/lib/bookClient";
import { Icon, Sparkle } from "@/components/brand";
import { AutoTextarea } from "./AutoTextarea";
import { ErrorNote } from "./ui";

const SUGGESTIONS = ["más corto", "que sea de noche", "que salga la abuela"];
const WRITING = ["Leyendo la idea…", "Pensando el arranque…", "Repartiendo los detalles…", "Escribiendo las doce páginas…", "Buscando el final…", "Repasando el texto…"];

/**
 * Paso 3: el cuento escrito en 12 tarjetas (texto + qué se verá). Se puede cambiar el texto a mano, pedir el cambio de una
 * página con una frase o pedir otra versión entera. Escribirlo cuesta ≈ 4–8 c y tarda 20–45 s (medido el 13 oct).
 */
export function StepStory({
  ficha,
  record,
  onRecord,
  onFicha,
  onBack,
  onNext,
  drawn = false,
  paid = false,
}: {
  ficha: Ficha;
  record?: PlanRecord;
  onRecord: (r: PlanRecord) => void;
  onFicha: (f: Ficha) => void;
  onBack: () => void;
  onNext: () => void;
  /** Ya hay personajes dibujados: lo que se añada ahora en el paso 2 no cambia los dibujos. */
  drawn?: boolean;
  /** Libro pagado: solo se cambian los textos; las escenas ya están pintadas (I2). */
  paid?: boolean;
}) {
  const clean = normalizeFicha(ficha);
  const hash = fichaHash(clean);
  const stale = !record || record.fichaHash !== hash;
  const [state, setState] = useState<"idle" | "writing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const inFlight = useRef<string | null>(null);

  const write = useCallback(async () => {
    if (inFlight.current === hash) return;
    inFlight.current = hash;
    setState("writing");
    setError(null);
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const { status, json } = await postJson<{ record?: PlanRecord }>("/api/plan", { ficha: clean });
      if (status === 200 && json.record) {
        onRecord(json.record);
        setState("idle");
        track({ name: "cuento_escrito", props: { segundos: Math.round((Date.now() - t0) / 1000) } });
      } else {
        track({ name: "cuento_error", props: { estado: status } });
        // sin red, postJson ya no lanza: el mensaje sale de errorMessage (revisión 27 oct)
        setError(errorMessage(json, "No hemos podido escribir el cuento. Inténtalo de nuevo."));
        setState("error");
      }
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
      setState("error");
    } finally {
      clearInterval(timer);
      inFlight.current = null;
    }
  }, [clean, hash, onRecord]);

  useEffect(() => {
    // escribir al entrar si el cuento no corresponde a la ficha actual (o no hay)
    if (!stale || state !== "idle") return;
    const t = setTimeout(() => void write(), 0);
    return () => clearTimeout(t);
  }, [stale, state, write]);

  const plan = record?.plan;
  const setPlan = (p: Plan) => record && onRecord({ ...record, plan: p });
  const setPage = (n: number, patch: Partial<PlanPage>) => plan && setPlan({ ...plan, pages: plan.pages.map((p) => (p.n === n ? { ...p, ...patch } : p)) });

  const name = clean.hero.name;

  if (stale || !plan) {
    if (state === "error")
      return (
        <div className="grid gap-5" aria-live="polite">
          <h2 className="display text-[30px] sm:text-[38px]">No hemos podido escribir el cuento de {name}</h2>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-3">
            <button className="btn-ghost" onClick={onBack}>
              Atrás
            </button>
            <button className="btn-primary" onClick={() => void write()}>
              Intentarlo otra vez
            </button>
          </div>
        </div>
      );
    return (
      <div className="grid justify-items-center gap-7 pt-2 text-center sm:pt-6" aria-live="polite">
        <WritingBook />
        <div className="grid gap-2">
          <h2 className="display text-[30px] sm:text-[40px]">Escribiendo el cuento de {name}</h2>
          <p key={Math.floor(elapsed / 6)} className="hand rise text-[21px] text-accent" data-testid="writing">
            {WRITING[Math.min(WRITING.length - 1, Math.floor(elapsed / 6))]}
          </p>
        </div>
        <Trail />
        <p className="-mt-3 text-sm text-mute">Suele tardar entre 20 y 45 segundos.</p>
        <div className="card flex max-w-md items-start gap-3 text-left text-[15px] leading-relaxed text-ink-soft">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-butter">
            <Sparkle size={15} color="var(--accent)" />
          </span>
          <p>Cuando esté, lo lees entero y cambias lo que quieras: a mano o pidiendo una página nueva con una frase.</p>
        </div>
      </div>
    );
  }

  // familiares que salen en el texto sin estar en la ficha (B6): en los dibujos no salen como son de verdad
  const given = familyGiven(clean);
  const familyHint = (text: string) => {
    if (drawn) return null;
    const words = familyMentions(text).filter((m) => !given.has(m.kin)).map((m) => `«${m.word}»`);
    // cambiar el reparto cambia la ficha y el cuento se escribe otra vez: se dice antes (revisión 26 oct)
    return words.length
      ? `Sale ${words.join(" y ")} en el texto. Para que salga también en los dibujos, y como es de verdad, añade a esa persona en «Quién más sale» (paso 2). Ojo: al cambiar el paso 2, el cuento se escribe otra vez y se pierden los cambios hechos a mano.`
      : null;
  };
  return (
    <div className="grid gap-7">
      <div className="grid gap-4">
        {/* «Escribirlo de otra manera» va arriba, donde se decide si el cuento convence; junto al botón de seguir
            sembraba la duda en el último paso antes de dibujar (25 oct) */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-sage px-3.5 py-1.5 text-[13px] font-semibold text-sage-ink">
            <Icon.check size={14} />
            {paid ? "Pagado. Aquí puedes corregir los textos" : "Escrito. Léelo y cambia lo que quieras"}
          </span>
          {!paid && <Rewrite onConfirm={() => onFicha({ ...ficha, seed: (ficha.seed ?? 0) + 1 })} />}
        </div>
        {paid && (
          <p className="notice m-0" data-testid="paid-text-only">
            Las ilustraciones ya están encargadas con estas escenas. Si alguna no te gusta, pide otra versión desde esa página del libro.
          </p>
        )}
        <div className="relative">
          {/* área de texto de una línea lógica: en móvil el título largo se parte en renglones en vez de cortarse */}
          <AutoTextarea
            id="plan-title"
            className="display -mx-3 block w-[calc(100%+1.5rem)] resize-none rounded-2xl border-2 border-transparent bg-transparent px-3 py-1 pr-16 text-[34px] leading-[1.1] text-ink outline-none transition-[border-color,background-color] hover:border-[#efe3cf] focus:border-[#e5d7c1] focus:bg-white focus-visible:outline-none sm:text-[44px]"
            rows={1}
            value={plan.title}
            maxLength={120}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            onChange={(e) => setPlan({ ...plan, title: e.target.value.replace(/\s*\n+\s*/g, " ") })}
            aria-label="Título"
            data-testid="plan-title"
          />
          <button type="button" className="btn-icon absolute top-1 right-0" aria-label="Cambiar el título" onClick={() => document.getElementById("plan-title")?.focus()}>
            <Icon.pencil size={17} />
          </button>
        </div>
        <label className="grid gap-1.5">
          <span className="field-label">Dedicatoria</span>
          <AutoTextarea
            className="story w-full resize-none rounded-2xl border-2 border-transparent bg-paper-deep px-5 py-4 text-[17px] leading-relaxed text-ink outline-none transition-[border-color,background-color] focus:border-[#e5d7c1] focus:bg-white focus-visible:outline-none"
            value={plan.dedication}
            maxLength={400}
            onChange={(e) => setPlan({ ...plan, dedication: e.target.value })}
            aria-label="Dedicatoria"
          />
        </label>
        {plan.notices.length > 0 && (
          <div className="notice grid gap-1">
            {plan.notices.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}
      </div>

      <ol className="grid gap-4" data-testid="plan-pages">
        {plan.pages.map((p) => (
          <PageCard key={p.n} page={p} ficha={clean} plan={plan} hint={familyHint(p.text)} canReplace={!paid} onText={(text) => setPage(p.n, { text })} onReplace={(np) => setPage(p.n, np)} />
        ))}
      </ol>

      <div className="actionbar">
        <button className="btn-primary btn-lg w-full sm:w-auto" onClick={onNext} data-testid="next-3">
          {paid ? "Volver al libro" : `Así está bien, dibujar a ${name}`}
        </button>
      </div>
    </div>
  );
}

/** «Escribirlo de otra manera», con la confirmación en la propia página (sin ventanas del navegador). */
function Rewrite({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button className="text-sm font-semibold text-ink-soft underline decoration-1 underline-offset-[3px] hover:text-ink" onClick={() => setAsking(true)} data-testid="rewrite">
        Escribirlo de otra manera
      </button>
    );
  return (
    <div className="rise flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-sm" role="group" aria-label="Escribir otra versión">
      <span className="text-ink-soft">¿Otra versión entera? Se pierden los cambios de esta.</span>
      <button className="btn-ghost btn-sm" onClick={onConfirm}>
        Sí, escribir otra
      </button>
      <button className="font-semibold text-ink-soft hover:text-ink" onClick={() => setAsking(false)}>
        No
      </button>
    </div>
  );
}

/** Libro abierto que se va escribiendo: renglones que aparecen y un lápiz. */
function WritingBook() {
  const bar = "h-[6px] rounded-full bg-[#efe4d0]";
  return (
    <div aria-hidden className="relative h-[150px] w-[260px]">
      <div className="absolute inset-0 flex rounded-[12px] bg-card shadow-[0_2px_0_#e6d8c1,0_30px_50px_-30px_rgba(35,32,54,0.55)]">
        <div className="grid flex-1 content-start gap-3 border-r border-line p-5">
          {[100, 92, 100, 70, 96].map((w, i) => (
            <span key={i} className={bar} style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="grid flex-1 content-start gap-3 p-5">
          {[100, 84].map((w, i) => (
            <span key={i} className={bar} style={{ width: `${w}%` }} />
          ))}
          <span className={`${bar} shimmer w-[60%]`} />
        </div>
        <span className="absolute inset-y-2 left-1/2 w-6 -translate-x-1/2 bg-gradient-to-r from-transparent via-ink/[0.06] to-transparent" />
      </div>
      <span className="pen-write absolute top-[52px] right-[38px] text-accent">
        <Icon.pencil size={30} />
      </span>
      <Sparkle className="twinkle absolute -top-3 -left-4" size={18} />
      <Sparkle className="twinkle-slow absolute -right-3 bottom-6" size={11} />
    </div>
  );
}

/** Camino de puntos con una estrella que avanza hacia el libro (al ritmo de lo que suele tardar). */
function Trail() {
  return (
    <div aria-hidden className="relative h-6 w-[min(320px,80vw)]">
      <span className="absolute top-1/2 right-[20px] left-0 border-t-2 border-dotted border-edge" />
      <span className="grow absolute top-1/2 left-0 h-[2px] -translate-y-px rounded-full bg-star" />
      <span className="walk absolute top-0 left-0">
        <Sparkle size={22} />
      </span>
      <span className="absolute top-0.5 right-0 text-ink-soft">
        <Icon.book size={20} />
      </span>
    </div>
  );
}

function PageCard({
  page,
  ficha,
  plan,
  hint,
  canReplace = true,
  onText,
  onReplace,
}: {
  page: PlanPage;
  ficha: Ficha;
  plan: Plan;
  hint: string | null;
  /** «Cambiar esta página» reescribe también la escena: tras pagar, no (I2). */
  canReplace?: boolean;
  onText: (t: string) => void;
  onReplace: (p: PlanPage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { status, json } = await postJson<{ page?: PlanPage }>("/api/plan/page", { ficha, plan, n: page.n, instruction: ask });
      if (status === 200 && json.page) {
        onReplace(json.page);
        setOpen(false);
        setAsk("");
      } else setErr(errorMessage(json, "No se ha podido cambiar. Prueba a pedirlo de otra manera."));
    } catch {
      setErr("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`card grid gap-3.5 p-5 transition-shadow duration-300 sm:p-6 ${open ? "shadow-[0_0_0_2px_var(--accent),0_24px_44px_-34px_rgba(35,32,54,0.5)]" : ""}`} data-testid={`page-${page.n}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[13px] font-bold text-paper">{page.n}</span>
        <span className="text-sm font-semibold text-ink-soft">Página {page.n}</span>
      </div>
      <AutoTextarea
        id={`page-text-${page.n}`}
        className="story -mx-2.5 block w-[calc(100%+1.25rem)] resize-none rounded-xl border-2 border-transparent bg-transparent px-2.5 py-1 text-[18px] leading-[1.6] text-ink outline-none transition-[border-color,background-color] focus:border-[#e5d7c1] focus:bg-white focus-visible:outline-none"
        value={page.text}
        maxLength={1500}
        onChange={(e) => onText(e.target.value)}
        aria-label={`Texto de la página ${page.n}`}
      />
      {hint && (
        <p className="notice m-0" data-testid={`family-hint-${page.n}`}>
          {hint}
        </p>
      )}
      <p className="hand flex gap-2.5 rounded-2xl bg-paper px-4 py-3 text-[17px] leading-snug text-ink-soft">
        <Icon.image size={18} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <span className="text-ink">Se verá: </span>
          {page.scene}
        </span>
      </p>
      {open ? (
        <form onSubmit={submit} className="rise grid gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`ask-${page.n}`} className="field-label text-ink">
              ¿Qué cambiamos en esta página?
            </label>
            <button type="button" className="text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-full border-2 border-accent bg-white py-1.5 pr-1.5 pl-4 shadow-[0_0_0_5px_rgba(200,73,44,0.12)]">
            <input
              id={`ask-${page.n}`}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-soft/55 focus-visible:outline-none"
              value={ask}
              maxLength={300}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="que salga su prima Lola; que sea de noche; más corto"
              autoFocus
            />
            <button aria-label="Cambiar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white transition-[transform,opacity] hover:bg-accent-deep active:scale-95 disabled:opacity-40" disabled={busy || !ask.trim()}>
              {busy ? <Sparkle className="twinkle" size={16} color="#fff" /> : <Icon.arrow />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((t) => (
              <button type="button" key={t} className="rounded-full bg-paper-deep px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink" onClick={() => setAsk(t)}>
                {t}
              </button>
            ))}
          </div>
          {busy && <p className="hand text-[17px] text-accent">Reescribiendo la página…</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {canReplace && (
            <button className="chip" onClick={() => setOpen(true)}>
              <Sparkle size={13} color="var(--accent)" />
              Cambiar esta página
            </button>
          )}
          <button className="px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => document.getElementById(`page-text-${page.n}`)?.focus()}>
            Editar el texto
          </button>
        </div>
      )}
    </li>
  );
}
