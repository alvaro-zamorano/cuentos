import { SiteHeader } from "./SiteHeader";
import { DEFAULT_CONTACT } from "@/lib/legal";

/**
 * Plantilla común de las páginas legales. Son borradores hasta la revisión por abogado (PRD §9, §15.5): el aviso se ve
 * en las previews, no en producción.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const draft = process.env.VERCEL_ENV !== "production";
  return (
    <main className="flex-1">
      <SiteHeader />
      <article className="legal mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        {draft && (
          <p className="notice mb-8" role="note" data-testid="legal-draft">
            Borrador pendiente de revisión legal
          </p>
        )}
        <h1 className="display text-[34px] md:text-[44px]">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Última actualización: {updated}</p>
        <div className="mt-8 grid max-w-[68ch] gap-4 leading-relaxed">{children}</div>
      </article>
    </main>
  );
}

/** El email de contacto como enlace (LEGAL_EMAIL o, sin él, el de la marca). */
export function ContactEmail({ value }: { value?: string }) {
  const email = value ?? DEFAULT_CONTACT;
  return (
    <a href={`mailto:${email}`} className="link">
      {email}
    </a>
  );
}
