/**
 * Planificador (B1): ficha → moderación → LLM → normalización → validación → una corrección en la misma conversación.
 * También reescribe una página con la petición del padre (paso 3: «cambia esta página con una frase»).
 * Solo servidor (lo llaman las rutas /api/plan*). No registra la ficha ni el prompt.
 */
import { extractJsonObject, llmCostCents, selectLlm, type Llm, type Message } from "../llm";
import { fichaHash, normalizeFicha } from "./ficha";
import { mockPlan } from "./mock";
import { blockedWord, contactData, moderateFicha } from "./moderation";
import { fixMessage, plannerSystem, plannerUser, rewriteSystem, rewriteUser } from "./prompt";
import { inventedFamily, normalizePlan, validatePage, validatePlan, type Issue, type PlanValidation } from "./validate";
import type { Ficha, Plan, PlanPage, PlanRecord } from "./types";

export interface Usage {
  input: number;
  output: number;
}

export interface PlanOk {
  ok: true;
  record: PlanRecord;
  /** Avisos que quedaron (solo leves) tras el último intento. */
  warnings: string[];
  attempts: number;
  usage: Usage;
  costCents: number | null;
  ms: number;
  /** Motivos del primer intento cuando hubo corrección (diagnóstico; no se devuelve al cliente). */
  firstIssues?: string[];
}

export interface PlanFail {
  ok: false;
  status: number;
  error: "moderation" | "refusal" | "provider" | "invalid" | "input";
  message: string;
  field?: string;
  issues?: string[];
  /** Lo que costó llegar al fallo si se llamó al modelo (revisión 26 oct: el texto que falla también cuenta en el tope). */
  costCents?: number | null;
}

const MAX_TOKENS_PLAN = 6000;
const MAX_TOKENS_PAGE = 1200;
/** Lo que se deja a la ruta para responder después del último intento, y lo mínimo que se da a un intento. */
const REWRITE_MARGIN_MS = 5_000;
const MIN_ATTEMPT_MS = 20_000;

function refusalOf(parsed: unknown): string | null {
  const r = (parsed as { refusal?: unknown } | null)?.refusal;
  return typeof r === "string" && r.trim() ? r.trim().slice(0, 240) : null;
}

const msgs = (issues: Issue[]) => issues.map((i) => i.msg);

export async function planBook(fichaIn: unknown, llm: Llm = selectLlm("plan")): Promise<PlanOk | PlanFail> {
  const f = normalizeFicha(fichaIn);
  if (!f.hero.name) return { ok: false, status: 400, error: "input", field: "hero.name", message: "Falta el nombre del protagonista." };
  const mod = moderateFicha(f);
  if (!mod.ok) return { ok: false, status: 422, error: "moderation", field: mod.field, message: mod.message! };
  const hash = fichaHash(f);
  const t0 = Date.now();

  if (llm.name === "mock") {
    const plan = mockPlan(f);
    return { ok: true, record: { plan, provider: "mock", model: "mock-plan-v1", fichaHash: hash, createdAt: Date.now() }, warnings: [], attempts: 1, usage: { input: 0, output: 0 }, costCents: 0, ms: Date.now() - t0 };
  }

  const usage: Usage = { input: 0, output: 0 };
  const messages: Message[] = [{ role: "user", content: plannerUser(f) }];
  let last: { plan: Plan; validation: PlanValidation; model: string } | null = null;
  let attempts = 0;
  let firstIssues: string[] | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    let raw: string;
    let model = llm.model;
    try {
      const res = await llm.complete({ system: plannerSystem(), messages, maxTokens: MAX_TOKENS_PLAN, temperature: 0.9 });
      usage.input += res.usage.input;
      usage.output += res.usage.output;
      raw = res.raw;
      model = res.model;
      // solo métricas, nunca el contenido
      console.info(`[plan] ${model} intento ${attempt + 1}: ${res.ms} ms, ${res.usage.output} tokens de salida, parada ${res.stop ?? "?"}, bloques ${(res.blocks ?? []).join("+")}`);
    } catch (e) {
      console.warn(`[plan] proveedor: ${e instanceof Error ? e.message : "error"}`);
      if (attempt === 0) continue;
      return { ok: false, status: 502, error: "provider", message: "No hemos podido escribir el cuento ahora mismo. Inténtalo de nuevo en un momento.", costCents: llmCostCents(llm.model, usage) };
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(raw);
    } catch {
      messages.push({ role: "assistant", content: raw.slice(0, 20_000) || "(vacío)" }, { role: "user", content: fixMessage(["La respuesta no era JSON válido."]) });
      continue;
    }
    const refusal = refusalOf(parsed);
    if (refusal) return { ok: false, status: 422, error: "refusal", message: `No podemos escribir este cuento: ${refusal}`, costCents: llmCostCents(model, usage) };

    const plan = normalizePlan(parsed, f);
    const validation = validatePlan(plan, f);
    last = { plan, validation, model };
    if (!needsFix(validation.issues)) break;
    if (attempt === 0) firstIssues = msgs(validation.issues);
    messages.push({ role: "assistant", content: raw }, { role: "user", content: fixMessage(msgs(validation.issues)) });
  }

  const ms = Date.now() - t0;
  if (!last || !last.validation.usable) {
    // solo cuántos avisos: su texto lleva nombres del cuento (auditoría 26 oct, I24)
    console.warn(`[plan] sin plan válido tras ${attempts} intentos: ${last ? `${last.validation.issues.length} avisos` : "sin respuesta"}`);
    return { ok: false, status: 502, error: "invalid", message: "No hemos podido escribir el cuento ahora mismo. Inténtalo de nuevo.", issues: last ? msgs(last.validation.issues) : [], costCents: llmCostCents(last?.model ?? llm.model, usage) };
  }
  return {
    ok: true,
    record: { plan: last.plan, provider: llm.name, model: last.model, fichaHash: hash, createdAt: Date.now() },
    warnings: msgs(last.validation.issues),
    attempts,
    usage,
    costCents: llmCostCents(last.model, usage),
    ms,
    firstIssues,
  };
}

/** ¿Merece otra vuelta? Lo grave sí; también si faltan detalles reales o hay nombres inventados. Longitudes, no. */
function needsFix(issues: Issue[]): boolean {
  return issues.some((i) => i.hard || /detalles reales|nombres propios/.test(i.msg));
}

/* ------------------------------ cambiar una página ------------------------------ */

export interface PageOk {
  ok: true;
  page: PlanPage;
  warnings: string[];
  usage: Usage;
  costCents: number | null;
  ms: number;
}

/** Plan que viene del cliente: se normaliza contra la ficha y tiene que ser usable para tocar una página. */
export function planFromClient(f: Ficha, v: unknown): Plan | null {
  const plan = normalizePlan(v, f);
  return plan.pages.length === 12 ? plan : null;
}

/**
 * `deadline` (ms desde epoch): cuándo tiene que haber terminado todo, intentos incluidos. Menores de la auditoría 26 oct:
 * la ruta tiene 120 s y daba hasta 120 s a cada uno de los dos intentos; ahora cada intento espera lo que queda y, si no
 * da para otro, no se empieza.
 */
export async function rewritePage(fichaIn: unknown, planIn: unknown, nIn: unknown, instructionIn: unknown, llm: Llm = selectLlm("plan"), opts: { deadline?: number } = {}): Promise<PageOk | PlanFail> {
  const f = normalizeFicha(fichaIn);
  const plan = planFromClient(f, planIn);
  const n = Number(nIn);
  const instruction = typeof instructionIn === "string" ? instructionIn.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (!plan || !Number.isInteger(n) || n < 1 || n > 12) return { ok: false, status: 400, error: "input", message: "Petición incompleta." };
  if (!instruction) return { ok: false, status: 400, error: "input", field: "instruction", message: "Escribe qué quieres cambiar." };
  const bad = blockedWord(instruction) ?? contactData(instruction);
  if (bad) return { ok: false, status: 422, error: "moderation", field: "instruction", message: `Eso no lo podemos poner en un cuento infantil («${bad}»).` };
  const t0 = Date.now();

  if (llm.name === "mock") {
    const old = plan.pages[n - 1];
    const page: PlanPage = { ...old, text: `${old.text} ${instruction.charAt(0).toUpperCase()}${instruction.slice(1).replace(/[.\s]*$/, ".")}` };
    return { ok: true, page, warnings: [], usage: { input: 0, output: 0 }, costCents: 0, ms: Date.now() - t0 };
  }

  // la petición del padre puede traer nombres nuevos («que salga su prima Lola»): cuentan como escritos por él
  const fWithAsk: Ficha = { ...f, details: [...f.details, instruction] };
  const usage: Usage = { input: 0, output: 0 };
  const messages: Message[] = [{ role: "user", content: rewriteUser(f, plan, n, instruction) }];
  let lastIssues: Issue[] = [];
  let lastPage: PlanPage | null = null;
  let model = llm.model;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 2; attempt++) {
    // un intento con menos de 20 s no suele terminar: mejor responder ya que esperar a que Vercel corte la ruta
    const left = deadline - Date.now() - REWRITE_MARGIN_MS;
    if (left < MIN_ATTEMPT_MS) return { ok: false, status: 504, error: "provider", message: "No hemos podido cambiar la página ahora mismo. Inténtalo de nuevo.", costCents: llmCostCents(model, usage) };
    let raw: string;
    try {
      const res = await llm.complete({ system: rewriteSystem(), messages, maxTokens: MAX_TOKENS_PAGE, temperature: 0.8, ...(Number.isFinite(left) ? { timeoutMs: left } : {}) });
      usage.input += res.usage.input;
      usage.output += res.usage.output;
      raw = res.raw;
      model = res.model;
    } catch (e) {
      console.warn(`[plan/page] proveedor: ${e instanceof Error ? e.message : "error"}`);
      if (attempt === 0) continue;
      return { ok: false, status: 502, error: "provider", message: "No hemos podido cambiar la página ahora mismo. Inténtalo de nuevo.", costCents: llmCostCents(model, usage) };
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(raw);
    } catch {
      messages.push({ role: "assistant", content: raw.slice(0, 5000) || "(vacío)" }, { role: "user", content: fixMessage(["La respuesta no era JSON válido."]) });
      continue;
    }
    const refusal = refusalOf(parsed);
    if (refusal) return { ok: false, status: 422, error: "refusal", message: `No podemos hacer ese cambio: ${refusal}`, costCents: llmCostCents(model, usage) };
    // se normaliza como un plan de una página para reutilizar los tipos
    const candidate = normalizePlan({ ...plan, pages: [{ ...(parsed as object), n }] }, fWithAsk).pages[0];
    const merged: Plan = { ...plan, pages: plan.pages.map((p) => (p.n === n ? candidate : p)) };
    const issues = validatePage(candidate, fWithAsk, merged);
    // familiares: valen los que el padre pide ahora o ya están en su cuento, también en el texto de esta misma página
    // (lo pudo escribir él, revisión 26 oct); el modelo no puede inventar otros (B6)
    const kin = inventedFamily({ extraCast: plan.extraCast, pages: [candidate] }, fWithAsk, [plan.title, plan.dedication, ...plan.pages.map((p) => p.text)]);
    if (kin.length) issues.push({ msg: `Aparecen familiares que el adulto no ha puesto (${kin.join(", ")}): quítalos del texto y de extras.`, hard: true });
    if (!candidate.who.includes("hero") && merged.pages.filter((p) => p.who.includes("hero")).length < 10) {
      issues.push({ msg: "El protagonista tiene que salir en esta imagen (who).", hard: true });
    }
    lastIssues = issues;
    lastPage = candidate;
    if (issues.length === 0) break;
    messages.push({ role: "assistant", content: raw }, { role: "user", content: fixMessage(msgs(issues)) });
  }
  if (!lastPage || lastIssues.some((i) => i.hard)) {
    return { ok: false, status: 502, error: "invalid", message: "No hemos podido cambiar la página así. Prueba a pedirlo de otra manera.", issues: msgs(lastIssues), costCents: llmCostCents(model, usage) };
  }
  return { ok: true, page: lastPage, warnings: msgs(lastIssues), usage, costCents: llmCostCents(model, usage), ms: Date.now() - t0 };
}
