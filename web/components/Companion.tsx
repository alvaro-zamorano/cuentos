import { Avatar } from "./Avatar";
import type { Companion as CompanionT, Expression } from "@/lib/types";
import { DEFAULT_TRAITS, defaultVariant } from "@/lib/traits";

/** Acompañante en escena. viewBox propio 0 0 200 280 para alinear con el avatar. */
export function Companion({ companion, size = 150, expression = "feliz" }: { companion: CompanionT; size?: number; expression?: Expression }) {
  const variant = companion.variant ?? defaultVariant(companion.kind);
  switch (companion.kind) {
    case "perro":
      return <Dog size={size} variant={variant} />;
    case "gato":
      return <Cat size={size} variant={variant} />;
    case "abuela":
      return <Elder size={size} female variant={variant} />;
    case "abuelo":
      return <Elder size={size} variant={variant} />;
    case "hermano":
    case "hermana":
      return <Avatar traits={companion.traits ?? DEFAULT_TRAITS} expression={expression} size={size * 0.82} />;
  }
}

const DOG: Record<string, { body: string; leg: string; ear: string; muzzle: string; patch?: string }> = {
  corgi: { body: "#e59a4a", leg: "#f3d9b8", ear: "#c97a2e", muzzle: "#fff4e6" },
  golden: { body: "#e7b86a", leg: "#d9a654", ear: "#c98f3a", muzzle: "#f6dcae" },
  manchado: { body: "#f7efe4", leg: "#efe3d2", ear: "#8d5a2b", muzzle: "#ffffff", patch: "#a8683a" },
};

function Dog({ size, variant }: { size: number; variant?: string }) {
  const h = (size * 280) / 200;
  const c = DOG[variant ?? ""] ?? { body: "#c98a4b", leg: "#b0773d", ear: "#8d5a2b", muzzle: "#f3d9b8" };
  return (
    <svg viewBox="0 0 200 280" width={size} height={h} aria-hidden>
      <g transform="translate(0 70)">
        <ellipse cx="100" cy="190" rx="70" ry="46" fill={c.body} />
        {c.patch && <ellipse cx="124" cy="178" rx="26" ry="20" fill={c.patch} />}
        <rect x="46" y="200" width="22" height="34" rx="10" fill={c.leg} />
        <rect x="132" y="200" width="22" height="34" rx="10" fill={c.leg} />
        <path d="M166 170 q30 -30 10 -56" stroke={c.body} strokeWidth="14" fill="none" strokeLinecap="round" />
        <circle cx="76" cy="128" r="46" fill={c.body} />
        {c.patch && <circle cx="96" cy="112" r="18" fill={c.patch} />}
        {variant === "corgi" ? (
          <>
            <path d="M40 104 l4 -50 l30 30 z" fill={c.ear} />
            <path d="M112 104 l-4 -50 l-30 30 z" fill={c.ear} />
          </>
        ) : (
          <>
            <ellipse cx="38" cy="112" rx="16" ry="30" fill={c.ear} transform="rotate(-20 38 112)" />
            <ellipse cx="114" cy="112" rx="16" ry="30" fill={c.ear} transform="rotate(20 114 112)" />
          </>
        )}
        <ellipse cx="76" cy="146" rx="22" ry="16" fill={c.muzzle} />
        <ellipse cx="76" cy="140" rx="8" ry="6" fill="#2b2118" />
        <circle cx="62" cy="122" r="5" fill="#2b2118" />
        <circle cx="90" cy="122" r="5" fill="#2b2118" />
        <path d="M68 150 q8 8 16 0" stroke="#2b2118" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M74 156 q4 10 10 4" fill="#ff8f8f" />
      </g>
    </svg>
  );
}

const CAT: Record<string, { body: string; face?: string; stripe?: string; eye: string }> = {
  atigrado: { body: "#c98a4b", stripe: "#8d5a2b", eye: "#2f7a4a" },
  blanquinegro: { body: "#2f2f36", face: "#ffffff", eye: "#c9a227" },
};

function Cat({ size, variant }: { size: number; variant?: string }) {
  const h = (size * 280) / 200;
  const c = CAT[variant ?? ""] ?? { body: "#7d7f8a", eye: "#2f7a4a" };
  return (
    <svg viewBox="0 0 200 280" width={size} height={h} aria-hidden>
      <g transform="translate(0 80)">
        <ellipse cx="100" cy="186" rx="60" ry="42" fill={c.body} />
        {c.stripe && [80, 100, 120].map((x) => <path key={x} d={`M${x} 150 q6 18 0 36`} stroke={c.stripe} strokeWidth="6" fill="none" />)}
        {c.face && <ellipse cx="100" cy="200" rx="30" ry="26" fill={c.face} />}
        <path d="M156 176 q40 -16 30 -60" stroke={c.body} strokeWidth="12" fill="none" strokeLinecap="round" />
        <circle cx="76" cy="128" r="42" fill={c.body} />
        {c.face && <path d="M50 150 q26 -40 52 0 q-26 14 -52 0 z" fill={c.face} />}
        {c.stripe && <path d="M66 92 v12 M76 90 v14 M86 92 v12" stroke={c.stripe} strokeWidth="4" />}
        <path d="M44 100 l-6 -36 l30 20 z" fill={c.body} />
        <path d="M108 100 l6 -36 l-30 20 z" fill={c.body} />
        <path d="M46 96 l-2 -22 l18 12 z" fill="#f2b8c0" />
        <path d="M106 96 l2 -22 l-18 12 z" fill="#f2b8c0" />
        <circle cx="62" cy="124" r="5" fill={c.eye} />
        <circle cx="90" cy="124" r="5" fill={c.eye} />
        <path d="M72 138 l4 4 l4 -4 z" fill="#f2b8c0" />
        <path d="M68 146 q8 6 16 0" stroke="#2b2118" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M40 140 h-22 M40 146 h-22 M112 140 h22 M112 146 h22" stroke="#2b2118" strokeWidth="2" />
      </g>
    </svg>
  );
}

const ELDER: Record<string, { skin: string; hair: string; outfit: string; glasses: boolean; beard?: boolean; bald?: boolean; curly?: boolean; bun?: boolean }> = {
  "abuela-mono": { skin: "#f4cfae", hair: "#e4e1da", outfit: "#c66b8a", glasses: false, bun: true },
  "abuela-rizos": { skin: "#9a6440", hair: "#9a9aa0", outfit: "#9b7fd0", glasses: true, curly: true },
  "abuela-ondas": { skin: "#f4cfae", hair: "#eeeae2", outfit: "#5aa469", glasses: false },
  "abuela-gafas": { skin: "#f1c7a2", hair: "#b9b6b0", outfit: "#e3ad2b", glasses: true },
  "abuelo-calvo": { skin: "#f4cfae", hair: "#e4e1da", outfit: "#2f66a3", glasses: true, bald: true },
  "abuelo-barba": { skin: "#8a5434", hair: "#c9c6c0", outfit: "#4a86c9", glasses: false, beard: true },
  "abuelo-gafas": { skin: "#f1c7a2", hair: "#a9a6a0", outfit: "#5aa469", glasses: true },
  "abuelo-gris": { skin: "#f4cfae", hair: "#9a9aa0", outfit: "#a86c44", glasses: false },
};

function Elder({ size, female = false, variant }: { size: number; female?: boolean; variant?: string }) {
  const h = (size * 280) / 200;
  const v = ELDER[variant ?? ""] ?? { skin: "#f4cfae", hair: "#d9d6cf", outfit: female ? "#c66b8a" : "#5f7fa3", glasses: true };
  const { skin, hair, outfit } = v;
  return (
    <svg viewBox="0 0 200 280" width={size} height={h} aria-hidden>
      {female && !v.bun && <path d="M40 90 q-6 60 4 92 h112 q10 -32 4 -92 z" fill={hair} />}
      <rect x="52" y="150" width="96" height="92" rx="30" fill={outfit} />
      <rect x="30" y="160" width="28" height="64" rx="14" fill={outfit} />
      <rect x="142" y="160" width="28" height="64" rx="14" fill={outfit} />
      <circle cx="44" cy="226" r="11" fill={skin} />
      <circle cx="156" cy="226" r="11" fill={skin} />
      <rect x="68" y="236" width="24" height="34" rx="10" fill="#6b6460" />
      <rect x="108" y="236" width="24" height="34" rx="10" fill="#6b6460" />
      <ellipse cx="80" cy="272" rx="16" ry="7" fill="#3b3330" />
      <ellipse cx="120" cy="272" rx="16" ry="7" fill="#3b3330" />
      <rect x="86" y="132" width="28" height="26" rx="10" fill={skin} opacity="0.85" />
      <ellipse cx="100" cy="92" rx="60" ry="62" fill={skin} />
      <circle cx="42" cy="98" r="10" fill={skin} />
      <circle cx="158" cy="98" r="10" fill={skin} />
      <circle cx="66" cy="114" r="9" fill="#ff8f8f" opacity="0.4" />
      <circle cx="134" cy="114" r="9" fill="#ff8f8f" opacity="0.4" />
      <path d="M76 94 q0 -6 0 0" />
      <path d="M67 92 q9 -8 18 0" stroke="#4a2f1a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M115 92 q9 -8 18 0" stroke="#4a2f1a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M84 122 q16 14 32 0" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
      {v.glasses && (
        <g fill="none" stroke="#2c3340" strokeWidth="3.5">
          <circle cx="76" cy="95" r="15" />
          <circle cx="124" cy="95" r="15" />
          <path d="M91 95 h18 M61 93 h-18 M139 93 h18" />
        </g>
      )}
      {v.beard && (
        <>
          <path d="M58 112 q42 70 84 0 q-6 22 -42 24 q-36 -2 -42 -24 z" fill={hair} />
          <path d="M86 124 q14 10 28 0" stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      )}
      {female ? (
        <g fill={hair}>
          {v.curly ? (
            [44, 66, 88, 112, 134, 156].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 44 : 56} r="18" />)
          ) : (
            <path d="M40 86 q10 -58 60 -58 q50 0 60 58 q-20 -22 -60 -24 q-40 2 -60 24 z" />
          )}
          {v.bun && <circle cx="100" cy="26" r="20" />}
        </g>
      ) : (
        <g fill={hair}>
          <path d="M42 86 q4 -20 16 -34 q-6 20 -2 34 z" />
          <path d="M158 86 q-4 -20 -16 -34 q6 20 2 34 z" />
          {!v.bald && <path d="M46 70 q12 -40 54 -40 q42 0 54 40 q-24 -14 -54 -14 q-30 0 -54 14 z" />}
        </g>
      )}
    </svg>
  );
}
