"use client";

import type { BookView } from "./book/service";
import { VIEW_URL_REUSE_MS } from "./signing";

/**
 * Cliente de /api/libro/* y /api/generate/run. Las imágenes se pintan una por llamada: el navegador va pidiendo cada job
 * hasta que queda hecho o fallido (si el control de calidad lo devuelve a pendiente, se pide otra vez).
 */
export type JobOutcome = "done" | "failed" | "budget" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST con JSON. Nunca lanza (auditoría 26 oct, I9): sin red devuelve `status: 0` y `error: "network"`, y una respuesta
 * que no es JSON (un 504 de Vercel en HTML) devuelve `error: "server"`. Antes, sin cobertura, los botones se quedaban en
 * «Abriendo el pago…» para siempre.
 */
/**
 * Cuánto se espera a cada ruta (revisión 27 oct): con mala cobertura una petición se podía quedar colgada minutos. Las que
 * pintan, escriben o maquetan pueden tardar de verdad (hasta su maxDuration de 300 s; «Cambiar esta página», 120 s); el
 * resto responde en segundos.
 */
const LONG_ROUTES = ["/api/generate/run", "/api/libro/pages", "/api/libro/print", "/api/libro/retry", "/api/libro/sheet", "/api/libro/start", "/api/plan"];
export function timeoutFor(url: string): number {
  if (url === "/api/plan/page") return 135_000;
  // el PDF puede esperar su turno y pintarse (maxDuration 120 s, I10)
  if (url === "/api/libro/pdf") return 130_000;
  return LONG_ROUTES.includes(url) ? 310_000 : 45_000;
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ status: number; json: T & { ok?: boolean; error?: string; reason?: string; message?: string } }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutFor(url)) });
  } catch (e) {
    const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: 0, json: { ok: false, error: timeout ? "timeout" : "network" } as T & { ok?: boolean; error?: string } };
  }
  const json = (await res.json().catch(() => ({ ok: false, error: res.status >= 500 ? "server" : "json" }))) as T & { ok?: boolean; error?: string };
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
    const r: { status: number; json: { job?: { status?: string }; error?: string } } = await postJson("/api/generate/run", { jobId });
    if (r.status === 0) {
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

export type ViewResult = { ok: true; view: BookView } | { ok: false; error: "not_found" | "network" | "server" };

/**
 * La misma imagen, la misma URL (auditoría 26 oct, I20): la vista se pide cada vez que termina una página, y cada URL
 * firmada nueva hacía que el móvil volviera a descargar todas las imágenes. Se guarda la primera URL de cada archivo (la
 * URL sin el token) y se reutiliza 45 minutos: el servidor da URLs que valen al menos una hora (lib/signing.ts).
 */
const seenUrls = new Map<string, { url: string; at: number }>();
const REUSE_MS = VIEW_URL_REUSE_MS;

/** Una imagen que no carga con su URL guardada: la siguiente vista trae otra (revisión 27 oct). */
export function forgetUrl(url: string | null | undefined): void {
  if (!url) return;
  const key = url.split("?")[0];
  if (seenUrls.get(key)?.url === url) seenUrls.delete(key);
}

export function stableUrl(url: string | null, now = Date.now()): string | null {
  if (!url) return url;
  const key = url.split("?")[0];
  const prev = seenUrls.get(key);
  if (prev && now - prev.at < REUSE_MS) return prev.url;
  if (seenUrls.size > 500) for (const [k, v] of seenUrls) if (now - v.at >= REUSE_MS) seenUrls.delete(k);
  seenUrls.set(key, { url, at: now });
  return url;
}

function stableView(view: BookView): BookView {
  return { ...view, jobs: view.jobs.map((j) => (j.url ? { ...j, url: stableUrl(j.url) } : j)) };
}

/**
 * La vista del libro, distinguiendo «no existe» (404: caducado o enlace mal copiado) de «ahora no se puede» (sin red o
 * un error del servidor), que se reintenta (I9). Antes un 500 decía «Este enlace ya no es válido» a quien había pagado.
 */
export async function loadView(bookId: string, { tries = 3, wait = 1500 }: { tries?: number; wait?: number } = {}): Promise<ViewResult> {
  let last: "network" | "server" = "network";
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(wait * i);
    try {
      const res = await fetch(`/api/libro/view?b=${encodeURIComponent(bookId)}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      // 400: id mal formado; 404: no existe o caducó; 409: un libro del flujo antiguo
      if (res.status === 400 || res.status === 404 || res.status === 409) return { ok: false, error: "not_found" };
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) return { ok: true, view: stableView(json as BookView) };
      last = "server";
    } catch {
      last = "network";
    }
  }
  return { ok: false, error: last };
}

/** La vista del libro, de una vez (para refrescar mientras se pinta: si falla, se sigue con la que había). */
export async function fetchView(bookId: string): Promise<BookView | null> {
  const r = await loadView(bookId, { tries: 1 });
  return r.ok ? r.view : null;
}

/** Lo que se le dice al padre cuando su libro no se puede abrir. */
export function viewErrorMessage(error: Exclude<ViewResult, { ok: true }>["error"]): string {
  if (error === "not_found") return "Este enlace ya no es válido. Guardamos los libros 30 días.";
  if (error === "network") return "No hemos podido abrir tu libro: parece que no hay conexión. Recarga la página cuando vuelva. Tu libro sigue guardado.";
  return "No hemos podido abrir tu libro ahora mismo. Recarga la página en un momento. Tu libro sigue guardado.";
}

/** Mensaje para el padre a partir del error de una ruta de /api/libro. */
export function errorMessage(json: { error?: string; reason?: string; message?: string } | undefined, fallback = "Algo ha fallado. Inténtalo de nuevo."): string {
  if (!json) return fallback;
  if (json.message) return json.message;
  switch (json.error) {
    case "network":
      return "Sin conexión. Revisa la red e inténtalo de nuevo.";
    case "timeout":
      return "La conexión va muy lenta y no ha llegado la respuesta. Inténtalo de nuevo.";
    case "server":
      return "El servidor no responde ahora mismo. Inténtalo de nuevo en un momento.";
    case "budget":
      return json.reason?.includes("diario")
        ? "Hoy ya hemos pintado todas las ilustraciones que podemos. Vuelve mañana y seguimos donde lo dejaste."
        : "Ya has usado las ilustraciones de prueba de este email.";
    case "free_limit":
      return "Con este email ya tienes tres cuentos con dibujos este mes. Termina uno desde el enlace de su email y podrás seguir con este.";
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
    case "print_unavailable":
      return "El libro impreso todavía no está disponible.";
    case "already_hardcover":
      return "Este libro ya es de tapa dura. Recarga la página.";
    case "upgrade_closed":
      return "Ya no se puede pasar a tapa dura: el libro se borra en menos de un día.";
    case "upgrade_unavailable":
      return "Este libro no se puede pasar a tapa dura desde aquí. Escríbenos y lo vemos.";
    case "reason":
      return json.reason ?? "Dinos qué no te gusta de esta ilustración.";
    case "already_reported":
      return json.reason ?? "Ya nos has avisado de esta página.";
    case "test_order":
      return "Este libro se pagó en modo de prueba y no se imprime.";
    case "printed":
    case "already_sent":
      return "El libro ya está en la imprenta y no se puede cambiar.";
    default:
      return json.reason ?? fallback;
  }
}
