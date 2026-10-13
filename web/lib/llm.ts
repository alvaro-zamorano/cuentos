/**
 * Llamada genérica a un LLM de texto (planificador, dirección de arte, control de calidad). Solo servidor: las claves
 * se leen del entorno al llamar y nunca salen de aquí (ni al cliente ni a los logs).
 *
 * Proveedor: STORY_PROVIDER ∈ mock | anthropic | openai; sin él, Anthropic si hay ANTHROPIC_API_KEY, si no mock
 * (misma regla que lib/story/provider.ts). Modelo por tarea: PLAN_MODEL, ART_MODEL, QC_MODEL; si faltan, STORY_MODEL;
 * si falta, el de DEFAULT_MODEL.
 */

export type LlmName = "anthropic" | "openai" | "mock";
export type Task = "plan" | "art" | "qc";

export type Block = { type: "text"; text: string } | { type: "image"; mimeType: string; data: string /* base64 */ };
export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface LlmRequest {
  system: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;
}

export interface LlmResult {
  raw: string;
  model: string;
  usage: { input: number; output: number };
  ms: number;
  stop?: string;
  /** Tipos de bloque de la respuesta (diagnóstico: text, thinking…). */
  blocks?: string[];
}

export interface Llm {
  name: LlmName;
  model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export const DEFAULT_MODEL: Record<Exclude<LlmName, "mock">, Record<Task, string>> = {
  // 13 oct: los más recientes disponibles para la clave (/api/dev?task=models). Haiku 5.5 basta para traducir y revisar.
  anthropic: { plan: "claude-sonnet-5-5", art: "claude-haiku-5-5", qc: "claude-haiku-5-5" },
  openai: { plan: "gpt-4.1-mini", art: "gpt-4.1-mini", qc: "gpt-4.1-mini" },
};

/** Precio por millón de tokens (USD) de los modelos que usamos; sin precio conocido, coste 0 y sin estimar. */
const PRICES: Record<string, { in: number; out: number }> = {
  // platform.claude.com/docs/en/about-claude/pricing (13 oct 2026); Haiku 5.5 con prompts < 100k tokens
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-4-5": { in: 5, out: 25 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
};

/** Coste en céntimos de dólar (con decimales) de una llamada. */
export function llmCostCents(model: string, usage: { input: number; output: number }): number | null {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  if (!key) return null;
  const p = PRICES[key];
  return ((usage.input * p.in + usage.output * p.out) / 1e6) * 100;
}

class LlmError extends Error {
  constructor(provider: string, status: number, detail?: string) {
    // solo código y tipo de error del proveedor: el cuerpo podría repetir la petición
    super(`${provider}_http_${status}${detail ? `_${detail}` : ""}`);
  }
}

const TIMEOUT_MS = 120_000;

/** Modelos que no aceptan `temperature` («`temperature` is deprecated for this model», /api/dev?task=ping, 13 oct). */
const NO_TEMPERATURE: RegExp[] = [/^claude-(sonnet|haiku|opus|fable|mythos)-5/];
function noTemperature(model: string): boolean {
  return NO_TEMPERATURE.some((re) => re.test(model));
}

function anthropic(apiKey: string, model: string): Llm {
  return {
    name: "anthropic",
    model,
    async complete(req) {
      const t0 = Date.now();
      const messages = req.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((b) => (b.type === "text" ? b : { type: "image", source: { type: "base64", media_type: b.mimeType, data: b.data } })),
      }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: req.maxTokens, ...(req.temperature !== undefined && !noTemperature(model) ? { temperature: req.temperature } : {}), system: req.system, messages }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
        // el mensaje de error de Anthropic describe el parámetro que falla; no repite la clave ni el prompt
        throw new LlmError("anthropic", res.status, [body?.error?.type, body?.error?.message?.slice(0, 160)].filter(Boolean).join(": "));
      }
      const json = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string; stop_reason?: string };
      return {
        raw: (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
        model: json.model ?? model,
        usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 },
        ms: Date.now() - t0,
        stop: json.stop_reason,
        blocks: (json.content ?? []).map((c) => c.type),
      };
    },
  };
}

function openai(apiKey: string, model: string): Llm {
  return {
    name: "openai",
    model,
    async complete(req) {
      const t0 = Date.now();
      const messages = [
        { role: "system", content: req.system },
        ...req.messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : m.content.map((b) => (b.type === "text" ? b : { type: "image_url", image_url: { url: `data:${b.mimeType};base64,${b.data}` } })),
        })),
      ];
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: req.temperature ?? 0.8, max_tokens: req.maxTokens, response_format: { type: "json_object" }, messages }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new LlmError("openai", res.status);
      const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      return {
        raw: json.choices?.[0]?.message?.content ?? "",
        model: json.model ?? model,
        usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 },
        ms: Date.now() - t0,
        stop: json.choices?.[0]?.finish_reason,
      };
    },
  };
}

export const MOCK_LLM: Llm = {
  name: "mock",
  model: "mock",
  async complete() {
    throw new Error("mock_llm_no_completa: usa el mock de cada tarea");
  },
};

const MODEL_ENV: Record<Task, string> = { plan: "PLAN_MODEL", art: "ART_MODEL", qc: "QC_MODEL" };

export function selectLlm(task: Task, env: Record<string, string | undefined> = process.env): Llm {
  const requested = (env.STORY_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : "mock")).trim().toLowerCase();
  const model = (name: "anthropic" | "openai") => env[MODEL_ENV[task]]?.trim() || env.STORY_MODEL?.trim() || DEFAULT_MODEL[name][task];
  if (requested === "anthropic" && env.ANTHROPIC_API_KEY) return anthropic(env.ANTHROPIC_API_KEY.trim(), model("anthropic"));
  if (requested === "openai" && env.OPENAI_API_KEY) return openai(env.OPENAI_API_KEY.trim(), model("openai"));
  return MOCK_LLM;
}

/** Extrae el primer objeto JSON de una respuesta (tolerante a texto o bloque de código alrededor). */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(raw.slice(start, end + 1));
}
