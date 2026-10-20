/* eslint-disable @next/next/no-img-element -- URLs firmadas de Supabase de 1 h: next/image no aporta nada aquí */
import { Icon, Sparkle } from "@/components/brand";
import type { BookJobView } from "@/lib/book/service";
import { PaintingPlaceholder } from "./Waiting";

const BOX = "relative aspect-[3/2] w-full overflow-hidden rounded-[18px] bg-paper-deep";

/**
 * Imagen de un job (hoja, portada o página) con sus estados. Sin job todavía (se está cargando el libro) no dice nada:
 * solo el brillo de espera; «en cola» y «pintando» solo cuando lo están de verdad.
 * `scene` (páginas del libro): mientras se pinta, «se verá:» con su escena y una mancha que se va llenando.
 * `box`: clases del marco (por defecto 3:2 con esquinas redondeadas; dentro de BookCover, `absolute inset-0`; la imagen va siempre absoluta dentro del marco, para que ningún navegador la estire).
 */
export function BookImage({ job, alt, testId, title, scene, tint, box = BOX }: { job?: BookJobView; alt: string; testId?: string; title?: string; scene?: string; tint?: number; box?: string }) {
  if (!job) return <div className={`${box} shimmer`} data-testid={testId} data-state="loading" aria-busy="true" />;
  if (job.status === "pending" || job.status === "running") {
    const running = job.status === "running";
    if (scene)
      return (
        <div className={box} data-testid={testId} data-state="pending">
          <PaintingPlaceholder running={running} scene={scene} tint={tint} />
        </div>
      );
    return (
      <div className={`${box} shimmer grid place-items-center`} data-testid={testId} data-state="pending">
        <span className="hand flex items-center gap-2 text-[18px] text-ink-soft">
          {running ? <Icon.brush size={20} className="pen-write text-accent" /> : <Sparkle className="twinkle" size={14} color="var(--accent)" />}
          {running ? "pintando…" : "en cola…"}
        </span>
      </div>
    );
  }
  if (job.status === "failed") {
    return (
      <div className={`${box} grid place-items-center`} data-testid={testId} data-state="failed">
        <span className="px-6 text-center text-sm text-danger">{job.error === "budget" ? "Sin presupuesto para esta imagen hoy." : "No ha salido. Lo repetimos al reintentar."}</span>
      </div>
    );
  }
  if (!job.url) {
    // dry-run: sin imagen real
    return (
      <div className={`${box} locked-paper grid place-items-center`} data-testid={testId} data-state="placeholder">
        <span className="hand px-6 text-center text-[17px] text-ink-soft">ilustración de prueba (sin coste)</span>
        {title && <span className="display absolute top-4 left-5 text-2xl">{title}</span>}
      </div>
    );
  }
  return (
    <div className={box} data-testid={testId} data-state="done">
      <img src={job.url} alt={alt} className="rise absolute inset-0 block h-full w-full object-cover" />
      {title && <div aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[rgba(15,20,40,0.5)] to-transparent" />}
      {title && (
        <span className="display absolute top-4 right-5 left-5 text-2xl text-moon sm:text-4xl" style={{ textShadow: "0 2px 12px rgba(10,20,50,.5)" }}>
          {title}
        </span>
      )}
    </div>
  );
}
