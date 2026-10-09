/**
 * Worker de generación — pensado para correr en el Mac Mini (no en Vercel).
 *
 *   cd web && npx tsx scripts/worker.ts            # bucle (WORKER_POLL_MS, 15 s por defecto)
 *   cd web && npx tsx scripts/worker.ts --once     # una pasada y sale
 *
 * Variables (en web/.env.local del Mac Mini, nunca en el repo):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   acceso a cuentos_* y al bucket privado `cuentos`
 *   GENERATION_PROVIDER = dry-run | openai-images         dry-run por defecto (sin coste)
 *   OPENAI_API_KEY                                       solo con openai-images
 *   MAX_COST_CENTS_PER_BOOK                              tope de coste por libro (por defecto 300)
 *   GENERATION_COST_CENTS_PER_IMAGE                      estimación por imagen (por defecto 7)
 *
 * Reglas: tope de intentos = 1 (un job que falla queda en `error` y no se reintenta solo);
 * antes de cada job se comprueba el tope de coste del libro; nunca hay bucles de regeneración.
 * También borra los libros caducados (expires_at < now) — datos del niño a 30 días (PRD §9).
 */
import { createAdminClient } from "../lib/supabase/admin";
import { estimatedCostCents, getAdapter, type GenerationResult, type ImageRef } from "../lib/generation/adapter";
import { getStyle } from "../lib/generation/styles";

const MAX_ATTEMPTS = 1;
const BUCKET = "cuentos";

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function loadEnvFile() {
  // carga web/.env.local si existe, sin imprimir valores
  try {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sin .env.local: se usan las variables del entorno */
  }
}

type Db = NonNullable<ReturnType<typeof createAdminClient>>;

async function spentCents(db: Db, bookId: string): Promise<number> {
  const { data } = await db.from("cuentos_generation_jobs").select("cost_cents").eq("book_id", bookId);
  return (data ?? []).reduce((a, r) => a + (r.cost_cents ?? 0), 0);
}

async function signedSheetRef(db: Db, sheetJobId: string): Promise<ImageRef | null> {
  const { data } = await db.from("cuentos_generation_jobs").select("chosen").eq("id", sheetJobId).maybeSingle();
  if (!data?.chosen) return null;
  if (data.chosen.startsWith("dry-run/")) return { path: data.chosen };
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(data.chosen, 600);
  return signed ? { url: signed.signedUrl } : null;
}

async function storeCandidates(db: Db, bookId: string, jobId: string, result: GenerationResult): Promise<string[]> {
  const out: string[] = [];
  for (const [i, img] of result.images.entries()) {
    if (!img.data) {
      out.push(img.placeholder ?? `dry-run/${jobId}-${i + 1}.png`);
      continue;
    }
    const path = `books/${bookId}/${jobId}/${i + 1}.png`;
    const { error } = await db.storage.from(BUCKET).upload(path, img.data, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`storage: ${error.message}`);
    out.push(path);
  }
  return out;
}

async function processJob(db: Db, job: { id: string; book_id: string; kind: string; style_id: string; prompt: string; references: unknown }) {
  // reclamar: pending -> running, solo si no ha agotado intentos
  const { data: claimed } = await db
    .from("cuentos_generation_jobs")
    .update({ status: "running", attempts: MAX_ATTEMPTS })
    .eq("id", job.id)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const fail = (error: string, status: "error" | "skipped" = "error") =>
    db.from("cuentos_generation_jobs").update({ status, error }).eq("id", job.id);

  const style = getStyle(job.style_id);
  if (!style) return void (await fail(`estilo desconocido: ${job.style_id}`));

  const adapter = getAdapter();
  const candidates = job.kind === "sheet" ? 1 : 2;
  const cap = Number(env("MAX_COST_CENTS_PER_BOOK", "300"));
  const projected = adapter.name === "dry-run" ? 0 : candidates * estimatedCostCents();
  if ((await spentCents(db, job.book_id)) + projected > cap) return void (await fail(`tope de coste por libro (${cap} c) alcanzado`, "skipped"));

  try {
    let result: GenerationResult;
    if (job.kind === "sheet") {
      result = await adapter.generateSheet(job.prompt, style, { candidates });
    } else {
      const refs = Array.isArray(job.references) ? (job.references as { kind?: string; job_id?: string }[]) : [];
      const sheetJob = refs.find((r) => r.kind === "sheet")?.job_id;
      const sheetRef = sheetJob ? await signedSheetRef(db, sheetJob) : null;
      if (!sheetRef) return void (await fail("hoja de personaje sin aprobar"));
      result = await adapter.generateScene(sheetRef, style, job.prompt, { candidates });
    }
    const stored = await storeCandidates(db, job.book_id, job.id, result);
    await db
      .from("cuentos_generation_jobs")
      .update({ status: "done", candidates: stored, cost_cents: result.costCents, error: null })
      .eq("id", job.id);
    console.log(`[worker] ${job.kind} ${job.id} → ${stored.length} candidatos (${adapter.name}, ${result.costCents} c)`);
  } catch (e) {
    await fail(e instanceof Error ? e.message.slice(0, 500) : "error");
    console.error(`[worker] ${job.kind} ${job.id} error`);
  }
}

async function purgeExpired(db: Db) {
  const { data } = await db.from("cuentos_books").delete().lt("expires_at", new Date().toISOString()).select("id");
  if (data?.length) console.log(`[worker] borrados ${data.length} libros caducados`);
}

async function tick(db: Db) {
  await purgeExpired(db);
  const { data: jobs, error } = await db
    .from("cuentos_generation_jobs")
    .select("id, book_id, kind, style_id, prompt, references")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Number(env("WORKER_BATCH", "4")));
  if (error) {
    console.error("[worker] lectura de jobs:", error.message);
    return;
  }
  for (const job of jobs ?? []) await processJob(db, job);
}

async function main() {
  await loadEnvFile();
  const db = createAdminClient();
  if (!db) {
    console.error("[worker] faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Nada que hacer.");
    process.exit(2);
  }
  console.log(`[worker] proveedor=${getAdapter().name} tope=${env("MAX_COST_CENTS_PER_BOOK", "300")} c/libro`);
  const once = process.argv.includes("--once");
  do {
    await tick(db);
    if (!once) await new Promise((r) => setTimeout(r, Number(env("WORKER_POLL_MS", "15000"))));
  } while (!once);
}

main();
