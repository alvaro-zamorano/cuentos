/**
 * Pintar en segundo plano (con `after()` en las rutas): la hoja, la portada y las páginas se terminan aunque el padre
 * cierre la pestaña. El cliente sigue pidiendo los mismos jobs; el bloqueo optimista de runJob evita pintar dos veces.
 */
import { runJob } from "../generation/service";
import type { GenerationAdapter } from "../generation/adapter";
import type { GenStore } from "../generation/store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PaintOutcome = "done" | "failed" | "budget" | "timeout";

/** Pinta un job hasta que termina (incluida la repetición del control de calidad) o se acaba el tiempo. */
export async function paintJob(store: GenStore, adapter: GenerationAdapter, jobId: string, deadline: number): Promise<PaintOutcome> {
  while (Date.now() < deadline) {
    const r = await runJob(store, jobId, adapter).catch(() => null);
    if (!r) return "failed";
    if (!r.ok) {
      if (r.error === "waiting_sheet") {
        await sleep(3000);
        continue;
      }
      return r.status === 429 ? "budget" : "failed";
    }
    if (r.job.status === "done") return "done";
    if (r.job.status === "failed") return "failed";
    // pending tras el control de calidad: otra vuelta; running en otra petición: esperar
    await sleep(r.job.status === "running" ? 5000 : 200);
  }
  return "timeout";
}

/** Pinta varios jobs, `concurrency` a la vez, hasta `deadline` (ms epoch). */
export async function paintAll(store: GenStore, adapter: GenerationAdapter, ids: string[], { concurrency = 3, deadline }: { concurrency?: number; deadline: number }): Promise<Record<string, PaintOutcome>> {
  const out: Record<string, PaintOutcome> = {};
  const queue = [...ids];
  let stop = false;
  const worker = async () => {
    while (queue.length && !stop) {
      const id = queue.shift()!;
      const o = await paintJob(store, adapter, id, deadline);
      out[id] = o;
      if (o === "budget") stop = true;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return out;
}

/** Origen público para los enlaces de los emails: SITE_URL o el de la petición. */
export function publicOrigin(req: Request): string {
  const env = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
