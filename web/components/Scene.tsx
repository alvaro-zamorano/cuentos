"use client";

import { useId } from "react";
import { Avatar } from "./Avatar";
import { ContactShadow, FinishDefs, FinishOverlay, useFinishId } from "./Finish";
import { PaintedCompanion, PaintedFigure } from "./PaintedFigure";
import { SCENE_POSE, backgroundFor, companionFor, figureFor, isFigure } from "@/lib/pieces";
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
  variant = 0,
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
  /** Versión de la página (edición ilustrada, «Otra versión»): las impares van en espejo y cada una cambia la textura. */
  variant?: number;
}) {
  const emoji = SPECIALS.find((s) => s.id === special)?.emoji ?? "⭐";
  const fid = useFinishId();
  const painted = style ? figureFor(style, traits, SCENE_POSE[scene]) : null;
  const paintedComp = style ? companionFor(style, companion) : null;
  const bg = backgroundFor(style, scene);
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
  /** Igual que hero(), pero por el punto de apoyo: (fx, fy) = centro de los pies y línea del suelo; h = altura en unidades de escena. */
  const heroAt = (fx: number, fy: number, h: number, flip = false) => {
    const s = h / 290;
    return hero(fx - 100 * s, fy - 276 * s, s, flip);
  };
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
  const compAt = (fx: number, fy: number, h: number) => {
    const s = h / 260;
    return comp(fx - 100 * s, fy - 276 * s, s);
  };
  /** Abuelo/a pintado (busto, sin pies): en las escenas vectoriales siempre queda detrás de algo que se dibuja después. */
  const isBust = !!paintedComp && !isFigure(paintedComp) && paintedComp.bust;
  /** Busto por su borde inferior: (cx, bottom) = centro y base de la pieza; h = altura de la pieza. */
  const bustAt = (cx: number, bottom: number, h: number) =>
    companion && paintedComp ? (
      <PaintedCompanion
        spec={paintedComp}
        x={cx}
        y={bottom}
        height={h}
        flip={cx > 300}
        fallback={
          <g transform={`translate(${cx - h * 0.37} ${bottom - h}) scale(${h / 270})`}>
            <Companion companion={companion} size={200} />
          </g>
        }
      />
    ) : null;

  if (bg && style) {
    // Fondo pintado (imagen) + superposiciones vectoriales que dependen de los datos + figuras.
    const g = bg.ground;
    return (
      <svg viewBox="0 0 600 400" className={className} role="img" aria-label={`Escena: ${scene}`} data-painted-bg={scene}>
        {finish && <FinishDefs id={fid} seed={7 + scene.length + variant * 13} />}
        <g transform={variant % 2 === 1 ? "translate(600 0) scale(-1 1)" : undefined}>
          <g filter={finish ? `url(#${fid}-rough)` : undefined}>
            <image href={`/pieces/${style}/backgrounds/${scene}.jpg`} width="600" height="400" preserveAspectRatio="xMidYMid slice" />
            <g filter={finish ? `url(#${fid}-paint)` : undefined}>
              {bg.candles && <Candles x={bg.candles.x} y={bg.candles.y} span={bg.candles.span} scale={bg.candles.scale} smoke={bg.candles.smoke} candles={age} />}
              {bg.thought && <Thought x={bg.thought.x} y={bg.thought.y} emoji={emoji} />}
              {bg.comp && compAt(bg.comp.x, bg.comp.ground ?? g, bg.comp.h)}
              {heroAt(bg.hero.x, g, bg.hero.h, bg.hero.flip)}
            </g>
          </g>
        </g>
        {finish && <FinishOverlay id={fid} />}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 600 400" className={className} role="img" aria-label={`Escena: ${scene}`}>
      {finish && <FinishDefs id={fid} seed={7 + scene.length + variant * 13} />}
      <g transform={variant % 2 === 1 ? "translate(600 0) scale(-1 1)" : undefined}>
      <g filter={finish ? `url(#${fid}-rough)` : undefined}>
      <g filter={finish ? `url(#${fid}-paint)` : undefined}>
      {scene === "cama-manana" && (
        <>
          <Room wall="#efdcbc" floor="#c69a6c" light={0.8} />
          <FrameArt x={118} y={66} w={84} h={64} />
          <Window x={396} y={54} w={146} h={138} mode="sun" beam={-90} curtain={C.sage} />
          <Bed x={34} ground={336} duvet={C.dusty} />
          <Rug cx={336} cy={366} rx={128} ry={21} color={C.terra} />
          {heroAt(334, 370, 222)}
        </>
      )}
      {scene === "ventana" && (
        <>
          <Room wall="#e4dcc8" floor="#c7a27a" light={0.4} />
          <Window x={136} y={40} w={226} h={176} mode="sun" beam={90} curtain={C.mustard} birds />
          <Plant x={176} ground={233} s={0.5} />
          <Shelf x={430} y={96} w={136} />
          <Rug cx={420} cy={370} rx={120} ry={20} color={C.dusty} />
          {heroAt(426, 374, 232)}
        </>
      )}
      {scene === "desayuno" && (
        <>
          <Room wall="#f0ddb6" floor="#cfa77c" light={0.25} />
          <FrameArt x={76} y={74} w={70} h={88} />
          <Shelf x={330} y={92} w={168} kitchen />
          <Chair x={486} ground={352} />
          <Balloon x={540} y={92} color={C.terra} string={128} />
          <Table x={392} top={252} w={292} cloth={C.cream} band={C.terra} />
          <Breakfast x={386} y={266} />
          {heroAt(150, 374, 226)}
        </>
      )}
      {scene === "puerta-regalo" && (
        <>
          <Room wall="#e8dfc0" floor="#c9a47a" light={0.65} />
          <FrameArt x={92} y={76} w={74} h={58} />
          <Door x={396} y={58} w={150} h={250} open />
          <Plant x={352} ground={336} s={0.85} />
          {isBust && bustAt(474, 334, 178)}
          <Gift x={408} y={292} size={128} color={C.dusty} />
          {!isBust && compAt(318, 384, 178)}
          {heroAt(176, 376, 226)}
        </>
      )}
      {scene === "salon-globos" && (
        <>
          <Room wall="#ead7cc" floor="#c9a27a" light={0.3} paper />
          <Garland y={34} />
          <Lamp x={318} ground={334} />
          {isBust && bustAt(462, 298, 180)}
          <Sofa x={350} ground={366} w={236} color={C.sage} />
          <Balloon x={66} y={122} color={C.mustard} string={96} />
          <Balloon x={118} y={96} color={C.sage} string={120} />
          <Balloon x={290} y={92} color={C.terra} string={92} />
          <Balloon x={560} y={112} color={C.plum} string={74} />
          {!isBust && compAt(470, 388, 184)}
          {heroAt(196, 378, 230)}
        </>
      )}
      {scene === "nube-deseo" && (
        <>
          <Room wall="#dfdbc6" floor="#c3a07a" light={0.15} />
          <Shelf x={36} y={78} w={160} />
          <Lamp x={552} ground={350} />
          <Armchair x={36} ground={368} color={C.mustard} />
          <Rug cx={292} cy={372} rx={130} ry={21} color={C.sage} />
          <Thought x={398} y={22} emoji={emoji} />
          {heroAt(282, 376, 226)}
        </>
      )}
      {scene === "parque" && (
        <>
          <Outdoor sky="#9ebccb" grass="#a7b56c" path={[380, 300]} />
          <SunGlow x={286} y={52} />
          <Cloud x={130} y={70} s={1} />
          <Cloud x={430} y={42} s={0.75} />
          <Bird x={360} y={100} />
          <Bird x={386} y={86} s={0.8} />
          <Tree x={86} ground={306} s={1} />
          <Swing x={448} ground={332} s={0.82} />
          <Bush x={560} ground={340} w={80} />
          {/* el hilo acaba en la mano de la figura, que se dibuja encima */}
          <Kite x={530} y={80} />
          {isBust && bustAt(170, 330, 180)}
          <Bench x={58} ground={394} w={226} />
          {!isBust && compAt(196, 394, 182)}
          {heroAt(380, 388, 232)}
          <Flowers x={500} y={380} n={7} />
        </>
      )}
      {scene === "jardin-juego" && (
        <>
          <Outdoor sky="#a2bfcb" grass="#a9b76d" path={[230, 320]} />
          <SunGlow x={82} y={62} />
          <Cloud x={300} y={56} s={0.9} />
          <Cloud x={520} y={88} s={0.6} />
          <Bird x={180} y={96} s={0.8} />
          <Bush x={430} ground={290} w={110} />
          <Bush x={560} ground={286} w={90} flowers={false} />
          {isBust && bustAt(492, 326, 182)}
          <StoneWall x={384} ground={342} w={216} />
          {!isBust && compAt(478, 390, 182)}
          <Flower x={84} y={352} color={C.terra} />
          <Flower x={118} y={366} color={C.mustard} />
          <Flowers x={40} y={386} n={6} />
          <Stone x={350} y={376} />
          <Paper x={300} y={344} />
          {heroAt(226, 384, 232)}
        </>
      )}
      {scene === "mesa-tarta" && (
        <>
          <Room wall="#f0d8bd" floor="#c69a6c" light={0.5} />
          <Garland y={34} />
          <FrameArt x={86} y={82} w={64} h={50} />
          {isBust && bustAt(496, 312, 182)}
          <Table x={392} top={262} w={360} cloth={C.cream} band={C.rose} />
          <Cake x={318} y={212} candles={age} />
          {!isBust && compAt(512, 392, 180)}
          {heroAt(118, 380, 228)}
        </>
      )}
      {scene === "velas" && (
        <>
          <Room wall="#eed4b6" floor="#c69a6c" light={0.7} />
          <FrameArt x={496} y={60} w={70} h={86} />
          <Shelf x={40} y={70} w={150} />
          <Table x={414} top={284} w={380} cloth={C.cream} band={C.mustard} />
          <Cake x={392} y={213} candles={age} scale={1.3} smoke />
          {heroAt(150, 386, 240)}
        </>
      )}
      {scene === "abrir-regalo" && (
        <>
          <Room wall="#e4e0c5" floor="#c9a47a" light={0.3} />
          <Shelf x={52} y={84} w={156} />
          <Plant x={404} ground={334} s={0.95} />
          <Rug cx={260} cy={372} rx={176} ry={25} color={C.rose} />
          <Gift x={238} y={290} size={112} color={C.terra} open emoji={emoji} />
          <Confetti />
          {heroAt(148, 380, 228)}
          {isBust ? bustAt(504, 436, 258) : compAt(482, 392, 186)}
        </>
      )}
      {scene === "cama-noche" && (
        <>
          <Room wall="#3b4b72" floor="#4f4762" light={0.75} night />
          <Window x={384} y={52} w={146} h={134} mode="night" curtain="#7d8aa6" beam={-60} />
          <Nightstand x={14} ground={344} />
          <Bed x={98} ground={340} duvet="#9a86a8" night />
          <Gift x={516} y={338} size={48} color={C.mustard} />
          <NightTint />
          <LampGlow x={48} y={250} />
          <Lamp x={48} ground={290} table on />
          {heroAt(452, 378, 206)}
          <NightShade />
        </>
      )}
      </g>
      </g>
      </g>
      {finish && <FinishOverlay id={fid} />}
    </svg>
  );
}

/* ---------- Color ---------- */

/** Paleta desaturada y cálida, en armonía con las piezas gouache. */
const C = {
  wood: "#b07d52",
  cream: "#f3e6cc",
  mustard: "#d6a446",
  sage: "#93a679",
  dusty: "#8ea2ad",
  terra: "#c8704f",
  rose: "#d9a091",
  plum: "#9a7f9c",
  ink: "#4a3426",
};

/** Mezcla lineal de dos colores #rrggbb. */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}
const shade = (c: string, t: number) => mix(c, "#3a2414", t);
const tint = (c: string, t: number) => mix(c, "#fff8ea", t);

/** Id único por instancia para degradados/patrones (hay 12 escenas en la misma página). */
function useGid(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** Masa redonda festoneada (follaje): círculo de `n` lóbulos con radio algo irregular. */
function blob(cx: number, cy: number, r: number, n: number, seed: number) {
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.9 + 0.08 * Math.sin(i * 2.3 + seed));
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) d += `M${f(px)} ${f(py)}`;
    else {
      const am = ((i - 0.5) / n) * Math.PI * 2;
      const rb = r * (1.12 + 0.06 * Math.cos(i * 1.7 + seed));
      d += ` Q${f(cx + Math.cos(am) * rb)} ${f(cy + Math.sin(am) * rb)} ${f(px)} ${f(py)}`;
    }
  }
  return `${d} Z`;
}

/** Sombra de contacto sin filtro: dos elipses superpuestas. */
function FloorShadow({ cx, cy, rx, ry, o = 0.2 }: { cx: number; cy: number; rx: number; ry: number; o?: number }) {
  return (
    <g fill="#3a2414">
      <ellipse cx={cx} cy={cy} rx={rx * 1.12} ry={ry * 1.4} opacity={o * 0.45} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} opacity={o} />
    </g>
  );
}

/* ---------- Fondos ---------- */

/** Filas de tablas: límites en y (más altas cuanto más cerca). */
const PLANK_ROWS = [300, 310, 322, 337, 355, 376, 400];

function Room({ wall, floor, light = 0.5, paper = false, night = false }: { wall: string; floor: string; light?: number; paper?: boolean; night?: boolean }) {
  const id = useGid("room");
  const lx = light * 600;
  const grain = shade(floor, 0.45);
  return (
    <>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(wall, 0.1)} />
          <stop offset="0.45" stopColor={wall} />
          <stop offset="1" stopColor={shade(wall, 0.08)} />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a2414" stopOpacity="0.14" />
          <stop offset="0.18" stopColor="#3a2414" stopOpacity="0" />
          <stop offset="0.82" stopColor="#3a2414" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2414" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx={lx} cy="150" r="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={night ? "#c9d4ee" : "#fff1cc"} stopOpacity={night ? 0.14 : 0.6} />
          <stop offset="1" stopColor="#fff4d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2414" stopOpacity="0.32" />
          <stop offset="0.35" stopColor="#3a2414" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff4d6" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`${id}-grain`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={grain} stopOpacity="0" />
          <stop offset="0.5" stopColor={grain} stopOpacity="0.55" />
          <stop offset="1" stopColor={grain} stopOpacity="0" />
        </linearGradient>
        {paper && (
          <pattern id={`${id}-pat`} width="36" height="36" patternUnits="userSpaceOnUse">
            <circle cx="9" cy="9" r="2.2" fill={shade(wall, 0.25)} />
            <circle cx="27" cy="27" r="2.2" fill={tint(wall, 0.6)} />
          </pattern>
        )}
      </defs>
      <rect width="600" height="300" fill={`url(#${id}-wall)`} />
      {paper && <rect width="600" height="290" fill={`url(#${id}-pat)`} opacity="0.35" />}
      <rect width="600" height="300" fill={`url(#${id}-sun)`} />
      <rect width="600" height="300" fill={`url(#${id}-side)`} />
      {/* rodapié */}
      <rect y="284" width="600" height="17" fill={tint(wall, 0.35)} />
      <rect y="284" width="600" height="3" fill={tint(wall, 0.7)} />
      <rect y="287" width="600" height="2" fill={shade(wall, 0.2)} opacity="0.5" />
      {/* suelo de tablas */}
      <rect y="300" width="600" height="100" fill={floor} />
      {PLANK_ROWS.slice(0, -1).map((y0, r) => {
        const y1 = PLANK_ROWS[r + 1];
        const len = 150 + r * 22;
        const off = ((r * 67) % len) - len;
        const n = Math.ceil((600 - off) / len) + 1;
        return (
          <g key={r}>
            {Array.from({ length: n }).map((_, k) => {
              const x0 = off + k * len;
              const t = (r * 5 + k * 3) % 3;
              const fill = t === 0 ? floor : t === 1 ? shade(floor, 0.09) : tint(floor, 0.1);
              const gy = y0 + (y1 - y0) * (0.35 + 0.3 * ((k + r) % 2));
              return (
                <g key={k}>
                  <rect x={x0} y={y0} width={len} height={y1 - y0} fill={fill} />
                  <path d={`M${x0 + len * 0.12} ${gy} q${len * 0.3} 1.4 ${len * 0.62} -0.4`} stroke={`url(#${id}-grain)`} strokeWidth={0.7 + r * 0.12} fill="none" />
                  <path d={`M${x0 + len * 0.4} ${gy + (y1 - y0) * 0.28} q${len * 0.2} -1 ${len * 0.48} 0.6`} stroke={`url(#${id}-grain)`} strokeWidth={0.6 + r * 0.1} fill="none" />
                  <rect x={x0} y={y0} width="1.6" height={y1 - y0} fill={shade(floor, 0.4)} opacity="0.5" />
                </g>
              );
            })}
            <rect y={y0} width="600" height="1.2" fill={shade(floor, 0.45)} opacity="0.55" />
          </g>
        );
      })}
      <rect y="300" width="600" height="100" fill={`url(#${id}-floor)`} />
      <ellipse cx={lx - 60} cy="352" rx="190" ry="34" fill={night ? "#c9d4ee" : "#fff4d6"} opacity={night ? 0.06 : 0.14} />
      {/* sombra de contacto pared-suelo */}
      <rect y="300" width="600" height="6" fill="#3a2414" opacity="0.18" />
      <rect y="300" width="600" height="14" fill="#3a2414" opacity="0.07" />
    </>
  );
}

function Outdoor({ sky, grass, path }: { sky: string; grass: string; path?: [number, number] }) {
  const id = useGid("out");
  const far = mix(grass, sky, 0.42);
  const mid = mix(grass, "#c9b57a", 0.25);
  const front = shade(grass, 0.06);
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky} />
          <stop offset="0.6" stopColor={tint(sky, 0.35)} />
          <stop offset="0.8" stopColor="#efe6cd" />
        </linearGradient>
        <linearGradient id={`${id}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint(front, 0.12)} />
          <stop offset="1" stopColor={shade(front, 0.1)} />
        </linearGradient>
      </defs>
      <rect width="600" height="400" fill={`url(#${id}-sky)`} />
      {/* colinas lejanas */}
      <path d="M0 238 C80 214 150 222 230 232 C320 244 380 206 470 214 C530 220 570 230 600 226 V320 H0 Z" fill={far} />
      <g fill={shade(far, 0.16)} opacity="0.8">
        <circle cx="180" cy="228" r="7" />
        <circle cx="191" cy="226" r="9" />
        <circle cx="430" cy="214" r="6" />
        <circle cx="440" cy="212" r="8" />
        <circle cx="451" cy="215" r="6" />
      </g>
      {/* colinas cercanas */}
      <path d="M0 270 C110 248 210 262 300 270 C400 280 480 252 600 258 V400 H0 Z" fill={mid} />
      <path d="M0 270 C110 248 210 262 300 270 C400 280 480 252 600 258" stroke={tint(mid, 0.3)} strokeWidth="3" fill="none" opacity="0.6" />
      {/* prado delantero */}
      <path d="M0 300 C140 290 260 296 360 300 C460 304 540 292 600 296 V400 H0 Z" fill={`url(#${id}-grass)`} />
      {path && (
        <g>
          <path
            d={`M${path[0] - 120} 400 C${path[0] - 60} 360 ${path[0] - 30} 340 ${path[0] + 10} ${path[1] + 10} C${path[0] + 40} ${path[1] - 4} ${path[0] + 70} ${path[1] - 6} ${path[0] + 90} ${path[1] - 8} L${path[0] + 110} ${path[1] - 6} C${path[0] + 70} ${path[1] + 6} ${path[0] + 60} 350 ${path[0] + 130} 400 Z`}
            fill="#dcc79c"
          />
          <path
            d={`M${path[0] - 120} 400 C${path[0] - 60} 360 ${path[0] - 30} 340 ${path[0] + 10} ${path[1] + 10} C${path[0] + 40} ${path[1] - 4} ${path[0] + 70} ${path[1] - 6} ${path[0] + 90} ${path[1] - 8}`}
            stroke="#b9a175"
            strokeWidth="2"
            fill="none"
            opacity="0.6"
          />
        </g>
      )}
      {/* matas de hierba */}
      <g stroke={shade(grass, 0.28)} strokeWidth="1.4" strokeLinecap="round" opacity="0.55" fill="none">
        {[24, 96, 150, 268, 330, 452, 520, 580, 60, 210, 410, 548].map((x, i) => {
          const y = 318 + ((i * 29) % 74);
          return <path key={i} d={`M${x} ${y} l-3 -9 M${x + 3} ${y} l0 -11 M${x + 6} ${y} l3 -8`} />;
        })}
      </g>
      <g stroke={tint(grass, 0.35)} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" fill="none">
        {[44, 120, 236, 300, 380, 470, 560].map((x, i) => {
          const y = 330 + ((i * 41) % 62);
          return <path key={i} d={`M${x} ${y} l-2 -7 M${x + 3} ${y} l2 -8`} />;
        })}
      </g>
    </>
  );
}

/** Tinte nocturno sobre el fondo (antes de las figuras). */
function NightTint() {
  return <rect width="600" height="400" fill="#3a4a7c" opacity="0.32" style={{ mixBlendMode: "multiply" }} />;
}

/** Tinte frío suave sobre lo que queda lejos de la lámpara (incluida la figura), para que no parezca recortada. */
function NightShade() {
  const id = useGid("nsh");
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.25" stopColor="#5a6a9c" stopOpacity="0" />
          <stop offset="1" stopColor="#5a6a9c" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect width="600" height="400" fill={`url(#${id})`} style={{ mixBlendMode: "multiply" }} />
    </>
  );
}

/** Charco de luz cálida de una lámpara sobre pared, suelo y muebles. */
function LampGlow({ x, y }: { x: number; y: number }) {
  const id = useGid("glow");
  return (
    <>
      <defs>
        <radialGradient id={id} cx={x} cy={y} r="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f7c37a" stopOpacity="0.62" />
          <stop offset="0.35" stopColor="#e9a866" stopOpacity="0.3" />
          <stop offset="1" stopColor="#e9a866" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="400" fill={`url(#${id})`} style={{ mixBlendMode: "soft-light" }} />
      <rect width="600" height="400" fill={`url(#${id})`} opacity="0.45" />
    </>
  );
}

/* ---------- Atrezo de interior ---------- */

function Window({
  x,
  y,
  mode,
  w = 170,
  h = 150,
  curtain = C.rose,
  beam = 0,
  birds = false,
}: {
  x: number;
  y: number;
  mode: "sun" | "night";
  w?: number;
  h?: number;
  curtain?: string;
  /** Desplazamiento horizontal del haz de luz que cae hacia el suelo (0 = sin haz). */
  beam?: number;
  birds?: boolean;
}) {
  const id = useGid("win");
  const night = mode === "night";
  const trim = night ? "#c9c4bd" : "#f2e7cf";
  const trimD = shade(trim, 0.22);
  const cD = shade(curtain, 0.22);
  const cL = tint(curtain, 0.25);
  const drop = 300 - y - h;
  const curtainPath = (side: -1 | 1) => {
    const x0 = side < 0 ? -12 : w + 12;
    const o = side * 46;
    return `M${x0} -20 L${x0 + o} -20 C${x0 + o * 1.05} ${h * 0.4} ${x0 + o * 0.5} ${h * 0.62} ${x0 + o * 0.42} ${h * 0.68} C${x0 + o * 0.6} ${h * 0.82} ${x0 + o * 1.1} ${h + 10} ${x0 + o * 1.1} ${h + 36} L${x0 + side * 4} ${h + 36} C${x0 + side * 10} ${h * 0.86} ${x0 + side * 22} ${h * 0.72} ${x0 + side * 18} ${h * 0.66} C${x0 + side * 4} ${h * 0.4} ${x0} ${h * 0.2} ${x0} -20 Z`;
  };
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "#1f2947" : "#9fb8c2"} />
          <stop offset="1" stopColor={night ? "#46557a" : "#ede3c8"} />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "#c4d0f0" : "#fff3d2"} stopOpacity={night ? 0.22 : 0.42} />
          <stop offset="1" stopColor={night ? "#c4d0f0" : "#fff3d2"} stopOpacity="0" />
        </linearGradient>
      </defs>
      {beam !== 0 && <path d={`M0 ${h + 14} L${w} ${h + 14} L${w + beam + w * 0.25} ${h + drop + 70} L${beam - w * 0.1} ${h + drop + 70} Z`} fill={`url(#${id}-beam)`} />}
      {/* marco con sombra sobre la pared */}
      <rect x="-8" y="-6" width={w + 22} height={h + 22} rx="5" fill="#3a2414" opacity="0.12" />
      <rect x="-12" y="-12" width={w + 24} height={h + 24} rx="5" fill={trim} />
      <rect x={w + 6} y="-12" width="6" height={h + 24} fill={trimD} opacity="0.55" />
      {/* cristal y paisaje */}
      <rect width={w} height={h} fill={`url(#${id}-sky)`} />
      {night ? (
        <g>
          <circle cx={w * 0.7} cy={h * 0.32} r={h * 0.2} fill="#fff1c4" opacity="0.18" />
          <circle cx={w * 0.7} cy={h * 0.32} r={h * 0.13} fill="#fbeec4" />
          <circle cx={w * 0.76} cy={h * 0.27} r={h * 0.11} fill="#26304f" />
          <Star x={w * 0.22} y={h * 0.25} />
          <Star x={w * 0.4} y={h * 0.55} s={0.6} />
          <Star x={w * 0.88} y={h * 0.62} s={0.5} />
          <path d={`M0 ${h * 0.86} C${w * 0.3} ${h * 0.76} ${w * 0.6} ${h * 0.82} ${w} ${h * 0.74} V${h} H0 Z`} fill="#26304a" />
        </g>
      ) : (
        <g>
          <circle cx={w * 0.74} cy={h * 0.3} r={h * 0.2} fill="#fff1c9" opacity="0.5" />
          <circle cx={w * 0.74} cy={h * 0.3} r={h * 0.11} fill="#f7dc93" />
          <Cloud x={w * 0.3} y={h * 0.36} s={w / 420} />
          <path d={`M0 ${h * 0.8} C${w * 0.25} ${h * 0.7} ${w * 0.55} ${h * 0.78} ${w} ${h * 0.68} V${h} H0 Z`} fill="#b6bf8d" />
          <path d={`M0 ${h * 0.9} C${w * 0.35} ${h * 0.82} ${w * 0.7} ${h * 0.9} ${w} ${h * 0.84} V${h} H0 Z`} fill="#98a873" />
          <circle cx={w * 0.18} cy={h * 0.78} r={h * 0.07} fill="#7f9563" />
          <circle cx={w * 0.24} cy={h * 0.76} r={h * 0.08} fill="#7f9563" />
          {birds && (
            <g>
              <Bird x={w * 0.18} y={h * 0.2} s={0.9} />
              <Bird x={w * 0.42} y={h * 0.14} s={0.7} />
            </g>
          )}
        </g>
      )}
      {/* reflejo y hondo del marco */}
      <path d={`M${w * 0.1} 0 L${w * 0.28} 0 L${w * 0.04} ${h * 0.6} L0 ${h * 0.6} L0 ${h * 0.25} Z`} fill="#fff" opacity="0.12" />
      <rect width={w} height="7" fill="#3a2414" opacity="0.18" />
      <rect width="6" height={h} fill="#3a2414" opacity="0.12" />
      {/* parteluz */}
      <rect x={w / 2 - 4} width="8" height={h} fill={trim} />
      <rect x={w / 2 + 2} width="2" height={h} fill={trimD} opacity="0.6" />
      <rect y={h / 2 - 4} width={w} height="8" fill={trim} />
      <rect y={h / 2 + 2} width={w} height="2" fill={trimD} opacity="0.6" />
      {/* alféizar */}
      <rect x="-22" y={h + 8} width={w + 44} height="11" rx="3" fill={trim} />
      <rect x="-22" y={h + 8} width={w + 44} height="3" rx="1.5" fill={tint(trim, 0.6)} />
      <rect x="-18" y={h + 19} width={w + 36} height="6" fill="#3a2414" opacity="0.16" />
      {/* cortinas y barra */}
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          <path d={curtainPath(side)} fill={curtain} />
          <path
            d={`M${side < 0 ? -26 : w + 26} -18 C${side < 0 ? -30 : w + 30} ${h * 0.4} ${side < 0 ? -30 : w + 30} ${h * 0.62} ${side < 0 ? -34 : w + 34} ${h * 0.68}`}
            stroke={cD}
            strokeWidth="5"
            fill="none"
            opacity="0.7"
          />
          <path
            d={`M${side < 0 ? -42 : w + 42} -18 C${side < 0 ? -46 : w + 46} ${h * 0.3} ${side < 0 ? -40 : w + 40} ${h * 0.55} ${side < 0 ? -36 : w + 36} ${h * 0.66}`}
            stroke={cL}
            strokeWidth="4"
            fill="none"
            opacity="0.6"
          />
          <ellipse cx={side < 0 ? -30 : w + 30} cy={h * 0.68} rx="14" ry="5" fill={cD} />
        </g>
      ))}
      <rect x="-70" y="-26" width={w + 140} height="6" rx="3" fill={shade(C.wood, 0.25)} />
      <circle cx="-70" cy="-23" r="6" fill={shade(C.wood, 0.3)} />
      <circle cx={w + 70} cy="-23" r="6" fill={shade(C.wood, 0.3)} />
    </g>
  );
}

function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -10 L3 -3 L10 -2 L5 3 L6 10 L0 6 L-6 10 L-5 3 L-10 -2 L-3 -3 Z"
      fill="#f3dc96"
    />
  );
}

/** Cuadro enmarcado con un paisaje pequeño. (x, y) = esquina superior izquierda del marco. */
function FrameArt({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const fr = "#a8744a";
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M${w / 2} -16 L4 4 M${w / 2} -16 L${w - 4} 4`} stroke={shade(fr, 0.3)} strokeWidth="1.2" fill="none" />
      <rect x="5" y="6" width={w} height={h} fill="#3a2414" opacity="0.13" />
      <rect width={w} height={h} rx="2" fill={fr} />
      <rect x={w - 5} width="5" height={h} fill={shade(fr, 0.25)} />
      <rect y={h - 5} width={w} height="5" fill={shade(fr, 0.25)} />
      <rect width={w} height="3" fill={tint(fr, 0.35)} />
      <rect x="7" y="7" width={w - 14} height={h - 14} fill="#f3ead6" />
      <rect x="12" y="12" width={w - 24} height={h - 24} fill="#c9d3cc" />
      <circle cx={w * 0.66} cy={h * 0.38} r={Math.min(w, h) * 0.09} fill="#efd08c" />
      <path d={`M12 ${h * 0.7} C${w * 0.35} ${h * 0.5} ${w * 0.55} ${h * 0.62} ${w - 12} ${h * 0.55} V${h - 12} H12 Z`} fill="#a7b37f" />
      <path d={`M12 ${h * 0.8} C${w * 0.4} ${h * 0.68} ${w * 0.7} ${h * 0.78} ${w - 12} ${h * 0.72} V${h - 12} H12 Z`} fill="#8c9b67" />
    </g>
  );
}

/** Balda de pared con libros (o tarros si `kitchen`). (x, y) = extremo izquierdo de la balda. */
function Shelf({ x, y, w, kitchen = false }: { x: number; y: number; w: number; kitchen?: boolean }) {
  const books = [
    { w: 12, h: 44, c: C.terra },
    { w: 9, h: 38, c: C.mustard },
    { w: 14, h: 48, c: C.dusty },
    { w: 10, h: 40, c: C.sage },
    { w: 12, h: 34, c: C.plum },
  ];
  let bx = 10;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="4" y="6" width={w} height="10" fill="#3a2414" opacity="0.12" />
      {kitchen ? (
        <g>
          {[
            { x: 12, w: 26, h: 34, c: "#e9dcc2", lid: C.terra },
            { x: 46, w: 22, h: 26, c: "#e9dcc2", lid: C.sage },
            { x: 76, w: 28, h: 40, c: "#dccfb2", lid: C.mustard },
          ].map((j, i) => (
            <g key={i}>
              <rect x={j.x} y={-j.h} width={j.w} height={j.h} rx="5" fill={j.c} />
              <rect x={j.x + j.w - 6} y={-j.h + 4} width="4" height={j.h - 8} rx="2" fill="#3a2414" opacity="0.1" />
              <rect x={j.x + 4} y={-j.h + 4} width="3" height={j.h - 10} rx="1.5" fill="#fff" opacity="0.5" />
              <rect x={j.x - 2} y={-j.h - 6} width={j.w + 4} height="8" rx="3" fill={j.lid} />
            </g>
          ))}
          <path d={`M${w - 52} -26 h30 v14 a15 15 0 0 1 -30 0 z`} fill={C.dusty} />
          <path d={`M${w - 22} -22 a8 7 0 1 1 0 12`} stroke={shade(C.dusty, 0.2)} strokeWidth="3" fill="none" />
          <rect x={w - 50} y="-26" width="5" height="22" fill="#fff" opacity="0.3" />
        </g>
      ) : (
        <g>
          {books.map((b, i) => {
            const el = (
              <g key={i}>
                <rect x={bx} y={-b.h} width={b.w} height={b.h} rx="1.5" fill={b.c} />
                <rect x={bx + b.w - 3} y={-b.h} width="3" height={b.h} fill={shade(b.c, 0.25)} />
                <rect x={bx} y={-b.h + 7} width={b.w} height="2.5" fill={tint(b.c, 0.4)} />
              </g>
            );
            bx += b.w + 1;
            return el;
          })}
          <g transform={`translate(${bx + 10} 0) rotate(18)`}>
            <rect x="0" y="-36" width="11" height="36" rx="1.5" fill={C.rose} />
            <rect x="8" y="-36" width="3" height="36" fill={shade(C.rose, 0.25)} />
          </g>
          <Plant x={w - 22} ground={0} s={0.38} />
        </g>
      )}
      <rect x="0" y="0" width={w} height="8" rx="2" fill={C.wood} />
      <rect x="0" y="0" width={w} height="2.5" fill={tint(C.wood, 0.35)} />
      <path d={`M14 8 v12 l10 -12 M${w - 14} 8 v12 l-10 -12`} stroke={shade(C.wood, 0.35)} strokeWidth="3" fill="none" />
    </g>
  );
}

/** Planta en maceta de barro. (x, ground) = centro de la base. */
function Plant({ x, ground, s = 1 }: { x: number; ground: number; s?: number }) {
  const leaf = "#7e9662";
  const leafD = "#5f7649";
  const leafL = "#a3b47f";
  const leaves: [number, number, number, string][] = [
    [-34, -78, -38, leafD],
    [30, -82, 34, leafD],
    [-18, -100, -14, leaf],
    [16, -104, 12, leaf],
    [-40, -58, -62, leaf],
    [40, -60, 60, leaf],
    [0, -112, 0, leafL],
    [-22, -74, -30, leafL],
  ];
  return (
    <g transform={`translate(${x} ${ground}) scale(${s})`}>
      {ground > 0 && <FloorShadow cx={0} cy={0} rx={32} ry={5} />}
      {leaves.map(([lx, ly, r, c], i) => (
        <g key={i} transform={`translate(${lx * 0.5} ${ly * 0.55}) rotate(${r})`}>
          <path d="M0 22 C-14 10 -14 -14 0 -26 C14 -14 14 10 0 22 Z" fill={c} />
          <path d="M0 20 V-22" stroke={shade(c, 0.25)} strokeWidth="1.3" />
        </g>
      ))}
      <path d="M-24 -44 L24 -44 L18 0 L-18 0 Z" fill={C.terra} />
      <path d="M8 -44 L24 -44 L18 0 L6 0 Z" fill={shade(C.terra, 0.2)} />
      <rect x="-28" y="-50" width="56" height="12" rx="3" fill={tint(C.terra, 0.12)} />
      <rect x="-28" y="-50" width="56" height="3" rx="1.5" fill={tint(C.terra, 0.4)} />
      <rect x="-24" y="-38" width="48" height="4" fill="#3a2414" opacity="0.18" />
    </g>
  );
}

/** Lámpara de pie (o de mesa con `table`). (x, ground) = centro de la base. */
function Lamp({ x, ground, table = false, on = false }: { x: number; ground: number; table?: boolean; on?: boolean }) {
  const id = useGid("lamp");
  const pole = table ? 36 : 150;
  const shadeC = on ? "#f6d79a" : "#ead8b4";
  return (
    <g transform={`translate(${x} ${ground})`}>
      <defs>
        <radialGradient id={id} cx="0" cy={-pole - 6} r="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe2a6" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffe2a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {on && <circle cx="0" cy={-pole - 6} r="120" fill={`url(#${id})`} />}
      {!table && <FloorShadow cx={0} cy={0} rx={26} ry={5} />}
      <rect x="-2.5" y={-pole} width="5" height={pole} fill={shade(C.wood, 0.4)} />
      {table ? (
        <path d="M-14 0 C-14 -24 -8 -30 0 -30 C8 -30 14 -24 14 0 Z" fill={C.dusty} />
      ) : (
        <ellipse cx="0" cy="-2" rx="20" ry="5" fill={shade(C.wood, 0.4)} />
      )}
      <path d={`M-20 ${-pole - 32} L20 ${-pole - 32} L32 ${-pole + 4} L-32 ${-pole + 4} Z`} fill={shadeC} />
      <path d={`M8 ${-pole - 32} L20 ${-pole - 32} L32 ${-pole + 4} L14 ${-pole + 4} Z`} fill={shade(shadeC, 0.14)} />
      <rect x="-32" y={-pole + 1} width="64" height="4" fill={shade(shadeC, 0.2)} />
      {on && <ellipse cx="0" cy={-pole + 6} rx="26" ry="4" fill="#fff6d8" />}
    </g>
  );
}

/** Mesilla de noche. (x, ground) = esquina inferior izquierda. */
function Nightstand({ x, ground }: { x: number; ground: number }) {
  const w = 70;
  const top = ground - 54;
  return (
    <g transform={`translate(${x} 0)`}>
      <FloorShadow cx={w / 2} cy={ground} rx={40} ry={6} />
      <rect x="4" y={top + 8} width={w - 8} height={ground - top - 14} fill={C.wood} />
      <rect x={w - 14} y={top + 8} width="10" height={ground - top - 14} fill={shade(C.wood, 0.2)} />
      <rect x="10" y={top + 16} width={w - 26} height="16" rx="2" fill={tint(C.wood, 0.12)} />
      <circle cx={w / 2 - 4} cy={top + 24} r="3" fill={shade(C.wood, 0.45)} />
      <rect x="0" y={top} width={w} height="9" rx="2" fill={tint(C.wood, 0.18)} />
      <rect x="8" y={ground - 6} width="6" height="6" fill={shade(C.wood, 0.4)} />
      <rect x={w - 14} y={ground - 6} width="6" height="6" fill={shade(C.wood, 0.4)} />
    </g>
  );
}

/** Alfombra ovalada bajo las figuras. */
function Rug({ cx, cy, rx, ry, color }: { cx: number; cy: number; rx: number; ry: number; color: string }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 3} rx={rx} ry={ry} fill="#3a2414" opacity="0.12" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} />
      <ellipse cx={cx} cy={cy} rx={rx - 12} ry={ry - 5} fill={tint(color, 0.5)} />
      <ellipse cx={cx} cy={cy} rx={rx - 20} ry={ry - 8} fill={tint(color, 0.15)} />
      <ellipse cx={cx} cy={cy} rx={rx * 0.42} ry={ry * 0.38} fill={tint(color, 0.45)} />
      <ellipse cx={cx} cy={cy - ry * 0.2} rx={rx * 0.6} ry={ry * 0.3} fill="#fff" opacity="0.08" />
    </g>
  );
}

/** Cojín. (x, y) = centro. */
function Cushion({ x, y, color, r = 0, s = 1 }: { x: number; y: number; color: string; r?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M-24 -20 Q0 -26 24 -20 Q28 0 24 20 Q0 26 -24 20 Q-28 0 -24 -20 Z" fill={color} />
      <path d="M4 -22 Q26 -20 24 -2 Q28 10 24 20 Q12 24 4 23 Q16 0 4 -22 Z" fill={shade(color, 0.16)} />
      <path d="M-18 -16 Q-6 -20 6 -18" stroke={tint(color, 0.45)} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle r="2.6" fill={shade(color, 0.3)} />
    </g>
  );
}

function Bed({ x, ground, duvet, night = false }: { x: number; ground: number; duvet: string; night?: boolean }) {
  const w = 262;
  const wood = night ? shade(C.wood, 0.1) : C.wood;
  const sheet = "#f1e7d4";
  const dD = shade(duvet, 0.22);
  const dL = tint(duvet, 0.28);
  return (
    <g transform={`translate(${x} ${ground})`}>
      <FloorShadow cx={w / 2} cy={0} rx={w / 2 + 6} ry={8} o={0.26} />
      {/* hueco bajo la cama */}
      <rect x="20" y="-30" width={w - 40} height="26" fill="#3a2414" opacity="0.32" />
      {/* cabecero */}
      <path d="M0 0 V-128 C0 -142 8 -150 18 -150 C28 -150 34 -142 34 -128 V0 Z" fill={wood} />
      <path d="M22 -146 C30 -142 34 -136 34 -128 V0 H24 Z" fill={shade(wood, 0.2)} />
      <rect x="7" y="-120" width="18" height="70" rx="5" fill={tint(wood, 0.15)} />
      <path d="M5 -136 C6 -144 12 -147 18 -147" stroke={tint(wood, 0.45)} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* somier y patas */}
      <rect x="18" y="-52" width={w - 30} height="22" rx="4" fill={wood} />
      <rect x="18" y="-36" width={w - 30} height="6" fill={shade(wood, 0.2)} />
      <rect x="40" y="-30" width="8" height="30" fill={shade(wood, 0.3)} />
      <rect x={w - 50} y="-30" width="8" height="30" fill={shade(wood, 0.3)} />
      {/* colchón y sábana */}
      <rect x="30" y="-80" width={w - 48} height="30" rx="8" fill={sheet} />
      <rect x="30" y="-58" width={w - 48} height="8" rx="4" fill={shade(sheet, 0.1)} />
      {/* almohada */}
      <path d="M40 -84 C38 -104 50 -108 72 -106 C96 -104 106 -102 104 -88 C104 -76 96 -74 72 -74 C48 -74 40 -74 40 -84 Z" fill={tint(sheet, 0.3)} />
      <path d="M40 -84 C42 -76 50 -74 72 -74 C96 -74 104 -76 104 -88 C98 -82 84 -80 70 -81 C56 -82 46 -82 40 -84 Z" fill={shade(sheet, 0.12)} />
      <path d="M60 -98 C66 -92 74 -92 82 -96" stroke={shade(sheet, 0.18)} strokeWidth="1.5" fill="none" />
      {/* edredón con pliegue */}
      <path
        d={`M108 -92 C150 -96 200 -94 ${w - 20} -88 C${w - 8} -86 ${w - 6} -70 ${w - 8} -44 C${w - 30} -38 ${w - 60} -42 ${w - 90} -38 C${w - 130} -34 150 -40 112 -36 C104 -56 104 -76 108 -92 Z`}
        fill={duvet}
      />
      <path d={`M112 -36 C150 -40 ${w - 130} -34 ${w - 90} -38 C${w - 60} -42 ${w - 30} -38 ${w - 8} -44 L${w - 8} -56 C${w - 40} -52 ${w - 100} -56 112 -50 Z`} fill={dD} />
      <path d={`M140 -84 C180 -88 220 -86 ${w - 30} -82`} stroke={dL} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d={`M170 -70 C190 -66 210 -66 230 -70`} stroke={dD} strokeWidth="2" fill="none" opacity="0.6" />
      {[130, 160, 190, 220, 145, 175, 205, 235].map((dx, i) => (
        <circle key={i} cx={dx} cy={i < 4 ? -76 : -60} r="2.2" fill={dL} opacity="0.7" />
      ))}
      {/* vuelta de la sábana sobre el edredón */}
      <path d="M102 -94 C110 -96 122 -96 130 -94 C126 -74 128 -54 132 -40 C122 -38 112 -38 106 -38 C102 -56 100 -76 102 -94 Z" fill={sheet} />
      <path d="M124 -94 C128 -96 130 -95 130 -94 C126 -74 128 -54 132 -40 L124 -40 C121 -58 120 -78 124 -94 Z" fill={shade(sheet, 0.12)} />
      {/* piecero */}
      <rect x={w - 18} y="-86" width="20" height="86" rx="6" fill={wood} />
      <rect x={w - 6} y="-86" width="8" height="86" rx="3" fill={shade(wood, 0.22)} />
      <rect x={w - 16} y="-84" width="3" height="60" fill={tint(wood, 0.4)} />
    </g>
  );
}

/** Mesa con grosor y patas en perspectiva (opcional mantel). (x, top) = centro y canto superior del tablero. */
function Table({ x, top, w, cloth, band }: { x: number; top: number; w: number; cloth?: string; band?: string }) {
  const d = 16;
  const x0 = -w / 2;
  const x1 = w / 2;
  const legH = 96;
  const wood = C.wood;
  return (
    <g transform={`translate(${x} ${top})`}>
      <FloorShadow cx={0} cy={legH + d} rx={w / 2 + 4} ry={9} o={0.24} />
      {/* patas traseras */}
      <rect x={x0 + 34} y={d + 8} width="11" height={legH - 12} fill={shade(wood, 0.38)} />
      <rect x={x1 - 45} y={d + 8} width="11" height={legH - 12} fill={shade(wood, 0.38)} />
      {/* patas delanteras */}
      <rect x={x0 + 10} y={d} width="15" height={legH} fill={wood} />
      <rect x={x0 + 20} y={d} width="5" height={legH} fill={shade(wood, 0.2)} />
      <rect x={x1 - 25} y={d} width="15" height={legH} fill={wood} />
      <rect x={x1 - 15} y={d} width="5" height={legH} fill={shade(wood, 0.2)} />
      {/* tablero */}
      <path d={`M${x0 + 14} 0 L${x1 - 14} 0 L${x1} ${d} L${x0} ${d} Z`} fill={tint(wood, 0.16)} />
      <rect x={x0} y={d} width={w} height="12" fill={shade(wood, 0.1)} />
      <rect x={x0} y={d + 9} width={w} height="3" fill={shade(wood, 0.3)} />
      {cloth && (
        <g>
          <path
            d={`M${x0 + 10} -2 L${x1 - 10} -2 L${x1 + 8} ${d} L${x1 + 10} ${d + 48} ${Array.from({ length: 9 })
              .map((_, i) => {
                const xa = x1 + 10 - ((i + 1) * (w + 20)) / 9;
                return `Q${xa + (w + 20) / 18} ${d + 58} ${xa} ${d + 48}`;
              })
              .join(" ")} L${x0 - 8} ${d} Z`}
            fill={cloth}
          />
          <path d={`M${x0 + 10} -2 L${x1 - 10} -2 L${x1 + 8} ${d} L${x0 - 8} ${d} Z`} fill={tint(cloth, 0.4)} />
          <rect x={x0 - 9} y={d} width={w + 18} height="4" fill={shade(cloth, 0.12)} />
          {band && <rect x={x0 - 10} y={d + 34} width={w + 20} height="5" fill={band} opacity="0.85" />}
          {band && <rect x={x0 - 10} y={d + 41} width={w + 20} height="2" fill={band} opacity="0.6" />}
          {Array.from({ length: 6 }).map((_, i) => (
            <path key={i} d={`M${x0 + 20 + (i * (w - 30)) / 5} ${d + 4} q2 22 -2 44`} stroke={shade(cloth, 0.14)} strokeWidth="2" fill="none" opacity="0.6" />
          ))}
        </g>
      )}
    </g>
  );
}

/** Plato con tortitas y taza. (x, y) = centro del plato. */
function Breakfast({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="2" cy="3" rx="42" ry="10" fill="#3a2414" opacity="0.15" />
      <ellipse rx="42" ry="10" fill="#f6efe1" />
      <ellipse rx="32" ry="7" fill="#e6dcc8" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${-6 - i * 7})`}>
          <ellipse rx="27" ry="7" fill="#c98a4b" />
          <ellipse cy="-2" rx="27" ry="6" fill="#e3ad6a" />
        </g>
      ))}
      <path d="M-20 -26 C-10 -30 10 -30 20 -26 C18 -18 14 -16 12 -10 C10 -16 4 -18 0 -14 C-4 -20 -14 -18 -20 -26 Z" fill="#a6602e" opacity="0.85" />
      <rect x="-7" y="-34" width="14" height="8" rx="2" fill="#f7e4a6" />
      <g transform="translate(72 0)">
        <ellipse rx="20" ry="5" fill="#f6efe1" />
        <path d="M-13 -24 H13 V-6 C13 2 -13 2 -13 -6 Z" fill={C.dusty} />
        <path d="M5 -24 H13 V-6 C13 -2 9 0 5 0 Z" fill={shade(C.dusty, 0.2)} />
        <path d="M13 -18 a7 6 0 1 1 0 10" stroke={shade(C.dusty, 0.15)} strokeWidth="3" fill="none" />
        <ellipse cy="-24" rx="13" ry="3" fill="#8a5a3a" />
      </g>
    </g>
  );
}

/** Silla de madera en tres cuartos. (x, ground) = centro de las patas delanteras. */
function Chair({ x, ground }: { x: number; ground: number }) {
  const wood = C.wood;
  const seat = ground - 60;
  return (
    <g transform={`translate(${x} 0)`}>
      <FloorShadow cx={4} cy={ground} rx={38} ry={6} />
      {/* respaldo */}
      <rect x="-26" y={seat - 82} width="9" height="86" fill={shade(wood, 0.25)} />
      <rect x="22" y={seat - 82} width="9" height="86" fill={shade(wood, 0.25)} />
      <rect x="-28" y={seat - 86} width="61" height="14" rx="4" fill={wood} />
      <rect x="-28" y={seat - 86} width="61" height="4" rx="2" fill={tint(wood, 0.3)} />
      {[-8, 4, 16].map((sx) => (
        <rect key={sx} x={sx - 2} y={seat - 72} width="5" height="72" fill={shade(wood, 0.15)} />
      ))}
      {/* patas traseras */}
      <rect x="-22" y={seat + 8} width="7" height="48" fill={shade(wood, 0.4)} />
      <rect x="22" y={seat + 8} width="7" height="48" fill={shade(wood, 0.4)} />
      {/* asiento */}
      <path d={`M-30 ${seat} L32 ${seat} L40 ${seat + 10} L-36 ${seat + 10} Z`} fill={tint(wood, 0.18)} />
      <rect x="-36" y={seat + 10} width="76" height="8" fill={shade(wood, 0.12)} />
      {/* patas delanteras */}
      <rect x="-32" y={seat + 18} width="9" height={ground - seat - 18} fill={wood} />
      <rect x="29" y={seat + 18} width="9" height={ground - seat - 18} fill={wood} />
      <rect x="35" y={seat + 18} width="3" height={ground - seat - 18} fill={shade(wood, 0.25)} />
    </g>
  );
}

/** Sillón con cojín. (x, ground) = esquina inferior izquierda. */
function Armchair({ x, ground, color }: { x: number; ground: number; color: string }) {
  const D = shade(color, 0.2);
  const L = tint(color, 0.25);
  const w = 196;
  return (
    <g transform={`translate(${x} ${ground})`}>
      <FloorShadow cx={w / 2} cy={0} rx={w / 2 + 6} ry={8} o={0.26} />
      {/* respaldo */}
      <path d={`M18 -70 C14 -150 22 -168 ${w / 2} -170 C${w - 22} -168 ${w - 14} -150 ${w - 18} -70 Z`} fill={color} />
      <path d={`M${w / 2 + 30} -168 C${w - 22} -166 ${w - 14} -150 ${w - 18} -70 L${w / 2 + 40} -70 C${w / 2 + 50} -110 ${w / 2 + 46} -150 ${w / 2 + 30} -168 Z`} fill={D} opacity="0.6" />
      <path d={`M34 -150 C46 -162 70 -164 96 -164`} stroke={L} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* cojín apoyado */}
      <Cushion x={w / 2 + 34} y={-104} color={C.terra} r={10} s={0.95} />
      {/* asiento */}
      <rect x="22" y="-78" width={w - 44} height="30" rx="10" fill={L} />
      <rect x="22" y="-58" width={w - 44} height="10" rx="5" fill={color} />
      {/* base y patas */}
      <rect x="10" y="-50" width={w - 20} height="38" rx="8" fill={D} />
      <rect x="20" y="-12" width="8" height="12" fill={shade(C.wood, 0.35)} />
      <rect x={w - 28} y="-12" width="8" height="12" fill={shade(C.wood, 0.35)} />
      {/* brazos */}
      {[0, w - 40].map((ax, i) => (
        <g key={i}>
          <rect x={ax} y="-108" width="40" height="96" rx="16" fill={color} />
          <rect x={ax + (i ? 26 : 0)} y="-104" width="14" height="92" rx="7" fill={D} opacity="0.55" />
          <ellipse cx={ax + 20} cy="-104" rx="20" ry="9" fill={L} />
        </g>
      ))}
    </g>
  );
}

/** Sofá de respaldo bajo con cojines. (x, ground) = esquina inferior izquierda. */
function Sofa({ x, ground, w, color }: { x: number; ground: number; w: number; color: string }) {
  const D = shade(color, 0.2);
  const L = tint(color, 0.25);
  return (
    <g transform={`translate(${x} ${ground})`}>
      <FloorShadow cx={w / 2} cy={0} rx={w / 2 + 8} ry={8} o={0.26} />
      {/* respaldo */}
      <rect x="10" y="-120" width={w - 20} height="72" rx="16" fill={color} />
      <rect x="10" y="-120" width={w - 20} height="10" rx="5" fill={L} />
      <rect x={w / 2 - 2} y="-112" width="4" height="56" fill={D} opacity="0.5" />
      {/* cojines */}
      <Cushion x={48} y={-82} color={C.mustard} r={-12} s={0.85} />
      <Cushion x={w - 50} y={-82} color={C.rose} r={10} s={0.85} />
      {/* asiento */}
      <rect x="22" y="-62" width={w / 2 - 22} height="24" rx="8" fill={L} />
      <rect x={w / 2} y="-62" width={w / 2 - 22} height="24" rx="8" fill={L} />
      <rect x="22" y="-46" width={w - 44} height="8" fill={color} />
      {/* frente */}
      <rect x="8" y="-40" width={w - 16} height="30" rx="8" fill={D} />
      <rect x="20" y="-10" width="8" height="10" fill={shade(C.wood, 0.35)} />
      <rect x={w - 28} y="-10" width="8" height="10" fill={shade(C.wood, 0.35)} />
      {/* brazos */}
      {[0, w - 36].map((ax, i) => (
        <g key={i}>
          <rect x={ax} y="-92" width="36" height="82" rx="14" fill={color} />
          <rect x={ax + (i ? 22 : 0)} y="-88" width="14" height="78" rx="7" fill={D} opacity="0.5" />
          <ellipse cx={ax + 18} cy="-90" rx="18" ry="8" fill={L} />
        </g>
      ))}
    </g>
  );
}

/** Puerta con marco, paneles y pomo (abierta: deja ver el recibidor). (x, y) = esquina superior izquierda del hueco. */
function Door({ x, y, w = 150, h = 240, open = false }: { x: number; y: number; w?: number; h?: number; open?: boolean }) {
  const id = useGid("door");
  const leaf = "#c99766";
  const casing = "#efe2c6";
  const panel = (px: number, py: number, pw: number, ph: number) => (
    <g>
      <rect x={px} y={py} width={pw} height={ph} rx="3" fill={shade(leaf, 0.1)} />
      <rect x={px + 3} y={py + 3} width={pw - 6} height={ph - 6} rx="2" fill={tint(leaf, 0.08)} />
      <rect x={px} y={py} width={pw} height="3" fill={shade(leaf, 0.3)} opacity="0.6" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e5039" />
          <stop offset="1" stopColor="#9c7a58" />
        </linearGradient>
      </defs>
      <rect x="-12" y="-10" width={w + 30} height={h + 10} fill="#3a2414" opacity="0.1" />
      <rect x="-16" y="-16" width={w + 32} height={h + 16} rx="3" fill={casing} />
      <rect x={w + 8} y="-16" width="8" height={h + 16} fill={shade(casing, 0.2)} />
      <rect x="-16" y="-16" width={w + 32} height="4" fill={tint(casing, 0.6)} />
      {open ? (
        <g>
          <rect width={w} height={h} fill={`url(#${id})`} />
          <path d={`M0 ${h} L${w} ${h} L${w - 18} ${h - 30} L18 ${h - 30} Z`} fill="#b48c63" />
          <rect x={w * 0.55} y={h * 0.12} width={w * 0.3} height={h * 0.3} fill="#f2e3b8" opacity="0.35" />
          {/* hoja abierta hacia dentro */}
          <path d={`M0 0 L${w * 0.3} ${h * 0.06} L${w * 0.3} ${h - 22} L0 ${h} Z`} fill={leaf} />
          <path d={`M${w * 0.24} ${h * 0.055} L${w * 0.3} ${h * 0.06} L${w * 0.3} ${h - 22} L${w * 0.24} ${h - 20} Z`} fill={shade(leaf, 0.2)} />
          <path d={`M8 ${h * 0.12} L${w * 0.22} ${h * 0.15} L${w * 0.22} ${h * 0.45} L8 ${h * 0.46} Z`} fill={shade(leaf, 0.1)} />
          <path d={`M8 ${h * 0.54} L${w * 0.22} ${h * 0.54} L${w * 0.22} ${h * 0.86} L8 ${h * 0.9} Z`} fill={shade(leaf, 0.1)} />
          <circle cx={w * 0.26} cy={h * 0.52} r="5" fill="#d9b25a" />
        </g>
      ) : (
        <g>
          <rect width={w} height={h} fill={leaf} />
          {panel(16, 18, w / 2 - 22, h * 0.4)}
          {panel(w / 2 + 6, 18, w / 2 - 22, h * 0.4)}
          {panel(16, h * 0.5, w / 2 - 22, h * 0.42)}
          {panel(w / 2 + 6, h * 0.5, w / 2 - 22, h * 0.42)}
          <rect x={w - 10} width="10" height={h} fill={shade(leaf, 0.18)} />
          <circle cx={w - 22} cy={h * 0.5} r="7" fill="#d9b25a" />
          <circle cx={w - 24} cy={h * 0.5 - 2} r="2.5" fill="#fff3c8" />
        </g>
      )}
      <rect x="-6" y={h} width={w + 12} height="8" rx="3" fill={shade(casing, 0.15)} />
      <ellipse cx={w / 2} cy={h + 24} rx={w * 0.42} ry="9" fill={C.terra} opacity="0.85" />
      <ellipse cx={w / 2} cy={h + 23} rx={w * 0.34} ry="6" fill={tint(C.terra, 0.25)} opacity="0.85" />
    </g>
  );
}

function Gift({ x, y, size, color, open = false, emoji }: { x: number; y: number; size: number; color: string; open?: boolean; emoji?: string }) {
  const ribbon = "#efd28a";
  const ribbonD = shade(ribbon, 0.2);
  const s = size;
  const hgt = s * 0.8;
  const side = s * 0.18;
  const D = shade(color, 0.22);
  const L = tint(color, 0.22);
  const rb = s * 0.14;
  const gid = useGid("gift");
  return (
    <g transform={`translate(${x} ${y})`}>
      {open && (
        <defs>
          <radialGradient id={gid}>
            <stop offset="0" stopColor="#fff6d6" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      <FloorShadow cx={s / 2 + side / 2} cy={hgt} rx={s * 0.62} ry={s * 0.07} o={0.26} />
      {/* caja: frente + lateral */}
      <path d={`M${s} 0 L${s + side} ${-side * 0.6} L${s + side} ${hgt - side * 0.6} L${s} ${hgt} Z`} fill={D} />
      <rect width={s} height={hgt} fill={color} />
      <rect width={s} height={hgt * 0.08} fill="#3a2414" opacity="0.12" />
      <rect x={s / 2 - rb / 2} width={rb} height={hgt} fill={ribbon} />
      <rect x={s / 2 + rb / 2 - 3} width="3" height={hgt} fill={ribbonD} />
      <path d={`M${s} ${hgt * 0.45} L${s + side} ${hgt * 0.45 - side * 0.6} L${s + side} ${hgt * 0.45 - side * 0.6 + rb * 0.8} L${s} ${hgt * 0.45 + rb * 0.8} Z`} fill={ribbonD} />
      <rect y={hgt * 0.45} width={s} height={rb * 0.8} fill={ribbon} opacity="0.95" />
      {open ? (
        <g>
          {/* interior y solapas */}
          <path d={`M0 0 L${s} 0 L${s + side} ${-side * 0.6} L${side} ${-side * 0.6} Z`} fill={shade(color, 0.45)} />
          <g transform={`rotate(-24 0 0)`}>
            <rect x={-s * 0.06} y={-s * 0.2} width={s * 0.56} height={s * 0.2} rx="3" fill={color} />
            <rect x={-s * 0.06} y={-s * 0.2} width={s * 0.56} height={s * 0.05} fill={L} />
            <rect x={s * 0.38} y={-s * 0.2} width={rb * 0.7} height={s * 0.2} fill={ribbon} />
          </g>
          <g transform={`rotate(22 ${s + side} 0)`}>
            <rect x={s * 0.58} y={-s * 0.22} width={s * 0.6} height={s * 0.2} rx="3" fill={D} />
            <rect x={s * 0.58} y={-s * 0.22} width={s * 0.6} height={s * 0.05} fill={color} />
          </g>
          <circle cx={s / 2 + side / 2} cy={-s * 0.22} r={s * 0.5} fill={`url(#${gid})`} />
          <text x={s / 2 + side / 2} y={-s * 0.1} textAnchor="middle" fontSize={s * 0.5}>
            {emoji}
          </text>
        </g>
      ) : (
        <g>
          {/* tapa */}
          <path d={`M${-s * 0.04} ${-s * 0.04} L${s * 1.04} ${-s * 0.04} L${s * 1.04 + side} ${-s * 0.04 - side * 0.6} L${-s * 0.04 + side} ${-s * 0.04 - side * 0.6} Z`} fill={L} />
          <path d={`M${s / 2 - rb / 2} ${-s * 0.04} L${s / 2 + rb / 2} ${-s * 0.04} L${s / 2 + rb / 2 + side} ${-s * 0.04 - side * 0.6} L${s / 2 - rb / 2 + side} ${-s * 0.04 - side * 0.6} Z`} fill={tint(ribbon, 0.2)} />
          <rect x={-s * 0.04} y={-s * 0.04} width={s * 1.08} height={s * 0.16} fill={color} />
          <rect x={-s * 0.04} y={s * 0.1} width={s * 1.08} height={s * 0.03} fill="#3a2414" opacity="0.15" />
          <path d={`M${s * 1.04} ${-s * 0.04} L${s * 1.04 + side} ${-s * 0.04 - side * 0.6} L${s * 1.04 + side} ${s * 0.12 - side * 0.6} L${s * 1.04} ${s * 0.12} Z`} fill={D} />
          <rect x={s / 2 - rb / 2} y={-s * 0.04} width={rb} height={s * 0.16} fill={ribbon} />
          {/* lazo */}
          <g transform={`translate(${s / 2 + side / 2} ${-s * 0.04 - side * 0.3})`}>
            <path d={`M0 0 C${-s * 0.06} ${s * 0.06} ${-s * 0.1} ${s * 0.12} ${-s * 0.13} ${s * 0.16}`} stroke={ribbonD} strokeWidth={s * 0.045} fill="none" strokeLinecap="round" />
            <path d={`M0 0 C${s * 0.05} ${s * 0.06} ${s * 0.08} ${s * 0.12} ${s * 0.12} ${s * 0.15}`} stroke={ribbonD} strokeWidth={s * 0.045} fill="none" strokeLinecap="round" />
            <path d={`M0 0 C${-s * 0.06} ${-s * 0.14} ${-s * 0.24} ${-s * 0.12} ${-s * 0.18} ${-s * 0.01} C${-s * 0.13} ${s * 0.04} ${-s * 0.05} ${s * 0.02} 0 0 Z`} fill={ribbon} />
            <path d={`M0 0 C${s * 0.06} ${-s * 0.14} ${s * 0.24} ${-s * 0.12} ${s * 0.18} ${-s * 0.01} C${s * 0.13} ${s * 0.04} ${s * 0.05} ${s * 0.02} 0 0 Z`} fill={ribbon} />
            <path d={`M0 0 C${-s * 0.05} ${-s * 0.07} ${-s * 0.12} ${-s * 0.07} ${-s * 0.13} ${-s * 0.02}`} stroke={ribbonD} strokeWidth="1.5" fill="none" />
            <path d={`M0 0 C${s * 0.05} ${-s * 0.07} ${s * 0.12} ${-s * 0.07} ${s * 0.13} ${-s * 0.02}`} stroke={ribbonD} strokeWidth="1.5" fill="none" />
            <ellipse rx={s * 0.045} ry={s * 0.035} fill={ribbonD} />
          </g>
        </g>
      )}
    </g>
  );
}

function Balloon({ x, y, color, string }: { x: number; y: number; color: string; string: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 40 c-6 ${string * 0.25} 8 ${string * 0.5} 0 ${string * 0.75} c-4 ${string * 0.12} 2 ${string * 0.2} -2 ${string * 0.25}`} stroke="#7a6a5c" strokeWidth="1.5" fill="none" />
      <path d="M0 -34 C18 -34 26 -18 26 -4 C26 16 12 34 0 36 C-12 34 -26 16 -26 -4 C-26 -18 -18 -34 0 -34 Z" fill={color} />
      <path d="M8 -32 C22 -26 28 -10 24 6 C20 22 10 32 2 35 C14 22 18 2 8 -32 Z" fill={shade(color, 0.18)} />
      <ellipse cx="-10" cy="-14" rx="5" ry="10" fill="#fff" opacity="0.35" transform="rotate(20 -10 -14)" />
      <path d="M-4 35 L4 35 L2 41 L-2 41 Z" fill={shade(color, 0.15)} />
    </g>
  );
}

function Garland({ y }: { y: number }) {
  const colors = [C.terra, C.mustard, C.sage, C.dusty, C.plum, C.rose];
  return (
    <g>
      <path d={`M0 ${y} q150 60 300 0 t300 0`} stroke="#7a6a5c" strokeWidth="1.6" fill="none" />
      {Array.from({ length: 12 }).map((_, i) => {
        const x = 25 + i * 50;
        const t = (x % 300) / 300;
        const yy = y + 120 * t * (1 - t); // punto sobre la curva cuadrática
        const c = colors[i % colors.length];
        return (
          <g key={i}>
            <path d={`M${x - 12} ${yy} h24 l-12 28 z`} fill={c} />
            <path d={`M${x} ${yy} h12 l-12 28 z`} fill={shade(c, 0.16)} />
            <path d={`M${x - 12} ${yy} h24`} stroke={tint(c, 0.4)} strokeWidth="2" />
          </g>
        );
      })}
    </g>
  );
}

function Confetti() {
  const colors = [C.terra, C.mustard, C.sage, C.dusty, C.plum, C.rose];
  const pts = [
    [60, 60], [140, 40], [220, 96], [300, 46], [372, 84], [430, 40], [540, 70], [100, 140], [520, 140], [340, 130],
    [186, 30], [252, 150], [470, 104], [30, 110], [404, 160], [570, 30],
  ];
  return (
    <g>
      {pts.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={i % 3 === 0 ? 6 : 8} height={i % 3 === 0 ? 6 : 12} rx="1.5" fill={colors[i % colors.length]} transform={`rotate(${(i * 37) % 90} ${x} ${y})`} />
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

function Cake({ x, y, candles, scale = 1, smoke = false }: { x: number; y: number; candles: number; scale?: number; smoke?: boolean }) {
  const sponge = "#e9b7ae";
  const spongeD = shade(sponge, 0.16);
  const icing = "#fbf4e6";
  const icingD = shade(icing, 0.1);
  const drips = (x0: number, w: number, y0: number, n: number) =>
    `M${x0} ${y0 - 4} H${x0 + w} V${y0 + 6} ${Array.from({ length: n })
      .map((_, i) => {
        const xa = x0 + w - ((i + 1) * w) / n;
        const len = 6 + ((i * 7) % 3) * 6;
        const mid = xa + w / n / 2;
        return `L${mid + 4} ${y0 + 6} Q${mid + 4} ${y0 + 6 + len} ${mid} ${y0 + 6 + len} Q${mid - 4} ${y0 + 6 + len} ${mid - 4} ${y0 + 6} L${xa} ${y0 + 6}`;
      })
      .join(" ")} Z`;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* peana */}
      <ellipse cx="0" cy="66" rx="98" ry="8" fill="#3a2414" opacity="0.15" />
      <ellipse cx="0" cy="62" rx="96" ry="9" fill="#f1e7d6" />
      <ellipse cx="0" cy="60" rx="92" ry="6" fill="#fbf6ec" />
      {/* piso inferior */}
      <rect x="-80" y="0" width="160" height="60" rx="10" fill={sponge} />
      <rect x="36" y="0" width="44" height="60" rx="10" fill={spongeD} />
      <path d={drips(-80, 160, 4, 10)} fill={icing} />
      <path d="M-80 0 H80 V6 H-80 Z" fill={icingD} opacity="0.5" />
      {[-60, -36, -12, 14, 40, 62].map((dx, i) => (
        <rect key={i} x={dx} y={34 + (i % 2) * 10} width="5" height="2.5" rx="1" fill={[C.terra, C.sage, C.dusty][i % 3]} transform={`rotate(${i * 30} ${dx} ${34 + (i % 2) * 10})`} />
      ))}
      {/* piso superior */}
      <rect x="-60" y="-34" width="120" height="40" rx="9" fill={sponge} />
      <rect x="26" y="-34" width="34" height="40" rx="9" fill={spongeD} />
      <path d={drips(-60, 120, -30, 8)} fill={icing} />
      <ellipse cx="0" cy="-34" rx="60" ry="5" fill={icing} />
      <path d="M-50 -36 C-30 -39 -10 -39 6 -38" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <Candles x={0} y={-34} span={110} candles={candles} smoke={smoke} colors={[C.dusty, C.terra, C.sage, C.plum]} />
    </g>
  );
}

/** Fila de velas (tantas como años). (x, y) = centro de la base; `span` = anchura total que ocupan. */
function Candles({
  x,
  y,
  span,
  candles,
  scale = 1,
  smoke = false,
  colors = ["#4a86c9", "#e4573d", "#5aa469", "#9b7fd0"],
}: {
  x: number;
  y: number;
  span: number;
  candles: number;
  scale?: number;
  smoke?: boolean;
  colors?: string[];
}) {
  const n = Math.max(1, Math.min(10, candles));
  const spacing = span / Math.max(1, n - 1);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {Array.from({ length: n }).map((_, i) => {
        const cx = n === 1 ? 0 : -span / 2 + i * spacing;
        return (
          <g key={i} transform={`translate(${cx} 0)`}>
            <rect x="-4" y="-24" width="8" height="24" rx="2" fill={colors[i % colors.length]} />
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

/* ---------- Atrezo de exterior ---------- */

/** Sol suave (sin rayos): disco y halo. */
function SunGlow({ x, y }: { x: number; y: number }) {
  const id = useGid("sun");
  return (
    <g>
      <defs>
        <radialGradient id={id} cx={x} cy={y} r="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.9" />
          <stop offset="0.3" stopColor="#fbe7b0" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fbe7b0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r="110" fill={`url(#${id})`} />
      <circle cx={x} cy={y} r="24" fill="#f8e3a4" />
      <circle cx={x - 6} cy={y - 6} r="12" fill="#fdf0c8" opacity="0.7" />
    </g>
  );
}

/** Nube de dos tonos. */
function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-70 12 C-78 -4 -58 -16 -42 -10 C-38 -30 -8 -36 6 -20 C18 -38 54 -32 56 -10 C76 -14 86 4 72 14 Z" fill="#fbf6ea" />
      <path d="M-70 12 C-60 4 -44 8 -34 6 C-20 12 0 4 14 8 C30 12 50 4 72 14 Z" fill="#e3ddd0" />
      <path d="M-30 -18 C-22 -26 -10 -26 -2 -20" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

function Bird({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M-14 2 C-10 -6 -4 -6 0 1 C4 -6 10 -6 14 2 C9 -2 4 -1 0 4 C-4 -1 -9 -2 -14 2 Z"
      fill="#5c4d46"
    />
  );
}

/** Cometa con cola de lazos. (x, y) = centro. */
function Kite({ x, y }: { x: number; y: number }) {
  const c = C.terra;
  return (
    <g transform={`translate(${x} ${y}) rotate(-14)`}>
      <path d="M0 26 C-24 80 -96 128 -154 186" stroke="#8a7a68" strokeWidth="1.3" fill="none" />
      <path d="M0 -26 L20 0 L0 26 L-20 0 Z" fill={c} />
      <path d="M0 -26 L20 0 L0 0 Z" fill={tint(c, 0.25)} />
      <path d="M0 0 L20 0 L0 26 Z" fill={shade(c, 0.2)} />
      <path d="M0 -26 V26 M-20 0 H20" stroke={shade(c, 0.35)} strokeWidth="1.2" />
      {[
        [-4, 40, C.mustard],
        [6, 62, C.dusty],
        [-2, 84, C.mustard],
      ].map(([bx, by, bc], i) => (
        <path key={i} d={`M${bx} ${by} l-7 -5 v10 z M${bx} ${by} l7 -5 v10 z`} fill={bc as string} />
      ))}
    </g>
  );
}

/** Árbol: tronco con luz y sombra, copa en tres masas. (x, ground) = base del tronco. */
function Tree({ x, ground, s = 1 }: { x: number; ground: number; s?: number }) {
  const dark = "#6c8350";
  const mid = "#86a061";
  const light = "#a7ba78";
  const bark = "#8a6446";
  return (
    <g transform={`translate(${x} ${ground}) scale(${s})`}>
      <FloorShadow cx={6} cy={0} rx={70} ry={10} o={0.22} />
      <path d="M-14 0 C-10 -40 -12 -90 -8 -130 L10 -130 C12 -90 12 -40 18 0 C10 4 -6 4 -14 0 Z" fill={bark} />
      <path d="M4 -130 L10 -130 C12 -90 12 -40 18 0 C14 2 10 2 8 2 C8 -40 6 -90 4 -130 Z" fill={shade(bark, 0.25)} />
      <path d="M-4 -96 C-20 -110 -34 -116 -46 -130" stroke={bark} strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M4 -110 C18 -122 30 -128 44 -140" stroke={bark} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M-8 -40 C-6 -60 -8 -80 -6 -100" stroke={tint(bark, 0.3)} strokeWidth="2" fill="none" opacity="0.7" />
      {/* copa: tres masas (sombra, media, luz) */}
      <g fill={dark}>
        <path d={blob(-46, -144, 42, 9, 1)} />
        <path d={blob(44, -150, 46, 9, 2)} />
        <path d={blob(0, -188, 54, 11, 3)} />
        <path d={blob(0, -128, 40, 9, 4)} />
      </g>
      <g fill={mid}>
        <path d={blob(-38, -160, 32, 8, 5)} />
        <path d={blob(30, -170, 34, 8, 6)} />
        <path d={blob(-8, -200, 40, 10, 7)} />
      </g>
      <g fill={light}>
        <path d={blob(-44, -174, 15, 6, 8)} />
        <path d={blob(-22, -216, 19, 7, 9)} />
        <path d={blob(16, -188, 13, 6, 10)} />
      </g>
      <g stroke={shade(dark, 0.2)} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M-60 -130 q6 -6 12 -2 M30 -130 q6 -6 12 -2 M50 -150 q6 -6 12 -2 M-10 -150 q6 -6 12 -2" />
      </g>
    </g>
  );
}

/** Columpio de madera. (x, ground) = pie izquierdo. */
function Swing({ x, ground, s = 1 }: { x: number; ground: number; s?: number }) {
  const wood = C.wood;
  const W = 150;
  const H = 190;
  return (
    <g transform={`translate(${x} ${ground}) scale(${s})`}>
      <FloorShadow cx={W / 2} cy={0} rx={W / 2 + 30} ry={8} o={0.18} />
      {[0, W].map((px, i) => (
        <g key={i}>
          <path d={`M${px - 22} 0 L${px} ${-H}`} stroke={shade(wood, 0.25)} strokeWidth="9" strokeLinecap="round" />
          <path d={`M${px + 22} 0 L${px} ${-H}`} stroke={wood} strokeWidth="9" strokeLinecap="round" />
          <path d={`M${px + 20} -4 L${px + 2} ${-H + 6}`} stroke={tint(wood, 0.35)} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ))}
      <rect x="-10" y={-H - 8} width={W + 20} height="12" rx="5" fill={wood} />
      <rect x="-10" y={-H - 8} width={W + 20} height="4" rx="2" fill={tint(wood, 0.35)} />
      <path d={`M${W / 2 - 26} ${-H + 4} V-46 M${W / 2 + 26} ${-H + 4} V-46`} stroke="#8a7a68" strokeWidth="2.5" />
      <path d={`M${W / 2 - 34} -48 L${W / 2 + 34} -48 L${W / 2 + 38} -40 L${W / 2 - 38} -40 Z`} fill={tint(wood, 0.2)} />
      <rect x={W / 2 - 38} y="-40" width="76" height="6" fill={shade(wood, 0.2)} />
    </g>
  );
}

/** Banco de listones. (x, ground) = esquina inferior izquierda. */
function Bench({ x, ground, w }: { x: number; ground: number; w: number }) {
  const wood = C.wood;
  const iron = "#5c4a40";
  const seat = ground - 50;
  return (
    <g transform={`translate(${x} 0)`}>
      <FloorShadow cx={w / 2} cy={ground} rx={w / 2 + 10} ry={8} o={0.24} />
      {/* patas y brazos */}
      {[16, w - 22].map((lx, i) => (
        <g key={i}>
          <rect x={lx} y={seat - 64} width="7" height={ground - seat + 64} fill={iron} />
          <path d={`M${lx - 10} ${seat - 26} C${lx - 2} ${seat - 34} ${lx + 14} ${seat - 34} ${lx + 18} ${seat - 24}`} stroke={iron} strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* respaldo */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="4" y={seat - 62 + i * 17} width={w - 8} height="12" rx="3" fill={i % 2 ? shade(wood, 0.06) : wood} />
          <rect x="4" y={seat - 62 + i * 17} width={w - 8} height="3" rx="1.5" fill={tint(wood, 0.35)} />
          <rect x="4" y={seat - 53 + i * 17} width={w - 8} height="3" fill={shade(wood, 0.3)} />
        </g>
      ))}
      {/* asiento */}
      <path d={`M2 ${seat} L${w - 2} ${seat} L${w + 6} ${seat + 10} L-6 ${seat + 10} Z`} fill={tint(wood, 0.18)} />
      <path d={`M2 ${seat + 4} H${w - 2}`} stroke={shade(wood, 0.2)} strokeWidth="1.5" />
      <rect x="-6" y={seat + 10} width={w + 12} height="9" rx="2" fill={shade(wood, 0.12)} />
      <rect x="-6" y={seat + 16} width={w + 12} height="3" fill={shade(wood, 0.35)} />
    </g>
  );
}

/** Muro bajo de piedra seca con poste de cancela. (x, ground) = esquina inferior izquierda. */
function StoneWall({ x, ground, w }: { x: number; ground: number; w: number }) {
  const h = 66;
  const stone = "#b4ab98";
  const rows = 3;
  return (
    <g transform={`translate(${x} ${ground})`}>
      <FloorShadow cx={w / 2} cy={0} rx={w / 2 + 8} ry={7} o={0.22} />
      <rect x="0" y={-h} width={w + 10} height={h} fill={shade(stone, 0.35)} />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: 7 }).map((_, k) => {
          const sw = 30 + ((r * 3 + k * 5) % 4) * 6;
          const sx = -8 + k * 38 + (r % 2) * 18;
          const sy = -h + r * (h / rows) + 2;
          if (sx > w) return null;
          const c = [stone, tint(stone, 0.12), shade(stone, 0.08)][(r + k) % 3];
          return (
            <g key={`${r}-${k}`}>
              <rect x={sx} y={sy} width={sw} height={h / rows - 3} rx="9" fill={c} />
              <rect x={sx + 3} y={sy + 1} width={sw - 10} height="4" rx="2" fill={tint(c, 0.35)} />
              <rect x={sx + 4} y={sy + h / rows - 9} width={sw - 6} height="4" rx="2" fill={shade(c, 0.2)} />
            </g>
          );
        }),
      )}
      <path d={`M-4 ${-h + 2} C${w * 0.3} ${-h - 4} ${w * 0.7} ${-h - 2} ${w + 12} ${-h + 2}`} stroke="#8fa070" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* poste de cancela */}
      <rect x="-8" y={-h - 34} width="18" height={h + 34} rx="2" fill="#9a7a5c" />
      <rect x="4" y={-h - 34} width="6" height={h + 34} fill={shade("#9a7a5c", 0.25)} />
      <path d={`M-10 ${-h - 34} L1 ${-h - 44} L12 ${-h - 34} Z`} fill={shade("#9a7a5c", 0.1)} />
    </g>
  );
}

/** Arbusto redondeado con florecillas. (x, ground) = centro de la base. */
function Bush({ x, ground, w, flowers = true }: { x: number; ground: number; w: number; flowers?: boolean }) {
  const dark = "#6f8653";
  const mid = "#8aa265";
  const r = w / 2;
  return (
    <g transform={`translate(${x} ${ground})`}>
      <FloorShadow cx={0} cy={0} rx={r + 6} ry={6} o={0.2} />
      <g fill={dark}>
        <path d={blob(-r * 0.5, -r * 0.45, r * 0.55, 7, x)} />
        <path d={blob(r * 0.5, -r * 0.45, r * 0.55, 7, x + 1)} />
        <path d={blob(0, -r * 0.75, r * 0.6, 8, x + 2)} />
        <rect x={-r} y={-r * 0.45} width={w} height={r * 0.45} rx={r * 0.2} />
      </g>
      <g fill={mid}>
        <path d={blob(-r * 0.45, -r * 0.6, r * 0.38, 6, x + 3)} />
        <path d={blob(r * 0.15, -r * 0.9, r * 0.4, 7, x + 4)} />
      </g>
      <path d={blob(-r * 0.2, -r * 1.05, r * 0.16, 5, x + 5)} fill="#a9bb7c" />
      {flowers &&
        [
          [-0.6, -0.5],
          [-0.1, -0.95],
          [0.5, -0.6],
          [0.2, -0.35],
          [-0.35, -0.2],
          [0.7, -0.25],
        ].map(([fx, fy], i) => <circle key={i} cx={fx * r} cy={fy * r} r={2.6} fill={i % 2 ? "#f5ead2" : "#e9a98f"} />)}
    </g>
  );
}

/** Mancha de florecillas sobre la hierba. */
function Flowers({ x, y, n }: { x: number; y: number; n: number }) {
  const cols = ["#f5ead2", "#efc867", "#e9a98f", "#f5ead2"];
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const fx = x + ((i * 23) % 70) - 35;
        const fy = y + ((i * 13) % 22) - 11;
        return (
          <g key={i}>
            <path d={`M${fx} ${fy} v8`} stroke="#6f8653" strokeWidth="1.4" />
            <circle cx={fx} cy={fy} r="3.4" fill={cols[i % cols.length]} />
            <circle cx={fx} cy={fy} r="1.2" fill="#c98f3a" />
          </g>
        );
      })}
    </g>
  );
}

function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-2 14 2 26 0 40" stroke="#6f8653" strokeWidth="3" fill="none" />
      <path d="M0 24 C-12 18 -16 22 -18 26 C-12 30 -6 28 0 24 Z" fill="#7e9662" />
      <path d="M0 30 C10 24 16 26 18 30 C12 34 6 34 0 30 Z" fill="#6f8653" />
      {Array.from({ length: 5 }).map((_, i) => (
        <ellipse key={i} cy="-10" rx="6.5" ry="10" fill={i % 2 ? shade(color, 0.12) : color} transform={`rotate(${i * 72})`} />
      ))}
      <circle r="5.5" fill="#efc867" />
      <circle cx="-1.5" cy="-1.5" r="2" fill="#f8e3a4" />
    </g>
  );
}

function Stone({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="2" cy="12" rx="36" ry="6" fill="#3a2414" opacity="0.18" />
      <path d="M-34 10 C-36 -6 -20 -18 0 -18 C22 -18 36 -6 34 10 Z" fill="#a49c8c" />
      <path d="M8 -17 C24 -14 36 -4 34 10 L10 10 C16 0 14 -10 8 -17 Z" fill="#8a8274" />
      <path d="M-22 -8 C-14 -14 -4 -15 6 -14" stroke="#c4bcaa" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="-12" cy="0" r="3" fill="#97a27a" opacity="0.7" />
    </g>
  );
}

function Paper({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-12)`}>
      <rect x="3" y="4" width="40" height="50" rx="3" fill="#3a2414" opacity="0.15" />
      <rect width="40" height="50" rx="3" fill="#fbf4e4" />
      <path d="M30 0 H40 V10 Z" fill="#e8dcc4" />
      <path d="M8 14 h24 M8 24 h24 M8 34 h16" stroke="#8a7a68" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}
