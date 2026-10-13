/* eslint-disable @next/next/no-img-element -- URLs firmadas de Supabase de 1 h: next/image no aporta nada aquí */
import type { BookJobView } from "@/lib/book/service";

/** Imagen de un job (hoja, portada o página) con sus estados: pendiente, pintando, prueba sin coste, fallida. */
export function BookImage({ job, alt, testId, title }: { job?: BookJobView; alt: string; testId?: string; title?: string }) {
  const box = "relative aspect-[3/2] w-full overflow-hidden rounded-[6px] border border-line bg-paper-deep";
  if (!job || job.status === "pending" || job.status === "running") {
    return (
      <div className={`${box} grid place-items-center`} data-testid={testId} data-state="pending">
        <span className="animate-pulse text-sm text-ink-soft">{job?.status === "running" ? "Pintando…" : "En cola…"}</span>
      </div>
    );
  }
  if (job.status === "failed") {
    return (
      <div className={`${box} grid place-items-center`} data-testid={testId} data-state="failed">
        <span className="text-sm text-[#8a2a1c]">{job.error === "budget" ? "Sin presupuesto para esta imagen hoy." : "No ha salido. Lo repetimos al reintentar."}</span>
      </div>
    );
  }
  if (!job.url) {
    // dry-run: sin imagen real
    return (
      <div className={`${box} grid place-items-center`} data-testid={testId} data-state="placeholder">
        <span className="px-6 text-center text-sm text-ink-soft">Ilustración de prueba (modo sin coste)</span>
        {title && <span className="display absolute left-5 top-4 text-2xl">{title}</span>}
      </div>
    );
  }
  return (
    <div className={box} data-testid={testId} data-state="done">
      <img src={job.url} alt={alt} className="h-full w-full object-cover" />
      {title && (
        <span className="display absolute left-5 right-5 top-4 text-2xl text-[#fbf3df] sm:text-4xl" style={{ textShadow: "0 2px 12px rgba(10,20,50,.5)" }}>
          {title}
        </span>
      )}
    </div>
  );
}
