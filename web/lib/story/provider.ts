/**
 * Proveedores del motor de historia (brief 5, §D). Solo servidor: las claves se leen del entorno en tiempo
 * de ejecución y nunca salen de aquí (ni al cliente ni a los logs).
 *
 * Selección por STORY_PROVIDER ∈ mock | anthropic | openai. Si falta la clave del elegido, se usa mock.
 */
import { composeMockStory } from "./mock";
import { promptFor, type StoryInput } from "./spec";

export interface GenerateResult {
  raw: string;
  model: string;
  usage?: { input: number; output: number };
  costCents?: number;
}

export interface StoryProvider {
  name: "mock" | "anthropic" | "openai";
  generate(input: StoryInput, opts?: { issues?: string[] }): Promise<GenerateResult>;
}

/** Modelo por defecto de cada proveedor. Único sitio donde se fija; STORY_MODEL lo sustituye. */
export const DEFAULT_MODELS = { anthropic: "claude-sonnet-4-5", openai: "gpt-4.1-mini" } as const;

const TIMEOUT_MS = 60_000;

/** Coste estimado en céntimos a partir de STORY_COST_CENTS_PER_1K_IN/OUT; sin ellas, 0 y no estimado. */
export function estimateCost(usage?: { input: number; output: number }): { costCents: number; costEstimated: boolean } {
  const inRate = Number(process.env.STORY_COST_CENTS_PER_1K_IN);
  const outRate = Number(process.env.STORY_COST_CENTS_PER_1K_OUT);
  if (!usage || !process.env.STORY_COST_CENTS_PER_1K_IN || !process.env.STORY_COST_CENTS_PER_1K_OUT || !Number.isFinite(inRate) || !Number.isFinite(outRate)) {
    return { costCents: 0, costEstimated: false };
  }
  return { costCents: Math.ceil((usage.input / 1000) * inRate + (usage.output / 1000) * outRate), costEstimated: true };
}

export const mockProvider: StoryProvider = {
  name: "mock",
  async generate(input) {
    return { raw: JSON.stringify(composeMockStory(input)), model: "mock-arc-v1", usage: { input: 0, output: 0 }, costCents: 0 };
  },
};

class ProviderError extends Error {
  constructor(provider: string, status: number) {
    // solo el código de estado: el cuerpo de la respuesta puede repetir la petición
    super(`${provider}_http_${status}`);
  }
}

function anthropicProvider(apiKey: string, model: string): StoryProvider {
  return {
    name: "anthropic",
    async generate(input, opts) {
      const { system, user } = promptFor(input, opts?.issues);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 3000, temperature: 0.9, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new ProviderError("anthropic", res.status);
      const json = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
      const raw = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      const usage = { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 };
      return { raw, model: json.model ?? model, usage, costCents: estimateCost(usage).costCents };
    },
  };
}

function openaiProvider(apiKey: string, model: string): StoryProvider {
  return {
    name: "openai",
    async generate(input, opts) {
      const { system, user } = promptFor(input, opts?.issues);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.9,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new ProviderError("openai", res.status);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const usage = { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 };
      return { raw, model: json.model ?? model, usage, costCents: estimateCost(usage).costCents };
    },
  };
}

/** Proveedor según el entorno. `requested` es lo que pedía STORY_PROVIDER (para dejar constancia si se cae a mock). */
export function selectProvider(env: Record<string, string | undefined> = process.env): { provider: StoryProvider; requested: string } {
  const requested = (env.STORY_PROVIDER || "mock").trim().toLowerCase();
  if (requested === "anthropic" && env.ANTHROPIC_API_KEY) return { provider: anthropicProvider(env.ANTHROPIC_API_KEY, env.STORY_MODEL || DEFAULT_MODELS.anthropic), requested };
  if (requested === "openai" && env.OPENAI_API_KEY) return { provider: openaiProvider(env.OPENAI_API_KEY, env.STORY_MODEL || DEFAULT_MODELS.openai), requested };
  return { provider: mockProvider, requested };
}
