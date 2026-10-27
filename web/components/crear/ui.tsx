import { Sparkle } from "@/components/brand";

/** Aviso de algo en marcha (escribir, pintar, confirmar el pago): una estrella que parpadea y el texto. */
export function Status({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="rise flex items-start gap-3 rounded-2xl bg-butter/70 px-4 py-3 text-[15px] leading-snug text-ink" aria-live="polite" data-testid={testId}>
      <Sparkle className="twinkle mt-0.5 shrink-0" size={16} color="var(--accent)" />
      <span>{children}</span>
    </p>
  );
}

/** Error visible, en el mismo sitio que los avisos. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-[#f6ded6] px-4 py-3 text-[15px] leading-snug text-danger">{children}</p>;
}

/** El libro no se ha podido cargar (sin red o error del servidor, I9): lo dice y deja volver a intentarlo. */
export function LoadError({ text }: { text: string }) {
  return (
    <div className="grid gap-3 rounded-2xl bg-[#f6ded6] px-4 py-3.5 text-[15px] leading-snug text-danger" role="alert" data-testid="load-error">
      <p className="m-0">{text}</p>
      <div>
        <button type="button" className="btn-soft" onClick={() => window.location.reload()}>
          Volver a intentarlo
        </button>
      </div>
    </div>
  );
}

/** Lámina pegada con cinta (la hoja de personajes, como en la landing). */
export function Taped({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-1 -rotate-[0.6deg] rounded-[6px] bg-white p-2.5 shadow-[0_2px_0_#e6d8c1,0_30px_50px_-34px_rgba(35,32,54,0.6)] sm:p-3.5">
      <span aria-hidden className="absolute -top-3 left-[10%] h-6 w-20 -rotate-[4deg] bg-[#f3d58a]/75" />
      <span aria-hidden className="absolute -top-3 right-[10%] h-6 w-20 rotate-[5deg] bg-[#f3d58a]/75" />
      {children}
    </div>
  );
}
