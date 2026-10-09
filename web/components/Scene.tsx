"use client";

import { Avatar } from "./Avatar";
import { ContactShadow, FinishDefs, FinishOverlay, useFinishId } from "./Finish";
import { PaintedCompanion, PaintedFigure } from "./PaintedFigure";
import { companionFor, figureFor, isFigure } from "@/lib/pieces";
import { Companion } from "./Companion";
import { SPECIALS } from "@/lib/traits";
import type { Companion as CompanionT, Expression, SceneId, SpecialId, StyleId, Traits } from "@/lib/types";

/**
 * Escena en modo Clásico: composición vectorial determinista.
 * viewBox 0 0 600 400 (3:2). El avatar se coloca con <g transform>.
 */
export function Scene({
  scene,
  traits,
  expression,
  companion,
  special,
  age,
  className,
  finish = true,
  style,
}: {
  scene: SceneId;
  traits: Traits;
  expression: Expression;
  companion?: CompanionT;
  special: SpecialId;
  age: number;
  className?: string;
  finish?: boolean;
  /** Estilo con piezas pintadas (p. ej. "gouache"). Sin él, dibuja el avatar vectorial. */
  style?: StyleId;
}) {
  const emoji = SPECIALS.find((s) => s.id === special)?.emoji ?? "⭐";
  const fid = useFinishId();
  const painted = style ? figureFor(style, traits) : null;
  const paintedComp = style ? companionFor(style, companion) : null;
  const hero = (x: number, y: number, s = 0.78, flip = false) => (
    <>
      {finish && <ContactShadow id={fid} cx={x + 100 * s} cy={y + 274 * s} rx={70 * s} ry={10 * s} />}
      {painted ? (
        <PaintedFigure
          spec={painted}
          x={x + 100 * s}
          y={y + 276 * s}
          height={290 * s}
          flip={flip}
          fallback={
            <g transform={`translate(${x} ${y}) scale(${s})`}>
              <Avatar traits={traits} expression={expression} size={200} flip={flip} />
            </g>
          }
        />
      ) : (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <Avatar traits={traits} expression={expression} size={200} flip={flip} />
        </g>
      )}
    </>
  );
  const comp = (x: number, y: number, s = 0.74) =>
    companion ? (
      <>
        {finish && <ContactShadow id={fid} cx={x + 100 * s} cy={y + 274 * s} rx={75 * s} ry={10 * s} />}
        {paintedComp ? (
          <PaintedCompanion
            spec={paintedComp}
            x={x + 100 * s}
            y={!isFigure(paintedComp) && paintedComp.bust ? 406 : y + 276 * s}
            height={isFigure(paintedComp) ? 260 * s : paintedComp.bust ? 300 * s : 200 * s}
            flip={x > 300}
            fallback={
              <g transform={`translate(${x} ${y}) scale(${s})`}>
                <Companion companion={companion} size={200} />
              </g>
            }
          />
        ) : (
          <g transform={`translate(${x} ${y}) scale(${s})`}>
            <Companion companion={companion} size={200} />
          </g>
        )}
      </>
    ) : null;

  return (
    <svg viewBox="0 0 600 400" className={className} role="img" aria-label={`Escena: ${scene}`}>
      {finish && <FinishDefs id={fid} seed={7 + scene.length} />}
      <g filter={finish ? `url(#${fid}-rough)` : undefined}>
      {scene === "cama-manana" && (
        <>
          <Room wall="#fde9c9" floor="#d9a97a" />
          <Window x={360} y={50} mode="sun" />
          <Bed x={60} y={210} />
          {hero(230, 150, 0.7)}
        </>
      )}
      {scene === "ventana" && (
        <>
          <Room wall="#dbeeff" floor="#c9b28f" />
          <Window x={190} y={30} mode="sun" w={220} h={180} />
          <Bird x={230} y={70} />
          <Bird x={330} y={55} />
          {hero(240, 170, 0.8, false)}
        </>
      )}
      {scene === "desayuno" && (
        <>
          <Room wall="#fff3d6" floor="#e0c3a0" />
          <Table x={300} y={240} w={300} />
          <Plate x={360} y={232} />
          <Chair x={120} y={200} />
          <Balloon x={160} y={70} color="#e4573d" string={130} />
          {hero(70, 150, 0.7)}
        </>
      )}
      {scene === "puerta-regalo" && (
        <>
          <Room wall="#e9f2e2" floor="#cfae84" />
          <Door x={400} y={60} />
          {comp(400, 140)}
          <Gift x={250} y={230} size={90} color="#4a86c9" />
          {hero(70, 150, 0.78)}
        </>
      )}
      {scene === "salon-globos" && (
        <>
          <Room wall="#f4e6ff" floor="#d8b48c" />
          <Garland y={40} />
          <Balloon x={80} y={120} color="#f6c445" string={70} />
          <Balloon x={300} y={80} color="#5aa469" string={60} />
          <Balloon x={520} y={110} color="#e4573d" string={80} />
          <Balloon x={430} y={60} color="#9b7fd0" string={50} />
          {hero(120, 150, 0.78)}
          {comp(360, 160)}
        </>
      )}
      {scene === "nube-deseo" && (
        <>
          <Room wall="#e6f0f7" floor="#c9b28f" />
          <Armchair x={140} y={190} />
          <Thought x={330} y={40} emoji={emoji} />
          {hero(190, 130, 0.72)}
        </>
      )}
      {scene === "parque" && (
        <>
          <Outdoor sky="#bfe3ff" grass="#8fd07a" />
          <Sun x={520} y={60} />
          <Tree x={60} y={110} />
          <Swing x={380} y={120} />
          <Bench x={200} y={300} />
          {comp(230, 180, 0.6)}
          {hero(420, 180, 0.72)}
        </>
      )}
      {scene === "jardin-juego" && (
        <>
          <Outdoor sky="#cbe9ff" grass="#9bd68a" />
          <Sun x={80} y={60} />
          <Flower x={110} y={330} color="#e4573d" />
          <Flower x={160} y={345} color="#f6c445" />
          <Flower x={520} y={335} color="#9b7fd0" />
          <Stone x={420} y={340} />
          <Paper x={440} y={300} />
          {hero(230, 150, 0.78)}
          {comp(400, 170, 0.66)}
        </>
      )}
      {scene === "mesa-tarta" && (
        <>
          <Room wall="#fff0e0" floor="#d9a97a" />
          <Garland y={40} />
          <Table x={300} y={250} w={340} />
          <Cake x={300} y={200} candles={age} />
          {hero(90, 150, 0.74)}
          {comp(430, 160, 0.7)}
        </>
      )}
      {scene === "velas" && (
        <>
          <Room wall="#ffe9d1" floor="#d9a97a" />
          <Table x={300} y={270} w={360} />
          <Cake x={330} y={210} candles={age} scale={1.3} smoke />
          {hero(110, 140, 0.8)}
        </>
      )}
      {scene === "abrir-regalo" && (
        <>
          <Room wall="#f2f7e6" floor="#d8b48c" />
          <Gift x={270} y={250} size={110} color="#e4573d" open emoji={emoji} />
          <Confetti />
          {hero(90, 150, 0.76)}
          {comp(410, 160, 0.7)}
        </>
      )}
      {scene === "cama-noche" && (
        <>
          <Room wall="#2f3d5c" floor="#3b3a4a" />
          <Window x={360} y={50} mode="night" />
          <Bed x={60} y={210} />
          <Gift x={430} y={300} size={60} color="#f6c445" />
          {hero(170, 170, 0.62)}
        </>
      )}
      </g>
      {finish && <FinishOverlay id={fid} />}
    </svg>
  );
}

/* ---------- Fondos ---------- */

function Room({ wall, floor }: { wall: string; floor: string }) {
  return (
    <>
      <rect width="600" height="400" fill={wall} />
      <rect width="600" height="300" fill="url(#roomShade)" />
      <g stroke="#000" strokeWidth="10" opacity="0.045">
        <path d="M60 0 V296 M180 0 V296 M300 0 V296 M420 0 V296 M540 0 V296" />
      </g>
      <rect y="300" width="600" height="100" fill={floor} />
      <g stroke="#000" strokeWidth="1.5" opacity="0.18">
        <path d="M0 330 H600 M0 365 H600 M120 300 V400 M300 300 V400 M470 300 V400" />
      </g>
      <rect y="296" width="600" height="8" fill="rgba(0,0,0,0.12)" />
      <defs>
        <linearGradient id="roomShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#6b4a2a" stopOpacity="0.12" />
        </linearGradient>
      </defs>
    </>
  );
}

function Outdoor({ sky, grass }: { sky: string; grass: string }) {
  return (
    <>
      <rect width="600" height="400" fill={sky} />
      <rect width="600" height="400" fill="url(#skyShade)" />
      <ellipse cx="300" cy="400" rx="420" ry="130" fill={grass} />
      <ellipse cx="300" cy="420" rx="420" ry="110" fill="#000" opacity="0.07" />
      <defs>
        <linearGradient id="skyShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="90" rx="50" ry="22" fill="#fff" opacity="0.9" />
      <ellipse cx="400" cy="60" rx="60" ry="24" fill="#fff" opacity="0.9" />
    </>
  );
}

/* ---------- Props ---------- */

function Window({ x, y, mode, w = 170, h = 150 }: { x: number; y: number; mode: "sun" | "night"; w?: number; h?: number }) {
  const sky = mode === "sun" ? "#9ed3ff" : "#1b2440";
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-8" y="-8" width={w + 16} height={h + 16} rx="10" fill="#fff" />
      <rect width={w} height={h} rx="6" fill={sky} />
      {mode === "sun" ? (
        <g>
          <circle cx={w * 0.7} cy={h * 0.35} r={h * 0.18} fill="#ffd34d" />
          <ellipse cx={w * 0.3} cy={h * 0.6} rx={w * 0.22} ry={h * 0.1} fill="#fff" opacity="0.9" />
        </g>
      ) : (
        <g>
          <circle cx={w * 0.7} cy={h * 0.35} r={h * 0.16} fill="#fff6c9" />
          <circle cx={w * 0.76} cy={h * 0.3} r={h * 0.13} fill={sky} />
          <Star x={w * 0.3} y={h * 0.3} />
          <Star x={w * 0.45} y={h * 0.65} s={0.7} />
        </g>
      )}
      <rect x={w / 2 - 3} width="6" height={h} fill="#fff" />
      <rect y={h / 2 - 3} width={w} height="6" fill="#fff" />
    </g>
  );
}

function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -10 L3 -3 L10 -2 L5 3 L6 10 L0 6 L-6 10 L-5 3 L-10 -2 L-3 -3 Z"
      fill="#ffe27a"
    />
  );
}

function Sun({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="-3" y="-52" width="6" height="18" rx="3" fill="#ffd34d" transform={`rotate(${i * 45})`} />
      ))}
      <circle r="28" fill="#ffd34d" />
    </g>
  );
}

function Bird({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} q8 -8 16 0 q8 -8 16 0`} stroke="#3b4a66" strokeWidth="3" fill="none" strokeLinecap="round" />;
}

function Bed({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="-40" width="24" height="130" rx="8" fill="#8c5a3c" />
      <rect x="0" y="30" width="250" height="60" rx="12" fill="#9b7fd0" />
      <rect x="0" y="10" width="250" height="30" rx="10" fill="#fff" />
      <rect x="20" y="-4" width="70" height="30" rx="10" fill="#fff8e6" />
      <rect x="236" y="0" width="18" height="90" rx="6" fill="#8c5a3c" />
    </g>
  );
}

function Table({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <rect width={w} height="22" rx="8" fill="#b57a4a" />
      <rect x="20" y="22" width="18" height="90" fill="#8c5a3c" />
      <rect x={w - 38} y="22" width="18" height="90" fill="#8c5a3c" />
    </g>
  );
}

function Plate({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx="40" ry="10" fill="#fff" />
      <path d="M-12 -14 L-4 -4 L8 -6 L0 2 L4 12 L-6 6 L-16 10 L-12 0 L-20 -6 L-8 -6 Z" fill="#e9b96e" />
    </g>
  );
}

function Chair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-30" y="-60" width="60" height="10" rx="4" fill="#8c5a3c" />
      <rect x="-30" y="-60" width="10" height="100" fill="#8c5a3c" />
      <rect x="20" y="-60" width="10" height="100" fill="#8c5a3c" />
      <rect x="-32" y="30" width="64" height="12" rx="4" fill="#b57a4a" />
      <rect x="-28" y="42" width="8" height="60" fill="#8c5a3c" />
      <rect x="20" y="42" width="8" height="60" fill="#8c5a3c" />
    </g>
  );
}

function Armchair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="180" height="110" rx="24" fill="#5aa469" />
      <rect x="-14" y="40" width="40" height="90" rx="16" fill="#3f8450" />
      <rect x="154" y="40" width="40" height="90" rx="16" fill="#3f8450" />
      <rect x="10" y="80" width="160" height="50" rx="14" fill="#3f8450" />
    </g>
  );
}

function Balloon({ x, y, color, string }: { x: number; y: number; color: string; string: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 36 q4 ${string / 3} -6 ${string}`} stroke="#6b6f78" strokeWidth="2" fill="none" />
      <ellipse rx="26" ry="34" fill={color} />
      <ellipse cx="-9" cy="-12" rx="6" ry="10" fill="#fff" opacity="0.4" />
      <path d="M-5 34 L5 34 L0 42 Z" fill={color} />
    </g>
  );
}

function Garland({ y }: { y: number }) {
  const colors = ["#e4573d", "#f6c445", "#5aa469", "#4a86c9", "#9b7fd0", "#f0924a"];
  return (
    <g>
      <path d={`M0 ${y} q150 60 300 0 t300 0`} stroke="#6b6f78" strokeWidth="2" fill="none" />
      {Array.from({ length: 12 }).map((_, i) => {
        const x = 25 + i * 50;
        const t = ((x % 300) / 300);
        const yy = y + 120 * t * (1 - t); // punto sobre la curva cuadrática
        return <path key={i} d={`M${x - 12} ${yy} h24 l-12 28 z`} fill={colors[i % colors.length]} />;
      })}
    </g>
  );
}

function Door({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-12" y="-12" width="184" height="252" rx="10" fill="#8c5a3c" />
      <rect width="160" height="240" rx="6" fill="#fff3d6" />
      <circle cx="140" cy="130" r="7" fill="#f6c445" />
    </g>
  );
}

function Gift({ x, y, size, color, open = false, emoji }: { x: number; y: number; size: number; color: string; open?: boolean; emoji?: string }) {
  const ribbon = "#ffe27a";
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={size} height={size * 0.8} rx="8" fill={color} />
      <rect x={size / 2 - size * 0.08} width={size * 0.16} height={size * 0.8} fill={ribbon} />
      {open ? (
        <g>
          <rect x={-size * 0.1} y={-size * 0.22} width={size * 0.55} height={size * 0.2} rx="4" fill={color} transform={`rotate(-18 0 0)`} />
          <rect x={size * 0.55} y={-size * 0.22} width={size * 0.55} height={size * 0.2} rx="4" fill={color} transform={`rotate(18 ${size} 0)`} />
          <text x={size / 2} y={-size * 0.12} textAnchor="middle" fontSize={size * 0.5}>
            {emoji}
          </text>
        </g>
      ) : (
        <g>
          <rect x={-size * 0.05} y={-size * 0.14} width={size * 1.1} height={size * 0.22} rx="6" fill={color} />
          <rect x={size / 2 - size * 0.08} y={-size * 0.14} width={size * 0.16} height={size * 0.22} fill={ribbon} />
          <ellipse cx={size / 2 - size * 0.14} cy={-size * 0.2} rx={size * 0.14} ry={size * 0.09} fill={ribbon} />
          <ellipse cx={size / 2 + size * 0.14} cy={-size * 0.2} rx={size * 0.14} ry={size * 0.09} fill={ribbon} />
        </g>
      )}
    </g>
  );
}

function Confetti() {
  const colors = ["#e4573d", "#f6c445", "#5aa469", "#4a86c9", "#9b7fd0"];
  const pts = [
    [60, 60], [140, 40], [220, 90], [300, 50], [380, 80], [460, 40], [540, 70], [100, 130], [500, 120], [330, 120],
  ];
  return (
    <g>
      {pts.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="10" height="16" rx="2" fill={colors[i % colors.length]} transform={`rotate(${(i * 37) % 90} ${x} ${y})`} />
      ))}
    </g>
  );
}

function Thought({ x, y, emoji }: { x: number; y: number; emoji: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="-40" cy="150" r="9" fill="#fff" />
      <circle cx="-16" cy="124" r="14" fill="#fff" />
      <ellipse cx="80" cy="60" rx="110" ry="58" fill="#fff" />
      <text x="80" y="82" textAnchor="middle" fontSize="64">
        {emoji}
      </text>
    </g>
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="40" y="110" width="30" height="120" rx="8" fill="#8c5a3c" />
      <circle cx="55" cy="90" r="70" fill="#5aa469" />
      <circle cx="20" cy="120" r="45" fill="#6fb77c" />
      <circle cx="95" cy="118" r="48" fill="#6fb77c" />
    </g>
  );
}

function Swing({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 200 L40 0 L80 200" stroke="#8c5a3c" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M120 200 L160 0 L200 200" stroke="#8c5a3c" strokeWidth="10" fill="none" strokeLinecap="round" />
      <rect x="36" y="-6" width="128" height="12" rx="6" fill="#8c5a3c" />
      <path d="M80 6 v140 M120 6 v140" stroke="#6b6f78" strokeWidth="3" />
      <rect x="66" y="146" width="68" height="12" rx="5" fill="#e4573d" />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="160" height="14" rx="6" fill="#b57a4a" />
      <rect y="-40" width="160" height="14" rx="6" fill="#b57a4a" />
      <rect x="10" y="-40" width="10" height="90" fill="#8c5a3c" />
      <rect x="140" y="-40" width="10" height="90" fill="#8c5a3c" />
    </g>
  );
}

function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-3" y="0" width="6" height="40" fill="#3f8450" />
      {Array.from({ length: 6 }).map((_, i) => (
        <ellipse key={i} cy="-14" rx="7" ry="12" fill={color} transform={`rotate(${i * 60})`} />
      ))}
      <circle r="7" fill="#ffe27a" />
    </g>
  );
}

function Stone({ x, y }: { x: number; y: number }) {
  return <ellipse cx={x} cy={y} rx="34" ry="18" fill="#9a9a9a" />;
}

function Paper({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-12)`}>
      <rect width="40" height="50" rx="4" fill="#fff" />
      <path d="M8 14 h24 M8 24 h24 M8 34 h16" stroke="#6b6f78" strokeWidth="3" />
    </g>
  );
}

function Cake({ x, y, candles, scale = 1, smoke = false }: { x: number; y: number; candles: number; scale?: number; smoke?: boolean }) {
  const n = Math.max(1, Math.min(10, candles));
  const spacing = 110 / Math.max(1, n - 1);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-80" y="0" width="160" height="60" rx="14" fill="#f6c0c8" />
      <rect x="-80" y="0" width="160" height="18" rx="9" fill="#fff" />
      <rect x="-60" y="-34" width="120" height="40" rx="12" fill="#f6c0c8" />
      <rect x="-60" y="-34" width="120" height="14" rx="7" fill="#fff" />
      {Array.from({ length: n }).map((_, i) => {
        const cx = n === 1 ? 0 : -55 + i * spacing;
        return (
          <g key={i} transform={`translate(${cx} -34)`}>
            <rect x="-4" y="-24" width="8" height="24" rx="2" fill={["#4a86c9", "#e4573d", "#5aa469", "#9b7fd0"][i % 4]} />
            {smoke ? (
              <path d="M0 -26 q-6 -10 0 -20 q6 -10 0 -20" stroke="#aab" strokeWidth="2" fill="none" />
            ) : (
              <ellipse cx="0" cy="-32" rx="5" ry="9" fill="#ffb347" />
            )}
          </g>
        );
      })}
    </g>
  );
}
