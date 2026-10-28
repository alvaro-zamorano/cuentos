"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/brand";
import { EYES, GLASSES, HAIR_COLORS, SKINS } from "@/lib/traits";
import { GLASSES_PICKS, HAIR_PICKS, OUTFIT_PICKS, PET_PICKS } from "@/lib/crearPicks";
import { LIMITS } from "@/lib/plan/ficha";
import type { CastMember, Ficha, Look } from "@/lib/plan/types";
import { mergeDetails, needsQuickQuestions } from "@/lib/plan/quick";
import type { Glasses, HairShape } from "@/lib/types";
import { QuickQuestions } from "./QuickQuestions";
import { Tiles } from "./Tiles";

const FIRST_HAIR = 6;

/**
 * Paso 2: cómo es y quién más sale. Arriba la cara (piel, pelo, peinado y ojos) y «Lo que solo tú sabes», a la vista
 * porque es lo que más hace suyo el cuento; el resto, en filas plegables con su resumen. Todo opcional: lo que no se
 * marque lo decide el ilustrador y se ve en la hoja de personajes, donde se puede corregir con palabras.
 * Si la ficha no trae nada del niño, «Escribir el cuento» pasa antes por tres preguntas rápidas (una vez por libro).
 */
export function StepHero({ ficha, onChange, onNext, asked, onAsked }: { ficha: Ficha; onChange: (f: Ficha) => void; onNext: () => void; asked: boolean; onAsked: () => void }) {
  const hero = ficha.hero;
  const look = hero.look;
  const name = hero.name.trim() || "tu protagonista";
  const setLook = (patch: Partial<Look>) => onChange({ ...ficha, hero: { ...hero, look: { ...look, ...patch } } });
  const toggle = <T extends string>(cur: T | undefined, v: T) => (cur === v ? undefined : v);
  // las caras de las miniaturas con la piel y el pelo ya elegidos (en las gafas solo la piel: el recoloreado del pelo
  // tiñe también las monturas marrones)
  const tint = { skin: SKINS.find((c) => c.id === look.skin)?.hex ?? null, hair: HAIR_COLORS.find((c) => c.id === look.hair?.color)?.hex ?? null };
  const setCast = (cast: CastMember[]) => onChange({ ...ficha, cast: cast.map((c, i) => ({ ...c, id: i === 0 ? "c1" : "c2" })) });
  const details = [...ficha.details, ...Array(Math.max(0, 3 - ficha.details.length)).fill("")].slice(0, LIMITS.details);
  const [allHair, setAllHair] = useState(false);
  const [quick, setQuick] = useState(false);
  const hairPicks = allHair ? HAIR_PICKS : HAIR_PICKS.filter((p, i) => i < FIRST_HAIR || p.id === look.hair?.shape);

  const unique = hero.gender === "nina" ? "Algo que le hace única" : hero.gender === "nino" ? "Algo que le hace único" : "Algo que le hace especial";
  const castSummary = ficha.cast
    .map((c) => [c.name.trim(), c.relation.trim()].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" · ");

  if (quick) {
    return (
      <QuickQuestions
        name={name}
        age={hero.age}
        onBack={() => {
          setQuick(false);
          window.scrollTo({ top: 0 });
        }}
        onSkip={() => {
          onAsked();
          onNext();
        }}
        onDone={(added) => {
          onChange({ ...ficha, details: mergeDetails(ficha.details, added) });
          onAsked();
          onNext();
        }}
      />
    );
  }

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!asked && needsQuickQuestions(ficha)) {
          setQuick(true);
          window.scrollTo({ top: 0 });
        } else onNext();
      }}
    >
      <div className="grid gap-2">
        <h2 className="display text-[32px] sm:text-[42px]">¿Cómo es {name}?</h2>
        <p className="text-ink-soft">Todo es opcional. Lo que marques se verá en todo el libro. Lo demás lo verás dibujado antes de ilustrar las páginas y lo podrás cambiar con palabras.</p>
      </div>

      <section className="card grid gap-6 p-5 sm:p-7" aria-label="La cara">
        <div className="grid gap-2.5">
          {/* el nombre del color elegido, a la vista: los círculos solo lo llevan para el lector de pantalla (mirada de usuario) */}
          <span className="field-label text-ink">
            Piel
            {SKINS.find((c) => c.id === look.skin) && <span className="font-normal text-ink-soft"> · {SKINS.find((c) => c.id === look.skin)!.label}</span>}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5" role="group" aria-label="Tono de piel">
            {SKINS.map((c) => (
              <button
                type="button"
                key={c.id}
                title={c.label}
                aria-label={`Piel ${c.label.toLowerCase()}`}
                aria-pressed={look.skin === c.id}
                className={`swatch ${look.skin === c.id ? "swatch-on" : ""}`}
                style={{ background: c.hex }}
                onClick={() => setLook({ skin: toggle(look.skin, c.id) })}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <span className="field-label text-ink">
            Pelo
            {HAIR_COLORS.find((c) => c.id === look.hair?.color) && <span className="font-normal text-ink-soft"> · {HAIR_COLORS.find((c) => c.id === look.hair?.color)!.label}</span>}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5" role="group" aria-label="Color de pelo">
            {HAIR_COLORS.map((c) => (
              <button
                type="button"
                key={c.id}
                title={c.label}
                aria-label={`Pelo ${c.label.toLowerCase()}`}
                aria-pressed={look.hair?.color === c.id}
                className={`swatch ${look.hair?.color === c.id ? "swatch-on" : ""}`}
                style={{ background: c.hex }}
                onClick={() => setLook({ hair: { ...look.hair, color: toggle(look.hair?.color, c.id) } })}
              />
            ))}
          </div>
          <Tiles label="Peinado" picks={hairPicks} value={look.hair?.shape} tint={tint} cols="grid-cols-3 sm:grid-cols-6" onPick={(id) => setLook({ hair: { ...look.hair, shape: toggle(look.hair?.shape, id as HairShape) } })} />
          {!allHair && (
            <button type="button" className="link justify-self-start text-sm font-semibold" onClick={() => setAllHair(true)}>
              Ver los {HAIR_PICKS.length} peinados
            </button>
          )}
        </div>

        <div className="grid gap-2.5">
          <span className="field-label text-ink">Ojos</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Color de ojos">
            {EYES.map((c) => (
              <button type="button" key={c.id} aria-pressed={look.eyes === c.id} className={`chip ${look.eyes === c.id ? "chip-on" : ""}`} onClick={() => setLook({ eyes: toggle(look.eyes, c.id) })}>
                <span aria-hidden className="h-4 w-4 rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.7)]" style={{ background: c.hex }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:p-7" aria-labelledby="details-title">
        <div className="flex items-start gap-3.5">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-butter text-ink">
            <Icon.pencil />
          </span>
          <div className="grid gap-0.5">
            <h3 id="details-title" className="font-bold text-ink">
              Lo que solo tú sabes
            </h3>
            <p className="text-sm text-ink-soft">Frases que dice, manías, lo que le encanta. Es lo que más hace suyo el cuento: lo repartimos por las páginas.</p>
          </div>
        </div>
        {details.map((d, i) => (
          <input
            key={i}
            className="input"
            aria-label={`Detalle ${i + 1}`}
            value={d}
            maxLength={LIMITS.detail}
            placeholder={["le encantan los dinosaurios", "dice «¡despegue!» por todo", "duerme con una linterna"][i] ?? "otro detalle"}
            onChange={(e) => {
              const next = [...details];
              next[i] = e.target.value;
              onChange({ ...ficha, details: next });
            }}
            data-testid={`detail-${i}`}
          />
        ))}
        {details.length < LIMITS.details && details.every((d) => d.trim()) && (
          <button type="button" className="btn-soft btn-sm justify-self-start" onClick={() => onChange({ ...ficha, details: [...details, ""] })}>
            Otro detalle
          </button>
        )}
        <HealthNote />
      </section>

      <div className="grid gap-3">
        <Row icon={<Icon.glasses />} tint="bg-sky" title="Gafas" summary={look.glasses ? GLASSES.find((g) => g.id === look.glasses)?.label : "Si lleva, elige la montura"} done={!!look.glasses}>
          <Tiles label="Gafas" picks={GLASSES_PICKS} value={look.glasses} tint={{ skin: tint.skin }} cols="grid-cols-3 sm:grid-cols-7" onPick={(id) => setLook({ glasses: toggle(look.glasses, id as Glasses) })} />
        </Row>

        <Row icon={<Icon.star />} tint="bg-butter" title={unique} summary={look.unique?.trim() || "Pecas, un diente menos, su capa roja…"} done={!!look.unique?.trim()}>
          <input className="input" aria-label={unique} value={look.unique ?? ""} maxLength={LIMITS.unique} onChange={(e) => setLook({ unique: e.target.value })} placeholder="pecas en la nariz, le falta un diente, su capa roja" />
          <HealthNote />
        </Row>

        <Row icon={<Icon.shirt />} tint="bg-peach" title="Ropa de siempre" summary={hero.outfit?.trim() || "La que lleva en casi todas las páginas"} done={!!hero.outfit?.trim()}>
          <Tiles
            label="Ropa de siempre"
            picks={OUTFIT_PICKS}
            value={OUTFIT_PICKS.find((o) => o.text === hero.outfit)?.id}
            tall
            cols="grid-cols-3 sm:grid-cols-8"
            onPick={(id) => {
              const pick = OUTFIT_PICKS.find((o) => o.id === id)!;
              onChange({ ...ficha, hero: { ...hero, outfit: hero.outfit === pick.text ? "" : pick.text } });
            }}
          />
          <input className="input" aria-label="Ropa de siempre, en tus palabras" value={hero.outfit ?? ""} maxLength={LIMITS.outfit} onChange={(e) => onChange({ ...ficha, hero: { ...hero, outfit: e.target.value } })} placeholder="o descríbela: su peto amarillo con una camiseta de rayas" />
        </Row>

        <Row icon={<Icon.people />} tint="bg-sage" title="Quién más sale" summary={castSummary || "Hasta dos personas o mascotas"} done={!!castSummary}>
          <p className="text-sm text-ink-soft">Personas o mascotas que salgan en varias páginas. A las demás, nómbralas en la idea y las describimos nosotros.</p>
          {ficha.cast.map((c, i) => (
            <div key={i} className="rise grid gap-4 rounded-[18px] bg-paper p-4" data-testid={`cast-${i}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2" role="group" aria-label="Persona o mascota">
                  {(["persona", "mascota"] as const).map((k) => (
                    <button type="button" key={k} aria-pressed={c.kind === k} className={`chip ${c.kind === k ? "chip-on" : ""}`} onClick={() => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, kind: k } : x)))}>
                      {k === "persona" ? "Persona" : "Mascota"}
                    </button>
                  ))}
                </div>
                <button type="button" className="text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => setCast(ficha.cast.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="field-label">Nombre</span>
                  <input className="input" value={c.name} maxLength={LIMITS.castName} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "Toby" : "Carmen"} />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">Qué es de {name}</span>
                  <input className="input" value={c.relation} maxLength={LIMITS.castRelation} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "su perro" : "su abuela"} />
                </label>
              </div>
              {c.kind === "mascota" && (
                <Tiles
                  label={`Cómo es ${c.name.trim() || "la mascota"}`}
                  picks={PET_PICKS}
                  value={PET_PICKS.find((p) => p.text === c.look)?.id}
                  cols="grid-cols-3 sm:grid-cols-8"
                  onPick={(id) => {
                    const pick = PET_PICKS.find((p) => p.id === id)!;
                    const off = c.look === pick.text;
                    setCast(ficha.cast.map((x, j) => (j === i ? { ...x, look: off ? "" : pick.text, relation: x.relation.trim() || off ? x.relation : pick.relation } : x)));
                  }}
                />
              )}
              <label className="grid gap-1.5">
                <span className="field-label">Cómo es, en una línea</span>
                <input className="input" value={c.look} maxLength={LIMITS.castLook} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, look: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "perro blanco con manchas marrones y collar rojo" : "media melena gris, gafas de pasta y zapatillas blancas"} />
              </label>
              {/* también el aspecto del reparto: «la abuela va en silla de ruedas» (revisión 27 oct) */}
              {c.kind !== "mascota" && <HealthNote cast />}
            </div>
          ))}
          {ficha.cast.length < LIMITS.cast && (
            <button type="button" className="btn-soft btn-sm justify-self-start" onClick={() => setCast([...ficha.cast, { id: "c1", kind: "persona", name: "", relation: "", look: "" }])} data-testid="add-cast">
              Añadir a alguien
            </button>
          )}
        </Row>


        <Row icon={<Icon.mail />} tint="bg-paper-deep" title="La dedicatoria" summary={ficha.from?.trim() ? `De parte de ${ficha.from.trim()}` : "Si la dejas vacía, te proponemos una"} done={!!(ficha.from?.trim() || ficha.dedication?.trim())}>
          <label className="grid gap-1.5">
            <span className="field-label">De parte de</span>
            <input className="input" value={ficha.from ?? ""} maxLength={LIMITS.from} onChange={(e) => onChange({ ...ficha, from: e.target.value })} placeholder="mamá y papá" />
          </label>
          <label className="grid gap-1.5">
            <span className="field-label">Dedicatoria (si la dejas vacía, te proponemos una)</span>
            <textarea className="input story min-h-24 resize-y leading-relaxed" value={ficha.dedication ?? ""} maxLength={LIMITS.dedication} onChange={(e) => onChange({ ...ficha, dedication: e.target.value })} />
          </label>
        </Row>
      </div>

      {/* lo que pasa con estos datos, antes de mandarlos (auditoría 26 oct, I26 e I27): antes se sabía en el paso 4 */}
      <p className="m-0 rounded-2xl bg-paper-deep px-4 py-3 text-[13px] leading-snug text-ink-soft" data-testid="before-write">
        Escribirlo tarda medio minuto. Para hacerlo, lo que has puesto, también lo de su salud si lo hay, va a un proveedor de IA que no lo usa
        para entrenar sus modelos. Lo guardamos 30 días y después se borra.
      </p>

      <div className="actionbar">
        <button type="submit" className="btn-primary btn-lg w-full sm:w-auto" data-testid="next-2">
          <Icon.pencil />
          Escribir el cuento
        </button>
        <p className="m-0 w-full text-center text-[12.5px] leading-snug text-mute sm:w-auto sm:flex-1 sm:text-left" data-testid="write-consent">
          {/* la barra fija no crece en el móvil: el «tarda medio minuto» va arriba (revisión 27 oct) */}
          Al pulsar, declaras ser su madre, padre o tutor (o tener su permiso) y consientes que usemos lo que has escrito, también lo de su
          salud si lo hay, solo para este cuento:{" "}
          <Link href="/privacidad" target="_blank" className="underline underline-offset-2">
            privacidad
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

/**
 * Bajo los campos libres (auditoría 26 oct, I27): un audífono o una silla de ruedas son datos de salud de un menor. No
 * se piden ni se prohíben; se dice para qué se usan.
 */
function HealthNote({ cast = false }: { cast?: boolean }) {
  return (
    <p className="m-0 text-[12.5px] leading-snug text-mute" data-testid={cast ? "cast-health-note" : "health-note"}>
      {cast ? "Si cuentas algo de salud (que la abuela va en silla de ruedas, por ejemplo)" : "Si cuentas algo de su salud (un audífono, una silla de ruedas…)"}, lo usamos solo para
      este cuento y se borra con él.
    </p>
  );
}

/** Fila plegable: icono, título y resumen de lo elegido; check si ya tiene algo. */
function Row({ icon, tint, title, summary, done, children }: { icon: React.ReactNode; tint: string; title: string; summary?: string; done: boolean; children: React.ReactNode }) {
  return (
    <details className="row group">
      <summary>
        <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink ${tint}`}>
          {icon}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="font-bold text-ink">{title}</span>
          <span className="truncate text-sm text-ink-soft">{summary}</span>
        </span>
        {done ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sage text-sage-ink">
            <Icon.check size={14} />
            <span className="sr-only">(elegido)</span>
          </span>
        ) : (
          <Icon.next className="shrink-0 text-ink-soft transition-transform duration-300 group-open:rotate-90" />
        )}
      </summary>
      <div className="row-body">{children}</div>
    </details>
  );
}
