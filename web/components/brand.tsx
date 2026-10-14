/* eslint-disable @next/next/no-img-element -- portadas ya optimizadas (WebP) o URLs firmadas de Supabase */
/**
 * Piezas del estilo «La hora del cuento» (docs/ESTILO.md): estrella, luna, colina, iconos de trazo y el libro como
 * objeto (A4 vertical, ilustración 3:2 arriba y «para …» en la banda, como el PDF).
 */

type IconProps = { className?: string; size?: number };

const STAR = "M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z";

/** Estrella de cuatro puntas (el «polvo de estrellas» del libro de muestra). */
export function Sparkle({ className = "", size = 16, color = "var(--star)" }: IconProps & { color?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d={STAR} fill={color} />
    </svg>
  );
}

export function Moon({ className = "", size = 48, color = "#f7e6b5" }: IconProps & { color?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className={className}>
      <path d="M40 6C26 8 16 20 16 34C16 48 27 58 41 58C46 58 50 57 54 54C49 55 44 54 40 52C30 47 25 36 28 25C30 16 34 10 40 6Z" fill={color} />
    </svg>
  );
}

/** Colina que separa la noche de la crema. */
export function Hills({ className = "", color = "var(--paper)" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 100" preserveAspectRatio="none" className={`block w-full ${className}`}>
      <path d="M0 62C180 18 380 8 600 40C820 72 1020 86 1240 52C1330 38 1390 30 1440 30V100H0Z" fill={color} />
    </svg>
  );
}

/** Mancha de gouache para el fondo de una sección. */
export function Blob({ className = "", color = "var(--peach)" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 300" className={className}>
      <path d="M78 42C132 -6 262 6 326 62C392 120 378 228 300 268C226 306 110 292 52 232C-4 174 22 92 78 42Z" fill={color} />
    </svg>
  );
}

function Stroke({ d, size = 18, className = "", width = 2 }: IconProps & { d: string[]; width?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {d.map((x) => (
        <path key={x} d={x} />
      ))}
    </svg>
  );
}

export const Icon = {
  check: (p: IconProps) => <Stroke {...p} width={2.6} d={["M5 12.5l4.2 4.2L19 7"]} />,
  arrow: (p: IconProps) => <Stroke {...p} width={2.2} d={["M5 12h14", "M13 6l6 6-6 6"]} />,
  back: (p: IconProps) => <Stroke {...p} width={2.2} d={["M15 6l-6 6 6 6"]} />,
  next: (p: IconProps) => <Stroke {...p} width={2.2} d={["M9 6l6 6-6 6"]} />,
  down: (p: IconProps) => <Stroke {...p} width={2.2} d={["M6 9l6 6 6-6"]} />,
  close: (p: IconProps) => <Stroke {...p} width={2.2} d={["M6 6l12 12", "M18 6L6 18"]} />,
  pencil: (p: IconProps) => <Stroke {...p} d={["M4 20l4-1L19 8l-3-3L5 16z", "M14 7l3 3"]} />,
  brush: (p: IconProps) => <Stroke {...p} d={["M12 19l7-7 3 3-7 7z", "M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z", "M2 2l7.6 7.6"]} />,
  image: (p: IconProps) => <Stroke {...p} d={["M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M21 16l-5-5-8 8", "M9 10.5a1.5 1.5 0 1 0 0-.01"]} />,
  download: (p: IconProps) => <Stroke {...p} d={["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"]} />,
  lock: (p: IconProps) => <Stroke {...p} d={["M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z", "M8 11V8a4 4 0 0 1 8 0v3"]} />,
  mail: (p: IconProps) => <Stroke {...p} d={["M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M3 8l9 6 9-6"]} />,
  glasses: (p: IconProps) => <Stroke {...p} d={["M3 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0", "M14 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0", "M10 14h4", "M3 14l1-5", "M21 14l-1-5"]} />,
  shirt: (p: IconProps) => <Stroke {...p} d={["M8 3l-5 4 2.5 3L7 9v12h10V9l1.5 1L21 7l-5-4c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"]} />,
  people: (p: IconProps) => <Stroke {...p} d={["M5 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M13 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M3 20c.6-3 2.6-5 5-5s4.4 2 5 5", "M11 20c.6-3 2.6-5 5-5s4.4 2 5 5"]} />,
  feather: (p: IconProps) => <Stroke {...p} d={["M20 4C12 5 6 10 5 19", "M20 4c-1 7-5 11-11 12", "M5 19l-1 2"]} />,
  nocamera: (p: IconProps) => <Stroke {...p} d={["M3 3l18 18", "M9.5 5.5L10 4h4l1.5 2.5H19a2 2 0 0 1 2 2v8", "M17.5 19H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 1.5-1.9"]} />,
  approve: (p: IconProps) => <Stroke {...p} d={["M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13", "M4 19h16", "M8.5 11.5l2.5 2.5 4.5-5"]} />,
  book: (p: IconProps) => <Stroke {...p} d={["M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13", "M4 19h16"]} />,
  // ideas de arranque y tonos
  cake: (p: IconProps) => <Stroke {...p} d={["M4 21h16", "M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7", "M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0", "M12 12V8"]} />,
  tree: (p: IconProps) => <Stroke {...p} d={["M12 3l5 7h-3l4 6h-4l3 4H7l3-4H6l4-6H7z", "M12 20v2"]} />,
  star: (p: IconProps) => <Stroke {...p} d={["M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z"]} />,
  bag: (p: IconProps) => <Stroke {...p} d={["M9 7h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4z", "M9 7V5a3 3 0 0 1 6 0v2", "M9 13h6"]} />,
  heart: (p: IconProps) => <Stroke {...p} d={["M12 20s-7-4.3-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.7 12 20 12 20z"]} />,
  moon: (p: IconProps) => <Stroke {...p} d={["M15 3a8 8 0 1 0 6 13A8 8 0 0 1 15 3z"]} />,
  tooth: (p: IconProps) => <Stroke {...p} d={["M7 4c-2 0-3 2-3 4 0 3 1 4 1.5 7S6 21 8 21s1.5-4 4-4 2 4 4 4 2-3 2.5-6S20 11 20 8c0-2-1-4-3-4-2 0-3 1-5 1S9 4 7 4z"]} />,
  smile: (p: IconProps) => <Stroke {...p} d={["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2", "M9 9.5h.01", "M15 9.5h.01"]} />,
};

/**
 * El libro como objeto: A4 vertical, ilustración 3:2 arriba con el título encima (como la portada del PDF) y la banda
 * con «para …». Las letras escalan con el ancho (unidades de contenedor), así sirve en pequeño y en grande.
 * `image`: lo que va en la ilustración (una <img>, un BookImage o nada: noche con estrellas).
 */
export function BookCover({
  name,
  title,
  from,
  image,
  src,
  alt = "",
  tilt = -3,
  className = "",
  placeholder = "aquí irá su portada",
}: {
  name: string;
  title?: string;
  from?: string;
  image?: React.ReactNode;
  src?: string;
  alt?: string;
  tilt?: number;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={`[container-type:inline-size] ${className}`}>
      <div
        className="relative flex aspect-[210/297] flex-col overflow-hidden rounded-[3px_12px_12px_3px] bg-[#fbf6ec] shadow-[4px_5px_0_#ede2ce,8px_10px_0_var(--edge),0_36px_60px_-28px_rgba(5,10,30,0.75)]"
        style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      >
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-night">
          {image ?? (src ? <img src={src} alt={alt} className="absolute inset-0 block h-full w-full object-cover" /> : <NightPlaceholder label={placeholder} />)}
          {title && (
            <>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-[rgba(15,20,40,0.62)] to-transparent" />
              <p className="display absolute top-[4%] right-[30%] left-[6%] m-0 text-[7.6cqw] leading-[1.04] text-moon [text-shadow:0_2px_12px_rgba(10,20,50,0.6)]">{title}</p>
            </>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-[6%] text-center">
          <span className="font-display text-[5cqw] text-mute italic">para</span>
          <span className="display text-[14.5cqw] leading-none text-ink">{name || "…"}</span>
          {from && <span className="mt-[3.5cqw] text-[2.9cqw] font-semibold tracking-[0.16em] text-mute uppercase">De parte de {from}</span>}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[4%] bg-gradient-to-r from-black/25 to-transparent" />
      </div>
    </div>
  );
}

function NightPlaceholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-night">
      <Sparkle className="twinkle absolute top-[12%] left-[9%]" size={12} />
      <Sparkle className="twinkle-slow absolute top-[34%] left-[60%]" size={8} color="var(--moon)" />
      <Moon className="absolute top-[8%] right-[7%]" size={30} />
      <span className="hand px-3 text-center text-[6.5cqw] text-moon-soft">{label}</span>
    </div>
  );
}
