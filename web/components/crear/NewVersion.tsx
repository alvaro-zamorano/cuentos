"use client";

import { useEffect, useRef, useState } from "react";
import type { BookJobView } from "@/lib/book/service";
import { Icon } from "@/components/brand";

/*
 * Una versión nueva de una imagen ya hecha (otra versión de una página, un cambio en los personajes), 30 oct. Antes se
 * seguía viendo la anterior sin ninguna marca y el único aviso quedaba lejos, arriba del paso. Ahora el aviso va encima
 * de la propia imagen, la versión nueva sale en los botones de versión mientras se pinta y, al terminar, se marca como
 * «nueva» unos segundos. Sin tiempo orientativo (Álvaro) ni porcentaje: el modelo no dice cuánto le falta.
 */

export const inFlight = (j?: BookJobView) => j?.status === "pending" || j?.status === "running";

/** Encima de la imagen que se va a sustituir: la de debajo se sigue viendo, atenuada, para comparar. */
export function PaintingOverlay({ variant, asked, testId }: { variant: number; asked?: string | null; testId?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[rgba(251,246,236,0.55)] p-4" role="status" data-testid={testId}>
      <div className="rise grid max-w-[85%] justify-items-center gap-1 rounded-2xl bg-card px-5 py-3 text-center shadow-[0_18px_40px_-24px_rgba(35,32,54,0.55)]">
        <span className="hand flex items-center gap-2 text-[19px] text-ink">
          <Icon.brush size={20} className="brush-dab text-accent" />
          pintando la versión {variant}…
        </span>
        {asked && <span className="line-clamp-2 text-[13px] text-ink-soft">Has pedido: {asked}</span>}
      </div>
    </div>
  );
}

/** La versión que acaba de terminar mientras se miraba (pasó de pintándose a hecha): unos segundos marcada como «nueva». */
export function useFreshVersion(jobs: BookJobView[]): string | null {
  const painting = useRef(new Set<string>());
  const [fresh, setFresh] = useState<string | null>(null);
  const ids = jobs.map((j) => `${j.id}:${j.status}`).join(",");
  useEffect(() => {
    let done: string | null = null;
    for (const j of jobs) {
      if (inFlight(j)) painting.current.add(j.id);
      else if (painting.current.delete(j.id) && j.status === "done") done = j.id;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacciona a un cambio que llega del servidor
    if (done) setFresh(done);
    // `ids` resume lo que importa de `jobs` (que es un array nuevo en cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 8000);
    return () => clearTimeout(t);
  }, [fresh]);
  return fresh;
}

/** Botón de versión con su estado: pintándose (sin poder elegirla), nueva o normal. */
export function versionLabel(j: BookJobView, n: number, fresh: string | null): React.ReactNode {
  if (inFlight(j))
    return (
      <>
        Versión {n} <span className="font-normal opacity-80">· pintando…</span>
      </>
    );
  if (j.id === fresh)
    return (
      <>
        Versión {n} <span className="font-normal text-accent-deep">· nueva</span>
      </>
    );
  return <>Versión {n}</>;
}
