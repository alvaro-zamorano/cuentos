import Link from "next/link";

/** Plantilla común de las páginas legales. Todas son borradores hasta la revisión por abogado (PRD §9, §15.5). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-lg font-black tracking-tight">
          cuentos<span className="text-coral">.</span>
        </Link>
      </header>
      <article className="legal mx-auto max-w-3xl px-5 pb-16">
        <p className="mb-6 rounded-2xl border-2 border-dashed border-coral bg-white px-4 py-3 text-sm font-black text-coral" role="note" data-testid="legal-draft">
          Borrador pendiente de revisión legal
        </p>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">Última actualización: {updated}</p>
        <div className="mt-6 grid gap-4 leading-relaxed">{children}</div>
      </article>
    </main>
  );
}

/** Hueco que hay que rellenar antes de publicar (titular, NIF, dirección…). */
export function Pending({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-sun/40 px-1 font-bold">[{children}]</span>;
}
