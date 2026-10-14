"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicJob } from "./generation/service";

export type GenJobView = PublicJob;

export interface GenerationState {
  jobs: GenJobView[] | null;
  provider: string | null;
  /** Sin conexión con /api/generate/status. */
  offline: boolean;
  /** Un job pagado espera por el tope diario de gasto (429). */
  paused: boolean;
}

const POLL_MS = 2000;
const PAUSE_MS = 30_000;

/**
 * Generación desde el cliente, sin worker externo: consulta GET /api/generate/status cada 2 s y lanza
 * POST /api/generate/run para los jobs pendientes DE UNO EN UNO (nunca en paralelo: controla el gasto y la duración).
 * Solo ejecuta los jobs que `want` acepta (los de la huella actual): uno obsoleto (p. ej. de otro estilo) se queda
 * sin pintar. Deja de consultar cuando no queda nada pendiente entre los que quiere; `refresh()` vuelve a empezar.
 * Si el usuario cierra y vuelve, retoma desde el estado del servidor.
 */
export function useGeneration(bookId: string | undefined, want: (j: GenJobView) => boolean = () => true) {
  const [state, setState] = useState<GenerationState>({ jobs: null, provider: null, offline: false, paused: false });
  const [nonce, setNonce] = useState(0);
  const running = useRef(false);
  const wantRef = useRef(want);
  useEffect(() => {
    wantRef.current = want;
  });

  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pausedUntil = 0;
    const schedule = (ms: number) => {
      if (alive) timer = setTimeout(tick, ms);
    };

    async function tick() {
      let data: { ok?: boolean; jobs?: GenJobView[]; provider?: string } | null = null;
      try {
        const res = await fetch(`/api/generate/status?bookId=${encodeURIComponent(bookId!)}`, { cache: "no-store" });
        data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error("status");
      } catch {
        if (!alive) return;
        setState((s) => ({ ...s, offline: true }));
        return schedule(POLL_MS * 2);
      }
      if (!alive) return;
      const jobs = data.jobs ?? [];
      setState((s) => ({ ...s, jobs, provider: data.provider ?? null, offline: false, paused: Date.now() < pausedUntil }));
      const open = jobs.filter((j) => wantRef.current(j) && (j.status === "pending" || j.status === "running"));
      if (open.length === 0) return; // terminado: no se vuelve a consultar hasta refresh()
      // el servidor devuelve los jobs en orden de ejecución (hoja, muestra, páginas, portada)
      const next = open.find((j) => j.status === "pending") ?? open[0];
      if (running.current || Date.now() < pausedUntil) return schedule(POLL_MS);
      running.current = true;
      let ran = false;
      try {
        const res = await fetch("/api/generate/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: next.id }),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 429) pausedUntil = Date.now() + PAUSE_MS;
        ran = res.ok && !!json?.ran;
      } catch {
        /* red: se reintenta en la siguiente consulta */
      } finally {
        running.current = false;
      }
      schedule(ran ? 0 : POLL_MS);
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [bookId, nonce]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
