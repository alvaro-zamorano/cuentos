"use client";

import { EYES, HAIR_COLORS, SKINS } from "@/lib/traits";
import { GLASSES_PICKS, HAIR_PICKS, OUTFIT_PICKS, PET_PICKS } from "@/lib/crearPicks";
import { LIMITS } from "@/lib/plan/ficha";
import type { CastMember, Ficha, Look } from "@/lib/plan/types";
import type { Glasses, HairShape } from "@/lib/types";
import { Tiles } from "./Tiles";

/**
 * Paso 2: cómo es y quién más sale. Todo opcional: lo que no se marque lo decide el ilustrador y se ve en la hoja de
 * personajes, donde se puede corregir con palabras.
 */
export function StepHero({ ficha, onChange, onBack, onNext }: { ficha: Ficha; onChange: (f: Ficha) => void; onBack: () => void; onNext: () => void }) {
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

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <section className="grid gap-6">
        <div className="grid gap-2">
          <h2 className="display text-3xl sm:text-4xl">¿Cómo es {name}?</h2>
          <p className="text-ink-soft">Todo es opcional. Lo que marques saldrá igual en todas las páginas; lo demás lo verás en la hoja de personajes y lo podrás cambiar con palabras.</p>
        </div>

        <div className="grid gap-2">
          <span className="field-label">Piel</span>
          <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Tono de piel">
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
          <span className="field-label">Pelo</span>
          <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Color de pelo">
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
          <Tiles label="Peinado" picks={HAIR_PICKS} value={look.hair?.shape} tint={tint} onPick={(id) => setLook({ hair: { ...look.hair, shape: toggle(look.hair?.shape, id as HairShape) } })} />
        </div>

        <div className="grid gap-2">
          <span className="field-label">Ojos</span>
          <div className="flex flex-wrap gap-2">
            {EYES.map((c) => (
              <button type="button" key={c.id} className={`chip gap-2 ${look.eyes === c.id ? "chip-on" : ""}`} onClick={() => setLook({ eyes: toggle(look.eyes, c.id) })}>
                <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c.hex }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="field-label">Gafas</span>
          <Tiles label="Gafas" picks={GLASSES_PICKS} value={look.glasses} tint={{ skin: tint.skin }} cols="grid-cols-4 sm:grid-cols-7" onPick={(id) => setLook({ glasses: toggle(look.glasses, id as Glasses) })} />
        </div>

        <label className="grid gap-1">
          <span className="field-label">Algo que le hace único</span>
          <input className="input" value={look.unique ?? ""} maxLength={LIMITS.unique} onChange={(e) => setLook({ unique: e.target.value })} placeholder="pecas en la nariz, le falta un diente, su capa roja" />
        </label>
        <div className="grid gap-2">
          <span className="field-label">Ropa de siempre</span>
          <Tiles
            label="Ropa de siempre"
            picks={OUTFIT_PICKS}
            value={OUTFIT_PICKS.find((o) => o.text === hero.outfit)?.id}
            tall
            cols="grid-cols-4 sm:grid-cols-8"
            onPick={(id) => {
              const pick = OUTFIT_PICKS.find((o) => o.id === id)!;
              onChange({ ...ficha, hero: { ...hero, outfit: hero.outfit === pick.text ? "" : pick.text } });
            }}
          />
          <input className="input" aria-label="Ropa de siempre, en tus palabras" value={hero.outfit ?? ""} maxLength={LIMITS.outfit} onChange={(e) => onChange({ ...ficha, hero: { ...hero, outfit: e.target.value } })} placeholder="o descríbela: su peto amarillo con una camiseta de rayas" />
        </div>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-2">
          <h2 className="display text-2xl sm:text-3xl">¿Quién más sale?</h2>
          <p className="text-ink-soft">Hasta dos personas o mascotas que salgan en varias páginas. Las demás, nómbralas en la idea y las describimos nosotros.</p>
        </div>
        {ficha.cast.map((c, i) => (
          <div key={i} className="card grid gap-4" data-testid={`cast-${i}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {(["persona", "mascota"] as const).map((k) => (
                  <button type="button" key={k} className={`chip ${c.kind === k ? "chip-on" : ""}`} onClick={() => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, kind: k } : x)))}>
                    {k === "persona" ? "Persona" : "Mascota"}
                  </button>
                ))}
              </div>
              <button type="button" className="text-sm text-ink-soft underline" onClick={() => setCast(ficha.cast.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="field-label">Nombre</span>
                <input className="input" value={c.name} maxLength={LIMITS.castName} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "Toby" : "Carmen"} />
              </label>
              <label className="grid gap-1">
                <span className="field-label">Qué es de {name}</span>
                <input className="input" value={c.relation} maxLength={LIMITS.castRelation} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "su perro" : "su abuela"} />
              </label>
            </div>
            {c.kind === "mascota" && (
              <Tiles
                label={`Cómo es ${c.name.trim() || "la mascota"}`}
                picks={PET_PICKS}
                value={PET_PICKS.find((p) => p.text === c.look)?.id}
                cols="grid-cols-4 sm:grid-cols-8"
                onPick={(id) => {
                  const pick = PET_PICKS.find((p) => p.id === id)!;
                  const off = c.look === pick.text;
                  setCast(ficha.cast.map((x, j) => (j === i ? { ...x, look: off ? "" : pick.text, relation: (x.relation.trim() || off) ? x.relation : pick.relation } : x)));
                }}
              />
            )}
            <label className="grid gap-1">
              <span className="field-label">Cómo es, en una línea</span>
              <input className="input" value={c.look} maxLength={LIMITS.castLook} onChange={(e) => setCast(ficha.cast.map((x, j) => (j === i ? { ...x, look: e.target.value } : x)))} placeholder={c.kind === "mascota" ? "perro blanco con manchas marrones y collar rojo" : "pelo blanco recogido y gafas rojas"} />
            </label>
          </div>
        ))}
        {ficha.cast.length < LIMITS.cast && (
          <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={() => setCast([...ficha.cast, { id: "c1", kind: "mascota", name: "", relation: "", look: "" }])} data-testid="add-cast">
            Añadir a alguien
          </button>
        )}
      </section>

      <section className="grid gap-4">
        <div className="grid gap-2">
          <h2 className="display text-2xl sm:text-3xl">Lo que solo tú sabes</h2>
          <p className="text-ink-soft">Frases que dice, manías, sitios, lo que le encanta. Las repartimos por el cuento.</p>
        </div>
        {details.map((d, i) => (
          <input
            key={i}
            className="input"
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
          <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={() => onChange({ ...ficha, details: [...details, ""] })}>
            Otro detalle
          </button>
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="display text-2xl sm:text-3xl">La dedicatoria</h2>
        <label className="grid gap-1">
          <span className="field-label">De parte de</span>
          <input className="input" value={ficha.from ?? ""} maxLength={LIMITS.from} onChange={(e) => onChange({ ...ficha, from: e.target.value })} placeholder="mamá y papá" />
        </label>
        <label className="grid gap-1">
          <span className="field-label">Dedicatoria (si la dejas vacía, te proponemos una)</span>
          <textarea className="min-h-20 w-full rounded-[6px] border border-line bg-card p-3 leading-relaxed outline-none focus:border-ink" value={ficha.dedication ?? ""} maxLength={LIMITS.dedication} onChange={(e) => onChange({ ...ficha, dedication: e.target.value })} />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Atrás
        </button>
        <button type="submit" className="btn-primary" data-testid="next-2">
          Escribir el cuento
        </button>
      </div>
    </form>
  );
}
