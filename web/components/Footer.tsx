import Link from "next/link";
import { Wordmark } from "./SiteHeader";
import { OCASIONES, OCASIONES_PATH, ocasionPath } from "@/lib/ocasiones";
import { POSTHOG_ENABLED } from "@/lib/analytics";
import { CookieSettingsLink } from "./CookieConsent";
import { titular } from "@/lib/legal";

/**
 * Footer común con los enlaces legales. No sale al imprimir. Cada enlace mide 44 px de alto, lo que pide un dedo
 * (mirada de usuario de la auditoría: eran unos 20 px).
 */
const LINK = "inline-flex min-h-11 items-center hover:text-ink hover:underline";
export function Footer() {
  // el email de contacto, a la vista en todas las páginas (auditoría 26 oct): antes solo estaba en el aviso legal
  const email = titular().email;
  return (
    <footer className="no-print border-t border-line" data-testid="footer">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-10 pb-28 text-sm text-ink-soft sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-2">
          <Wordmark className="text-ink" />
          <p className="max-w-[44ch]">Libros escritos y pintados para un solo lector.</p>
          {email && (
            <p data-testid="footer-contact">
              ¿Dudas? Escríbenos a{" "}
              <a href={`mailto:${email}`} className="font-semibold text-ink hover:underline">
                {email}
              </a>
            </p>
          )}
          <nav aria-label="Ocasiones" className="mt-1 flex flex-wrap gap-x-5">
            <Link href={OCASIONES_PATH} className={`font-semibold ${LINK}`}>
              Cuentos personalizados
            </Link>
            {OCASIONES.map((o) => (
              <Link key={o.slug} href={ocasionPath(o.slug)} className={LINK}>
                {o.name}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex flex-wrap gap-x-6" aria-label="Legal">
          <Link href="/#muestra" className={LINK}>
            Libro de muestra
          </Link>
          <Link href="/privacidad" className={LINK}>
            Privacidad
          </Link>
          <Link href="/condiciones" className={LINK}>
            Condiciones
          </Link>
          <Link href="/aviso-legal" className={LINK}>
            Aviso legal
          </Link>
          {POSTHOG_ENABLED && <CookieSettingsLink className={LINK} />}
        </nav>
      </div>
    </footer>
  );
}
