"use client";

import type { BookView } from "./book/service";

/**
 * Cliente de /api/libro/* y /api/generate/run. Las imágenes se pintan una por llamada: el navegador va pidiendo cada job
 * hasta que queda hecho o fallido (si el control de calidad lo devuelve a pendiente, se pide otra vez).
 */
export type JobOutcome = "done" | "failed" | "budget" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ status: number; json: T & { ok?: boolean; error?: string; reason?: string; message?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({ ok: false, error: "json" }))) as T & { ok?: boolean; error?: string };
  return { status: res.status, json };
}

/**
 * Pinta un job: llama a /api/generate/run hasta que termina. Si lo está pintando el servidor en segundo plano (o otra
 * pestaña), espera a que acabe: hasta 6 minutos en total (una imagen con su repetición tarda ~1–2 min).
 */
export async function runJob(jobId: string, signal?: { cancelled: boolean }, maxMs = 6 * 60_000): Promise<JobOutcome> {
  let networkErrors = 0;
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    if (signal?.cancelled) return "error";
    let r: { status: number; json: { job?: { status?: string }; error?: string } };
    try {
      r = await postJson("/api/generate/run", { jobId });
    } catch {
      if (++networkErrors > 2) return "error";
      await sleep(3000);
      continue;
    }
    if (r.status === 409 && r.json.error === "waiting_sheet") {
      await sleep(4000);
      continue;
    }
    if (r.status === 429) return "budget";
    if (r.status >= 500 && r.status !== 503) {
      if (++networkErrors > 2) return "error";
      await sleep(3000);
      continue;
    }
    if (r.status !== 200) return "error";
    const st = r.json.job?.status;
    if (st === "done") return "done";
    if (st === "failed") return "failed";
    // pending (repetición por control de calidad) o running en otra pestaña: se vuelve a pedir
    await sleep(st === "running" ? 6000 : 500);
  }
  return "error";
}

/** Pinta varios jobs con `concurrency` a la vez; `onEach` se llama al terminar cada uno. */
export async function runJobs(ids: string[], concurrency: number, onEach: (id: string, out: JobOutcome) => void, signal?: { cancelled: boolean }) {
  const queue = [...ids];
  const worker = async () => {
    while (queue.length && !signal?.cancelled) {
      const id = queue.shift()!;
      onEach(id, await runJob(id, signal));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

export async function fetchView(bookId: string): Promise<BookView | null> {
  try {
    const res = await fetch(`/api/libro/view?b=${encodeURIComponent(bookId)}`, { cache: "no-store" });
    const json = await res.json();
    return res.ok && json.ok ? (json as BookView) : null;
  } catch {
    return null;
  }
}

/** Mensaje para el padre a partir del error de una ruta de /api/libro. */
export function errorMessage(json: { error?: string; reason?: string; message?: string } | undefined, fallback = "Algo ha fallado. Inténtalo de nuevo."): string {
  if (!json) return fallback;
  if (json.message) return json.message;
  switch (json.error) {
    case "budget":
      return json.reason?.includes("diario")
        ? "Hoy ya hemos pintado todas las ilustraciones que podemos. Vuelve mañana y seguimos donde lo dejaste."
        : "Ya has usado las ilustraciones de prueba de este email.";
    case "max_versions":
      return json.reason ?? "Ya no quedan más versiones.";
    case "moderation":
      return json.reason ?? "Eso no lo podemos poner en un cuento infantil.";
    case "rate_limited":
      return "Demasiadas peticiones seguidas. Espera un poco.";
    case "consent":
      return "Falta marcar la declaración.";
    case "email":
      return "Revisa el email.";
    case "waiver_required":
      return "Falta marcar la casilla de encima del botón.";
    case "payment_unavailable":
      return "El pago todavía no está disponible.";
    case "already_paid":
      return "Este libro ya está pagado. Recarga la página.";
    case "stripe":
      return "No hemos podido abrir el pago. Inténtalo de nuevo en un momento.";
    case "not_paid":
      return "El pago aún no nos ha llegado. Recarga la página en un momento.";
    case "storage_unavailable":
      return "Ahora mismo no podemos guardar el libro. Inténtalo más tarde.";
    default:
      return json.reason ?? fallback;
  }
}
