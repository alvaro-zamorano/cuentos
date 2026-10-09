import Link from "next/link";
import { Wordmark } from "./SiteHeader";

/** Footer común con los enlaces legales. No sale al imprimir. */
export function Footer() {
  return (
    <footer className="no-print border-t border-line" data-testid="footer">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 pt-10 text-sm text-ink-soft sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-2">
          <Wordmark className="text-ink" />
          <p className="max-w-[44ch]">Cuentos personalizados, escritos e ilustrados para un solo lector.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
          <Link href="/gratis" className="hover:text-ink hover:underline">
            Cuento de muestra
          </Link>
          <Link href="/privacidad" className="hover:text-ink hover:underline">
            Privacidad
          </Link>
          <Link href="/condiciones" className="hover:text-ink hover:underline">
            Condiciones
          </Link>
          <Link href="/aviso-legal" className="hover:text-ink hover:underline">
            Aviso legal
          </Link>
        </nav>
      </div>
    </footer>
  );
}
