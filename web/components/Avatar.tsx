import { EYES, HAIR_COLORS, OUTFITS, SKINS, hex, normalizeTraits } from "@/lib/traits";
import type { Accessory, Expression, EyeShape, Garment, Glasses as GlassesId, Traits } from "@/lib/types";

/**
 * Avatar SVG determinista. Cabeza grande, cuerpo pequeño, ojos de punto.
 * viewBox 0 0 200 280. Se usa en la hoja de personaje y dentro de las escenas.
 */
export function Avatar({
  traits: rawTraits,
  expression = "feliz",
  size = 200,
  className,
  flip = false,
}: {
  traits: Traits;
  expression?: Expression;
  size?: number;
  className?: string;
  flip?: boolean;
}) {
  const traits = normalizeTraits(rawTraits);
  const skin = hex(SKINS, traits.skin);
  const hair = hex(HAIR_COLORS, traits.hair.color);
  const eye = hex(EYES, traits.eyes);
  const outfit = OUTFITS.find((o) => o.id === traits.outfit) ?? OUTFITS[0];
  const skinShade = shade(skin, -18);

  return (
    <svg
      viewBox="0 0 200 280"
      width={size}
      height={(size * 280) / 200}
      className={className}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      {/* pelo trasero */}
      <HairBack shape={traits.hair.shape} color={hair} />
      {/* mochila (detrás del cuerpo) */}
      {traits.accessory === "mochila" && <rect x="40" y="152" width="120" height="78" rx="22" fill="#d2463a" />}
      {/* cuerpo */}
      <Body garment={traits.garment!} main={outfit.hex} dark={outfit.dark} skin={skin} />
      {/* cuello */}
      <rect x="86" y="132" width="28" height="26" rx="10" fill={skinShade} />
      {/* cabeza */}
      <ellipse cx="100" cy="92" rx="62" ry="64" fill={skin} />
      {/* orejas */}
      <circle cx="40" cy="98" r="11" fill={skin} />
      <circle cx="160" cy="98" r="11" fill={skin} />
      {/* mejillas */}
      <circle cx="66" cy="114" r="9" fill="#ff8f8f" opacity="0.45" />
      <circle cx="134" cy="114" r="9" fill="#ff8f8f" opacity="0.45" />
      {/* cara */}
      <Face expression={expression} eye={eye} shape={traits.eyeShape!} />
      {/* gafas */}
      {traits.glasses !== "no" && <Glasses kind={traits.glasses} />}
      {/* pelo delantero */}
      <HairFront shape={traits.hair.shape} color={hair} />
      {/* accesorios de cabeza y cuello */}
      <AccessoryFront kind={traits.accessory!} />
    </svg>
  );
}

function Face({ expression, eye, shape }: { expression: Expression; eye: string; shape: EyeShape }) {
  const L = { x: 76, y: 94 };
  const R = { x: 124, y: 94 };
  switch (expression) {
    case "risa":
      return (
        <g>
          <path d={`M${L.x - 9} ${L.y} q9 -10 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={`M${R.x - 9} ${R.y} q9 -10 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M80 122 q20 26 40 0 z" fill="#5a2a2a" />
          <path d="M86 128 q14 10 28 0" fill="#ff8f8f" />
        </g>
      );
    case "sorpresa":
      return (
        <g>
          <circle cx={L.x} cy={L.y} r="8" fill="#fff" />
          <circle cx={R.x} cy={R.y} r="8" fill="#fff" />
          <circle cx={L.x} cy={L.y} r="4.5" fill={eye} />
          <circle cx={R.x} cy={R.y} r="4.5" fill={eye} />
          <path d={`M${L.x - 10} ${L.y - 18} q10 -6 20 0`} stroke="#5a3a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d={`M${R.x - 10} ${R.y - 18} q10 -6 20 0`} stroke="#5a3a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="100" cy="130" rx="7" ry="9" fill="#5a2a2a" />
        </g>
      );
    case "curioso":
      return (
        <g>
          <circle cx={L.x} cy={L.y} r="5" fill={eye} />
          <circle cx={R.x} cy={R.y} r="5" fill={eye} />
          <path d={`M${L.x - 10} ${L.y - 14} q10 -2 20 2`} stroke="#5a3a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d={`M${R.x - 10} ${R.y - 20} q10 -6 20 0`} stroke="#5a3a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M88 126 q12 8 24 -2" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "sueno":
      return (
        <g>
          <path d={`M${L.x - 9} ${L.y + 2} q9 8 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={`M${R.x - 9} ${R.y + 2} q9 8 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M90 126 q10 6 20 0" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "orgullo":
      return (
        <g>
          <path d={`M${L.x - 9} ${L.y} q9 -10 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={`M${R.x - 9} ${R.y} q9 -10 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M82 124 q18 16 36 0" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <NeutralEyes shape={shape} eye={eye} L={L} R={R} />
          <path d="M84 124 q16 14 32 0" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

/** Ojos en reposo según la forma elegida (E01–E06). El resto de expresiones mantienen sus ojos propios. */
function NeutralEyes({ shape, eye, L, R }: { shape: EyeShape; eye: string; L: { x: number; y: number }; R: { x: number; y: number } }) {
  const both = (f: (p: { x: number; y: number }) => React.ReactNode) => (
    <>
      {f(L)}
      {f(R)}
    </>
  );
  switch (shape) {
    case "redondos":
      return both((p) => (
        <g key={p.x}>
          <circle cx={p.x} cy={p.y} r="7.5" fill={eye} />
          <circle cx={p.x + 2.5} cy={p.y - 2.5} r="2.4" fill="#fff" />
        </g>
      ));
    case "ovalados":
      return both((p) => (
        <g key={p.x}>
          <ellipse cx={p.x} cy={p.y} rx="4.5" ry="7.5" fill={eye} />
          <circle cx={p.x + 1.5} cy={p.y - 3} r="1.6" fill="#fff" />
        </g>
      ));
    case "dormilones":
      return both((p) => (
        <g key={p.x}>
          <path d={`M${p.x - 8} ${p.y} h16`} stroke={eye} strokeWidth="4" strokeLinecap="round" />
          <path d={`M${p.x - 7} ${p.y + 1} q7 6 14 0`} fill={eye} />
        </g>
      ));
    case "cerrados":
      return both((p) => (
        <path key={p.x} d={`M${p.x - 9} ${p.y} q9 8 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
      ));
    case "risuenos":
      return both((p) => (
        <path key={p.x} d={`M${p.x - 9} ${p.y + 2} q9 -11 18 0`} stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
      ));
    default:
      return both((p) => (
        <g key={p.x}>
          <circle cx={p.x} cy={p.y} r="5" fill={eye} />
          <circle cx={p.x + 2} cy={p.y - 2} r="1.6" fill="#fff" />
        </g>
      ));
  }
}

function Glasses({ kind }: { kind: Exclude<GlassesId, "no"> }) {
  const style: Record<Exclude<GlassesId, "no">, { stroke: string; w: number; shape: "round" | "oval" | "rect"; fill?: string; opacity?: number }> = {
    redondas: { stroke: "#2c3340", w: 2.5, shape: "round" },
    "redondas-gruesas": { stroke: "#23395d", w: 5.5, shape: "round" },
    ovaladas: { stroke: "#7a4a2a", w: 3.5, shape: "oval" },
    cuadradas: { stroke: "#2c3340", w: 3.5, shape: "rect" },
    pasta: { stroke: "#6b3a1e", w: 6, shape: "rect" },
    transparentes: { stroke: "#c9ced6", w: 4.5, shape: "round", fill: "#ffffff", opacity: 0.9 },
  };
  const g = style[kind];
  const lens = (cx: number) =>
    g.shape === "round" ? (
      <circle cx={cx} cy="95" r="15" />
    ) : g.shape === "oval" ? (
      <ellipse cx={cx} cy="95" rx="17" ry="13" />
    ) : (
      <rect x={cx - 16} y="82" width="32" height="26" rx="6" />
    );
  return (
    <g fill={g.fill ?? "none"} fillOpacity={g.fill ? 0.25 : undefined} stroke={g.stroke} strokeWidth={g.w} opacity={g.opacity}>
      {lens(76)}
      {lens(124)}
      <path d="M91 95 h18" fill="none" />
      <path d="M60 93 h-17 M140 93 h17" fill="none" />
    </g>
  );
}

/** Cuerpo según la prenda (O01–O08). `main`/`dark` = color de ropa elegido. */
function Body({ garment, main, dark, skin }: { garment: Garment; main: string; dark: string; skin: string }) {
  const legs = (color: string, short = false) => (
    <>
      <rect x="68" y="236" width="24" height={short ? 16 : 34} rx="10" fill={color} />
      <rect x="108" y="236" width="24" height={short ? 16 : 34} rx="10" fill={color} />
      {short && (
        <>
          <rect x="70" y="248" width="20" height="20" rx="8" fill={skin} />
          <rect x="110" y="248" width="20" height="20" rx="8" fill={skin} />
        </>
      )}
    </>
  );
  const shoes = (color = "#2f3747") => (
    <>
      <ellipse cx="80" cy="272" rx="16" ry="7" fill={color} />
      <ellipse cx="120" cy="272" rx="16" ry="7" fill={color} />
    </>
  );
  const arms = (color: string, bare = false) => (
    <>
      <rect x="30" y="160" width="28" height={bare ? 28 : 64} rx="14" fill={color} />
      <rect x="142" y="160" width="28" height={bare ? 28 : 64} rx="14" fill={color} />
      {bare && (
        <>
          <rect x="33" y="184" width="22" height="40" rx="11" fill={skin} />
          <rect x="145" y="184" width="22" height="40" rx="11" fill={skin} />
        </>
      )}
      <circle cx="44" cy="226" r="11" fill={skin} />
      <circle cx="156" cy="226" r="11" fill={skin} />
    </>
  );
  switch (garment) {
    case "chubasquero":
      return (
        <g>
          {legs("#4e5a73")}
          <rect x="66" y="252" width="28" height="22" rx="6" fill="#3f73c4" />
          <rect x="106" y="252" width="28" height="22" rx="6" fill="#3f73c4" />
          <path d="M50 150 h100 l10 96 h-120 z" fill={main} />
          <rect x="97" y="158" width="6" height="84" rx="3" fill={dark} />
          <circle cx="88" cy="182" r="4" fill={dark} />
          <circle cx="88" cy="208" r="4" fill={dark} />
          {arms(main)}
        </g>
      );
    case "peto":
      return (
        <g>
          {legs(main)}
          {shoes()}
          <rect x="52" y="150" width="96" height="92" rx="30" fill="#f3ead8" />
          <rect x="66" y="176" width="68" height="66" rx="14" fill={main} />
          <rect x="70" y="150" width="10" height="34" rx="4" fill={main} />
          <rect x="120" y="150" width="10" height="34" rx="4" fill={main} />
          <circle cx="75" cy="182" r="3.5" fill="#fff" />
          <circle cx="125" cy="182" r="3.5" fill="#fff" />
          <rect x="88" y="196" width="24" height="18" rx="4" fill={dark} />
          {arms("#f3ead8")}
        </g>
      );
    case "marinera":
      return (
        <g>
          {legs("#2f5aa3", true)}
          {shoes("#c94a3a")}
          <rect x="52" y="150" width="96" height="92" rx="30" fill="#ffffff" />
          {[168, 186, 204, 222].map((y) => (
            <rect key={y} x="54" y={y} width="92" height="8" fill={main} />
          ))}
          {arms("#ffffff", true)}
        </g>
      );
    case "vestido":
      return (
        <g>
          <rect x="70" y="236" width="20" height="32" rx="8" fill={skin} />
          <rect x="110" y="236" width="20" height="32" rx="8" fill={skin} />
          {shoes("#c94a3a")}
          <path d="M62 150 h76 l22 100 h-120 z" fill={main} />
          <path d="M80 150 q20 16 40 0" fill="#fff" opacity="0.9" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={66 + i * 17} cy={232 - (i % 2) * 18} r="3" fill="#fff" opacity="0.8" />
          ))}
          {arms(main, true)}
        </g>
      );
    case "plumifero":
      return (
        <g>
          {legs("#4e5a73")}
          {shoes("#efe6d6")}
          <rect x="46" y="148" width="108" height="98" rx="34" fill={main} />
          {[176, 202, 228].map((y) => (
            <path key={y} d={`M50 ${y} h100`} stroke={dark} strokeWidth="3" opacity="0.6" />
          ))}
          <rect x="74" y="140" width="52" height="18" rx="9" fill="#f6efe2" />
          <rect x="26" y="158" width="32" height="68" rx="16" fill={main} />
          <rect x="142" y="158" width="32" height="68" rx="16" fill={main} />
          <circle cx="44" cy="228" r="11" fill={skin} />
          <circle cx="156" cy="228" r="11" fill={skin} />
        </g>
      );
    case "pijama":
      return (
        <g>
          {legs(main)}
          {shoes("#c94a3a")}
          <rect x="52" y="150" width="96" height="92" rx="30" fill={main} />
          {[
            [72, 176],
            [118, 190],
            [90, 216],
            [128, 228],
            [64, 232],
            [80, 258],
            [120, 262],
          ].map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y - 5} l1.6 3.4 l3.6 0.4 l-2.7 2.4 l0.8 3.6 l-3.3 -1.9 l-3.3 1.9 l0.8 -3.6 l-2.7 -2.4 l3.6 -0.4 z`} fill="#ffe27a" />
          ))}
          <path d="M84 150 l16 14 l16 -14" stroke="#fff" strokeWidth="3" fill="none" />
          {arms(main)}
        </g>
      );
    case "verano":
      return (
        <g>
          {legs("#3f7fd0", true)}
          <ellipse cx="80" cy="272" rx="14" ry="6" fill={skin} />
          <ellipse cx="120" cy="272" rx="14" ry="6" fill={skin} />
          <rect x="52" y="150" width="96" height="88" rx="30" fill={main} />
          <path d="M70 250 q10 -6 20 0 M110 250 q10 -6 20 0" stroke="#fff" strokeWidth="2.5" fill="none" />
          {arms(main, true)}
        </g>
      );
    default:
      // jersey: el cuerpo original del avatar
      return (
        <g>
          <rect x="52" y="150" width="96" height="92" rx="30" fill={main} />
          <rect x="52" y="200" width="96" height="42" rx="18" fill={dark} opacity="0.35" />
          {arms(main)}
          {legs("#4e5a73")}
          {shoes()}
        </g>
      );
  }
}

/** Accesorios que van sobre la cabeza o el cuello (A01–A08; la mochila se pinta detrás del cuerpo). */
function AccessoryFront({ kind }: { kind: Accessory }) {
  switch (kind) {
    case "gorro":
      return (
        <g>
          <path d="M38 70 q4 -52 62 -54 q58 2 62 54 z" fill="#f6c445" />
          <rect x="34" y="60" width="132" height="22" rx="11" fill="#e3ad2b" />
          <circle cx="100" cy="16" r="15" fill="#e4573d" />
        </g>
      );
    case "diadema":
      return (
        <g>
          <path d="M44 66 q56 -60 112 0" stroke="#e4573d" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M126 34 l18 -14 l-2 16 l14 6 l-18 6 z" fill="#e4573d" />
        </g>
      );
    case "sombrero":
      return (
        <g>
          <ellipse cx="100" cy="52" rx="86" ry="18" fill="#efd28e" />
          <path d="M56 52 q2 -46 44 -46 q42 0 44 46 z" fill="#f2dca0" />
          <rect x="56" y="38" width="88" height="10" fill="#4a86c9" />
        </g>
      );
    case "bufanda":
      return (
        <g>
          <rect x="62" y="140" width="76" height="20" rx="10" fill="#e4573d" />
          <rect x="112" y="150" width="18" height="44" rx="6" fill="#e4573d" />
          <path d="M112 190 v6 M118 190 v6 M124 190 v6" stroke="#b93f2a" strokeWidth="2" />
        </g>
      );
    case "lazo":
      return (
        <g fill="#e4573d">
          <path d="M132 34 l-24 -14 v28 z" />
          <path d="M132 34 l24 -14 v28 z" />
          <circle cx="132" cy="34" r="7" fill="#b93f2a" />
        </g>
      );
    case "casco":
      return (
        <g>
          <path d="M34 78 q4 -66 66 -66 q62 0 66 66 z" fill="#4a86c9" />
          <rect x="30" y="70" width="140" height="14" rx="7" fill="#2f66a3" />
          <path d="M70 30 h14 M96 24 h14 M122 30 h14" stroke="#2f66a3" strokeWidth="6" strokeLinecap="round" />
          <path d="M40 84 q8 40 34 56 M160 84 q-8 40 -34 56" stroke="#3a3f4a" strokeWidth="3" fill="none" />
        </g>
      );
    case "bolso":
      return (
        <g>
          <path d="M62 152 l70 70" stroke="#c98a2b" strokeWidth="5" />
          <rect x="120" y="208" width="34" height="28" rx="8" fill="#f6c445" stroke="#c98a2b" strokeWidth="2" />
        </g>
      );
    default:
      return null;
  }
}

function HairBack({ shape, color }: { shape: Traits["hair"]["shape"]; color: string }) {
  switch (shape) {
    case "melena":
      return <path d="M38 80 q-8 70 6 110 h112 q14 -40 6 -110 z" fill={color} />;
    case "flequillo":
      return <path d="M36 82 q-6 44 6 70 h116 q12 -26 6 -70 z" fill={color} />;
    case "rizos-media":
      return (
        <g fill={color}>
          {[40, 58, 76, 94, 112, 130].map((y, i) => (
            <g key={y}>
              <circle cx={34 + (i % 2) * 4} cy={y + 30} r="16" />
              <circle cx={166 - (i % 2) * 4} cy={y + 30} r="16" />
            </g>
          ))}
        </g>
      );
    case "rizos-largos":
      return (
        <g fill={color}>
          {[60, 82, 104, 126, 148, 170, 192].map((y, i) => (
            <g key={y}>
              <circle cx={32 + (i % 2) * 6} cy={y} r="17" />
              <circle cx={168 - (i % 2) * 6} cy={y} r="17" />
            </g>
          ))}
        </g>
      );
    case "ondulado":
      return <path d="M36 80 q-10 30 0 50 q-10 20 4 40 h120 q14 -20 4 -40 q10 -20 0 -50 z" fill={color} />;
    case "afro":
      return <circle cx="100" cy="86" r="84" fill={color} />;
    case "trenzas":
      return (
        <g fill={color}>
          <ellipse cx="40" cy="150" rx="10" ry="12" />
          <ellipse cx="40" cy="172" rx="10" ry="12" />
          <ellipse cx="40" cy="194" rx="9" ry="11" />
          <ellipse cx="160" cy="150" rx="10" ry="12" />
          <ellipse cx="160" cy="172" rx="10" ry="12" />
          <ellipse cx="160" cy="194" rx="9" ry="11" />
        </g>
      );
    case "coleta":
      return (
        <g fill={color}>
          <ellipse cx="164" cy="72" rx="14" ry="12" />
          <path d="M166 76 q24 30 8 70 q-10 -30 -22 -50 z" />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ shape, color }: { shape: Traits["hair"]["shape"]; color: string }) {
  switch (shape) {
    case "corto":
      return <path d="M40 84 q10 -56 60 -56 q50 0 60 56 q-20 -22 -60 -24 q-40 2 -60 24 z" fill={color} />;
    case "melena":
      return <path d="M38 86 q8 -60 62 -60 q54 0 62 60 q-14 -22 -34 -28 q-14 10 -28 10 q-14 0 -28 -10 q-20 6 -34 28 z" fill={color} />;
    case "coleta":
      return <path d="M40 84 q10 -56 60 -56 q50 0 60 56 q-20 -24 -60 -26 q-40 2 -60 26 z" fill={color} />;
    case "rizos":
      return (
        <g fill={color}>
          <circle cx="52" cy="60" r="16" />
          <circle cx="76" cy="42" r="18" />
          <circle cx="100" cy="36" r="19" />
          <circle cx="124" cy="42" r="18" />
          <circle cx="148" cy="60" r="16" />
          <circle cx="44" cy="84" r="12" />
          <circle cx="156" cy="84" r="12" />
          <path d="M44 80 q20 -40 56 -40 q36 0 56 40 q-26 -14 -56 -14 q-30 0 -56 14 z" />
        </g>
      );
    case "afro":
      return <path d="M30 100 q0 -70 70 -70 q70 0 70 70 q-24 -28 -70 -30 q-46 2 -70 30 z" fill={color} />;
    case "trenzas":
      return (
        <g fill={color}>
          <path d="M38 90 q8 -62 62 -62 q54 0 62 62 q-20 -26 -62 -28 q-42 2 -62 28 z" />
          <ellipse cx="40" cy="120" rx="11" ry="14" />
          <ellipse cx="160" cy="120" rx="11" ry="14" />
        </g>
      );
    case "flequillo":
      return (
        <path
          d="M40 86 q10 -58 60 -58 q50 0 60 58 l-10 -6 l-8 10 l-10 -12 l-10 10 l-10 -12 l-10 12 l-10 -10 l-10 12 l-8 -10 z"
          fill={color}
        />
      );
    case "rapado":
      return <path d="M44 72 q14 -36 56 -36 q42 0 56 36 q-26 -12 -56 -12 q-30 0 -56 12 z" fill={color} opacity="0.85" />;
    case "rizos-media":
    case "rizos-largos":
      return (
        <g fill={color}>
          <circle cx="50" cy="62" r="17" />
          <circle cx="72" cy="42" r="18" />
          <circle cx="100" cy="34" r="19" />
          <circle cx="128" cy="42" r="18" />
          <circle cx="150" cy="62" r="17" />
          <path d="M40 82 q20 -42 60 -42 q40 0 60 42 q-28 -16 -60 -16 q-32 0 -60 16 z" />
        </g>
      );
    case "ondulado":
      return <path d="M38 88 q6 -60 62 -60 q56 0 62 60 q-12 -20 -26 -22 q-10 12 -22 4 q-14 10 -28 0 q-12 8 -22 -4 q-14 2 -26 22 z" fill={color} />;
    case "mono":
      return (
        <g fill={color}>
          <circle cx="100" cy="22" r="22" />
          <path d="M40 84 q10 -56 60 -56 q50 0 60 56 q-20 -22 -60 -24 q-40 2 -60 24 z" />
        </g>
      );
  }
}

function shade(hexColor: string, amount: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
