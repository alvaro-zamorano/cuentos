import { SiteHeader } from "./SiteHeader";

/** Plantilla común de las páginas legales. Todas son borradores hasta la revisión por abogado (PRD §9, §15.5). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <SiteHeader />
      <article className="legal mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <p className="notice mb-8" role="note" data-testid="legal-draft">
          Borrador pendiente de revisión legal
        </p>
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
