import Link from "next/link";
import { Wordmark } from "./SiteHeader";
import { OCASIONES, OCASIONES_PATH, ocasionPath } from "@/lib/ocasiones";
import { POSTHOG_ENABLED } from "@/lib/analytics";
import { CookieSettingsLink } from "./CookieConsent";

/** Footer común con los enlaces legales. No sale al imprimir. */
export function Footer() {
  return (
    <footer className="no-print border-t border-line" data-testid="footer">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-10 pb-28 text-sm text-ink-soft sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-2">
          <Wordmark className="text-ink" />
          <p className="max-w-[44ch]">Libros escritos y pintados para un solo lector.</p>
          <nav aria-label="Ocasiones" className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <Link href={OCASIONES_PATH} className="font-semibold hover:text-ink hover:underline">
              Cuentos personalizados
            </Link>
            {OCASIONES.map((o) => (
              <Link key={o.slug} href={ocasionPath(o.slug)} className="hover:text-ink hover:underline">
                {o.name}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
          <Link href="/#muestra" className="hover:text-ink hover:underline">
            Libro de muestra
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
          {POSTHOG_ENABLED && <CookieSettingsLink className="hover:text-ink hover:underline" />}
        </nav>
      </div>
    </footer>
  );
}
