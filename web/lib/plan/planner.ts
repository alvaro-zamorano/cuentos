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
import { normalizePlan, validatePage, validatePlan, type Issue, type PlanValidation } from "./validate";
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
}

export interface PlanFail {
  ok: false;
  status: number;
  error: "moderation" | "refusal" | "provider" | "invalid" | "input";
  message: string;
  field?: string;
  issues?: string[];
}

const MAX_TOKENS_PLAN = 6000;
const MAX_TOKENS_PAGE = 1200;

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
    } catch (e) {
      console.warn(`[plan] proveedor: ${e instanceof Error ? e.message : "error"}`);
      if (attempt === 0) continue;
      return { ok: false, status: 502, error: "provider", message: "No hemos podido escribir el cuento ahora mismo. Inténtalo de nuevo en un momento." };
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(raw);
    } catch {
      messages.push({ role: "assistant", content: raw.slice(0, 20_000) || "(vacío)" }, { role: "user", content: fixMessage(["La respuesta no era JSON válido."]) });
      continue;
    }
    const refusal = refusalOf(parsed);
    if (refusal) return { ok: false, status: 422, error: "refusal", message: `No podemos escribir este cuento: ${refusal}` };

    const plan = normalizePlan(parsed, f);
    const validation = validatePlan(plan, f);
    last = { plan, validation, model };
    if (validation.ok) break;
    messages.push({ role: "assistant", content: raw }, { role: "user", content: fixMessage(msgs(validation.issues)) });
  }

  const ms = Date.now() - t0;
  if (!last || !last.validation.usable) {
    console.warn(`[plan] sin plan válido tras ${attempts} intentos: ${last ? msgs(last.validation.issues).slice(0, 6).join(" | ") : "sin respuesta"}`);
    return { ok: false, status: 502, error: "invalid", message: "No hemos podido escribir el cuento ahora mismo. Inténtalo de nuevo.", issues: last ? msgs(last.validation.issues) : [] };
  }
  return {
    ok: true,
    record: { plan: last.plan, provider: llm.name, model: last.model, fichaHash: hash, createdAt: Date.now() },
    warnings: msgs(last.validation.issues),
    attempts,
    usage,
    costCents: llmCostCents(last.model, usage),
    ms,
  };
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

export async function rewritePage(fichaIn: unknown, planIn: unknown, nIn: unknown, instructionIn: unknown, llm: Llm = selectLlm("plan")): Promise<PageOk | PlanFail> {
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
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      const res = await llm.complete({ system: rewriteSystem(), messages, maxTokens: MAX_TOKENS_PAGE, temperature: 0.8 });
      usage.input += res.usage.input;
      usage.output += res.usage.output;
      raw = res.raw;
      model = res.model;
    } catch (e) {
      console.warn(`[plan/page] proveedor: ${e instanceof Error ? e.message : "error"}`);
      if (attempt === 0) continue;
      return { ok: false, status: 502, error: "provider", message: "No hemos podido cambiar la página ahora mismo. Inténtalo de nuevo." };
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(raw);
    } catch {
      messages.push({ role: "assistant", content: raw.slice(0, 5000) || "(vacío)" }, { role: "user", content: fixMessage(["La respuesta no era JSON válido."]) });
      continue;
    }
    const refusal = refusalOf(parsed);
    if (refusal) return { ok: false, status: 422, error: "refusal", message: `No podemos hacer ese cambio: ${refusal}` };
    // se normaliza como un plan de una página para reutilizar los tipos
    const candidate = normalizePlan({ ...plan, pages: [{ ...(parsed as object), n }] }, fWithAsk).pages[0];
    const merged: Plan = { ...plan, pages: plan.pages.map((p) => (p.n === n ? candidate : p)) };
    const issues = validatePage(candidate, fWithAsk, merged);
    if (!candidate.who.includes("hero") && merged.pages.filter((p) => p.who.includes("hero")).length < 10) {
      issues.push({ msg: "El protagonista tiene que salir en esta imagen (who).", hard: true });
    }
    lastIssues = issues;
    lastPage = candidate;
    if (issues.length === 0) break;
    messages.push({ role: "assistant", content: raw }, { role: "user", content: fixMessage(msgs(issues)) });
  }
  if (!lastPage || lastIssues.some((i) => i.hard)) {
    return { ok: false, status: 502, error: "invalid", message: "No hemos podido cambiar la página así. Prueba a pedirlo de otra manera.", issues: msgs(lastIssues) };
  }
  return { ok: true, page: lastPage, warnings: msgs(lastIssues), usage, costCents: llmCostCents(model, usage), ms: Date.now() - t0 };
}
