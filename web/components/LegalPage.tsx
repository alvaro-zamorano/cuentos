import { SiteHeader } from "./SiteHeader";

/**
 * Plantilla común de las páginas legales. Sin revisión de abogado todavía (PRD §9, §15.5): el aviso de borrador sale
 * en la preview y no en producción, donde se publican tal cual (decisión de Álvaro, 20 oct).
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <SiteHeader />
      <article className="legal mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        {process.env.VERCEL_ENV !== "production" && (
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

/** Hueco que hay que rellenar antes de publicar (titular, NIF, dirección…). */
export function Pending({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[3px] bg-paper-deep px-1 text-ink-soft">[{children}]</span>;
}

/** El email de contacto como enlace, o el hueco. */
export function ContactEmail({ value }: { value?: string }) {
  return value ? (
    <a href={`mailto:${value}`} className="link">
      {value}
    </a>
  ) : (
    <Pending>email de contacto</Pending>
  );
}
