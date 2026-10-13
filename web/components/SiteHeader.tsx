import Link from "next/link";
import { Sparkle } from "./brand";

/** Marca: «cuentos» en Lora cursiva (sin «f»), con su estrella. */
export function Wordmark({ className = "", star = true }: { className?: string; star?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display text-[26px] leading-none font-semibold tracking-[-0.01em] italic ${className}`}>
      {star && <Sparkle size={14} className="-mt-1" />}
      cuentos
    </span>
  );
}

/**
 * Cabecera común: marca a la izquierda y, a la derecha, lo que necesite cada página. `night`: sobre la portada en
 * noche de la landing.
 */
export function SiteHeader({ children, wide = false, night = false }: { children?: React.ReactNode; wide?: boolean; night?: boolean }) {
  return (
    <header className={`no-print ${night ? "bg-night text-moon" : "text-ink"}`}>
      <div className={`mx-auto flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <Link href="/" aria-label="cuentos, inicio" className={night ? "text-moon" : "text-ink"}>
          <Wordmark />
        </Link>
        {children}
      </div>
    </header>
  );
}
