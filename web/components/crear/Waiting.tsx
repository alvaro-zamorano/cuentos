"use client";

import { useEffect, useState } from "react";
import { Blob, Icon, Sparkle } from "@/components/brand";
import type { BookJobView } from "@/lib/book/service";
import type { PlanPage } from "@/lib/plan/types";
import { firstSentence } from "@/lib/waiting";

/**
 * Esperas de las imágenes (docs/ESTILO.md §4). Dos reglas: el estado que se enseña es el real (los jobs), nunca un
 * porcentaje inventado; y lo que entretiene es su propio cuento o algo que se puede ignorar, nunca un juego que
 * compita con el resultado. Sin coste de generación: todo es SVG y CSS, quieto con «reducir movimiento».
 */

const TINTS = ["var(--peach)", "var(--sky)", "var(--butter)", "var(--sage)"];

/**
 * Página por pintar: «se verá:» con su escena y una mancha de gouache que se va llenando mientras se pinta.
 * Va dentro del marco de BookImage (mismo tamaño que la ilustración que la sustituirá).
 */
export function PaintingPlaceholder({
  running,
  scene,
  tint = 0,
}: {
  running: boolean;
  scene: string;
  tint?: number;
}) {
  return (
    <div className="locked-paper absolute inset-0 grid place-items-center overflow-hidden">
      <Blob
        className={`absolute top-1/2 left-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2 opacity-80 ${running ? "bloom" : "scale-[0.35]"}`}
        color={TINTS[tint % TINTS.length]}
      />
      <span className="relative grid max-w-[34ch] justify-items-center gap-1.5 px-6 text-center">
        <span className="hand flex items-center gap-2 text-[17px] text-ink-soft">
          {running ? (
            <Icon.brush size={18} className="text-accent" />
          ) : (
            <Sparkle className="twinkle" size={13} color="var(--accent)" />
          )}
          {running ? "pintando…" : "en cola…"}
        </span>
        <span className="hand line-clamp-3 text-[16px] leading-snug text-ink">
          se verá: {scene}
        </span>
      </span>
    </div>
  );
}

const STATE: Record<BookJobView["status"], string> = {
  pending: "en cola",
  running: "pintando",
  done: "hecho",
  failed: "no ha salido",
};

/** Frases del cuento que van pasando, una cada pocos segundos. */
function StoryLines({ pages }: { pages: PlanPage[] }) {
  const lines = pages
    .map((p) => ({ n: p.n, text: firstSentence(p.text) }))
    .filter((l) => l.text);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 7000);
    return () => clearInterval(t);
  }, [lines.length]);
  if (lines.length === 0) return null;
  const l = lines[i % lines.length];
  return (
    <p key={l.n} className="rise grid gap-1 text-moon" data-testid="wait-story">
      <span className="hand text-[16px] text-star">en la página {l.n}</span>
      <span className="story text-[17px] leading-snug">{l.text}</span>
    </p>
  );
}

const POINTS: [number, number][] = [
  [28, 44],
  [66, 30],
  [100, 56],
  [138, 48],
  [168, 86],
  [206, 70],
  [222, 118],
];

/** Constelación para unir con el dedo, estrella a estrella. Opcional: no bloquea nada y no tiene puntos. */
function Constellation({ name }: { name: string }) {
  const [lit, setLit] = useState(0);
  const done = lit === POINTS.length;
  return (
    <div className="mx-auto w-full max-w-[300px]" data-testid="constellation">
      <div className="relative">
        <svg aria-hidden viewBox="0 0 250 150" className="block w-full">
          {POINTS.slice(1, Math.max(lit, 1)).map(([x, y], k) => {
            const [px, py] = POINTS[k];
            return (
              <line
                key={k}
                x1={px}
                y1={py}
                x2={x}
                y2={y}
                stroke="var(--star)"
                strokeWidth={1.4}
                strokeLinecap="round"
                className="rise"
              />
            );
          })}
          {[
            [14, 120],
            [120, 12],
            [236, 24],
            [70, 132],
          ].map(([x, y], k) => (
            <circle
              key={k}
              cx={x}
              cy={y}
              r={1.2}
              fill="var(--moon)"
              className={k % 2 ? "twinkle-slow" : "twinkle"}
            />
          ))}
        </svg>
        {POINTS.map(([x, y], k) => {
          const on = k < lit;
          const next = k === lit;
          return (
            <button
              key={k}
              type="button"
              aria-label={
                on
                  ? `Estrella ${k + 1}, encendida`
                  : `Estrella ${k + 1} de ${POINTS.length}`
              }
              disabled={!next}
              onClick={() => setLit(k + 1)}
              className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full disabled:cursor-default"
              style={{
                left: `${(x / 250) * 100}%`,
                top: `${(y / 150) * 100}%`,
              }}
            >
              <Sparkle
                size={on ? 18 : 13}
                color={on ? "var(--star)" : "rgba(247,230,181,0.45)"}
                className={next ? "twinkle" : ""}
              />
            </button>
          );
        })}
      </div>
      <p
        className="hand mt-1 min-h-[1.5em] text-center text-[16px] text-star"
        aria-live="polite"
      >
        {done
          ? `La constelación de ${name}`
          : lit === 0
            ? "Une las estrellas mientras tanto"
            : ""}
      </p>
      {done && (
        <button
          type="button"
          className="mx-auto block text-[13px] text-moon-soft underline underline-offset-2"
          onClick={() => setLit(0)}
        >
          Otra vez
        </button>
      )}
    </div>
  );
}

/**
 * Espera del paso 4 (personajes y portada, uno o dos minutos): qué se está pintando de verdad, frases de su cuento,
 * la constelación y, si el servidor sigue pintando aunque se cierre la página, el permiso para irse.
 */
export function WaitCard({
  name,
  sheet,
  cover,
  pages,
  background,
  mail,
  testId,
}: {
  name: string;
  sheet?: BookJobView;
  cover?: BookJobView;
  pages: PlanPage[];
  background?: boolean;
  mail?: boolean;
  testId?: string;
}) {
  const rows: [string, BookJobView | undefined][] = [
    ["Sus personajes", sheet],
    ["La portada", cover],
  ];
  return (
    <section
      className="rise relative overflow-hidden rounded-[28px] bg-night px-6 pt-6 pb-6 text-moon sm:px-8"
      aria-label="Pintando"
      data-testid={testId}
    >
      <div className="grid gap-6 sm:grid-cols-[1fr_1fr] sm:items-center sm:gap-8">
        <div className="grid gap-5">
          <ul className="grid max-w-[22rem] gap-0" aria-live="polite">
            {rows.map(([label, job]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 border-b border-white/12 py-2.5 text-[15px] last:border-0"
                data-testid={`wait-${label === "La portada" ? "cover" : "sheet"}`}
              >
                <span>{label}</span>
                <span
                  className={`hand flex items-center gap-1.5 text-[17px] ${job?.status === "done" ? "text-moon" : "text-star"}`}
                >
                  {job?.status === "done" ? (
                    <Icon.check size={15} />
                  ) : job?.status === "running" ? (
                    <Icon.brush size={15} className="pen-write" />
                  ) : null}
                  {job ? STATE[job.status] : "en cola"}
                </span>
              </li>
            ))}
          </ul>
          <StoryLines pages={pages} />
        </div>
        <Constellation name={name} />
      </div>
      <p className="mt-5 text-[13px] leading-snug text-moon-soft">
        {background
          ? `Tarda uno o dos minutos. Puedes cerrar esta página: seguimos pintando${mail ? " y tienes el enlace en tu correo" : " y vuelves con el enlace de abajo"}.`
          : "Tarda uno o dos minutos. Deja esta página abierta mientras pintamos."}
      </p>
    </section>
  );
}
