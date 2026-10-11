/**
 * Orquestación del motor de historia: proveedor → JSON → validación → un reintento con los motivos → arco base.
 * Lo llama solo la ruta /api/story (servidor).
 */
import { buildArcBook, scenePromptFor } from "../story";
import type { Draft, Story } from "../types";
import { estimateCost, type StoryProvider } from "./provider";
import { BEATS, fillBeat, sceneBaseFor, storyInputFromDraft, type StoryInput } from "./spec";
import { extractJson, validateStory, type StoryOutput, type Validation } from "./validate";

export interface GenerateStoryResult {
  story: Story;
  provider: string;
  model: string;
  fallback: boolean;
  validation: Validation;
  attempts: number;
  usage: { input: number; output: number };
  costCents: number;
  costEstimated: boolean;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Historia validada → Story del borrador (escenas acotadas a las del beat, scenePrompt en inglés con rasgos). */
export function toStory(out: StoryOutput, input: StoryInput, draft: Draft, provider: string, model: string): Story {
  const pages = BEATS.map((b) => {
    const p = out.pages.find((x) => x.n === b.n)!;
    const scene = b.scenes.includes(p.scene as never) ? (p.scene as (typeof b.scenes)[number]) : b.scenes[0];
    const withCompanion = !!p.withCompanion && !!draft.companion;
    const sceneBrief = (typeof p.sceneBrief === "string" && p.sceneBrief.trim()) || fillBeat(b.brief, input);
    return {
      n: b.n,
      scene,
      expression: p.expression as Story["pages"][number]["expression"],
      withCompanion,
      text: p.text.trim(),
      sceneBrief,
      scenePrompt: scenePromptFor(sceneBaseFor(scene, sceneBrief), draft, withCompanion),
    };
  });
  return { id: newId(), provider, model, pages, title: out.title.trim(), dedication: out.dedication.trim(), inputHash: input.inputHash, createdAt: Date.now() };
}

/** El arco de siempre empaquetado como Story (fallback: true). */
export function arcStory(draft: Draft, inputHash: string): Story {
  const book = buildArcBook({ ...draft, textOverrides: {} });
  return {
    id: newId(),
    provider: "arc",
    model: "cumpleanos",
    title: book.title,
    dedication: book.dedication,
    pages: book.pages.map((p) => ({ ...p })),
    inputHash,
    createdAt: Date.now(),
    fallback: true,
  };
}

export async function generateStory(draft: Draft, provider: StoryProvider): Promise<GenerateStoryResult> {
  const input = storyInputFromDraft(draft);
  const usage = { input: 0, output: 0 };
  let issues: string[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    try {
      const gen = await provider.generate(input, attempt > 0 ? { issues } : undefined);
      usage.input += gen.usage?.input ?? 0;
      usage.output += gen.usage?.output ?? 0;
      let parsed: unknown;
      try {
        parsed = extractJson(gen.raw);
      } catch {
        issues = ["La respuesta no era JSON válido. Devuelve solo el objeto JSON."];
        continue;
      }
      const validation = validateStory(parsed, input);
      if (validation.ok) {
        const cost = estimateCost(usage);
        return {
          story: toStory(parsed as StoryOutput, input, draft, provider.name, gen.model),
          provider: provider.name,
          model: gen.model,
          fallback: false,
          validation,
          attempts,
          usage,
          ...(provider.name === "mock" ? { costCents: 0, costEstimated: false } : cost),
        };
      }
      issues = validation.issues;
    } catch (e) {
      issues = [`Error del proveedor (${e instanceof Error ? e.message : "desconocido"}).`];
    }
  }

  // motivo en el log del servidor: nunca la clave ni el prompt
  console.warn(`[story] fallback al arco base (${provider.name}, ${attempts} intentos): ${issues.slice(0, 6).join(" | ")}`);
  const cost = provider.name === "mock" ? { costCents: 0, costEstimated: false } : estimateCost(usage);
  return {
    story: arcStory(draft, input.inputHash),
    provider: provider.name,
    model: "cumpleanos",
    fallback: true,
    validation: { ok: false, issues },
    attempts,
    usage,
    ...cost,
  };
}
