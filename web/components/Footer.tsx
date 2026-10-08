import Link from "next/link";

/** Footer común con los enlaces legales. No sale al imprimir. */
export function Footer() {
  return (
    <footer className="no-print border-t-2 border-line bg-cream" data-testid="footer">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 pb-24 text-sm text-ink-soft">
        <span className="font-black text-ink">
          cuentos<span className="text-coral">.</span>
        </span>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal">
          <Link href="/gratis" className="hover:underline">
            Cuento gratis
          </Link>
          <Link href="/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/condiciones" className="hover:underline">
            Condiciones
          </Link>
          <Link href="/aviso-legal" className="hover:underline">
            Aviso legal
          </Link>
        </nav>
      </div>
    </footer>
  );
}
