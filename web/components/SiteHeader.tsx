import Link from "next/link";

/** Marca: «cuentos» en la serif display. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[22px] font-semibold italic leading-none tracking-[-0.01em] ${className}`} style={{ fontVariationSettings: '"opsz" 144' }}>
      cuentos
    </span>
  );
}

/** Cabecera común: marca a la izquierda y, a la derecha, lo que necesite cada página. */
export function SiteHeader({ children, wide = false }: { children?: React.ReactNode; wide?: boolean }) {
  return (
    <header className={`no-print mx-auto flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      <Link href="/" aria-label="cuentos, inicio" className="text-ink">
        <Wordmark />
      </Link>
      {children}
    </header>
  );
}
