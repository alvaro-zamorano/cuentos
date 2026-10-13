/**
 * Control de calidad tras cada imagen (PLAN §3.3, regla 6): un modelo de visión compara la imagen con el prompt con el
 * que se pintó y solo la rechaza por problemas claros (texto pintado, rasgos clave cambiados, personajes de más o de
 * menos, anatomía rota). Si falla, el job se repite una vez antes de enseñarla.
 */
import { extractJsonObject, llmCostCents, selectLlm, type Llm } from "../llm";

export interface QcResult {
  pass: boolean;
  problems: string[];
  model: string;
  costCents: number | null;
}

const SYSTEM = [
  "You are the quality checker of a children's picture book. You get an illustration and the exact prompt used to generate it.",
  "Reject ONLY for clear, visible problems a parent would notice:",
  "1. Any readable text, letters, numbers or signs painted in the image.",
  "2. A recurring character whose key features contradict the prompt: hair colour or shape, skin tone, glasses present/absent, species or breed, clearly different age.",
  "3. Missing a character the prompt requires, or an extra recurring-looking character that should not be there.",
  "4. Broken anatomy: extra or missing limbs, fused bodies, distorted faces, more than five fingers clearly visible.",
  "For a character reference sheet, also reject if the main character's views do not look like the same person.",
  "Style, composition, small colour shifts and minor background details are NOT problems.",
  'Answer only JSON: {"pass": true|false, "problems": ["short description", ...]}',
].join("\n");

export async function qcImage(jpeg: Uint8Array, prompt: string, llm: Llm = selectLlm("qc")): Promise<QcResult | null> {
  if (llm.name === "mock") return null;
  try {
    const res = await llm.complete({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") },
            { type: "text", text: `Prompt used:\n${prompt}\n\nCheck the illustration. JSON only.` },
          ],
        },
      ],
      maxTokens: 400,
    });
    const raw = extractJsonObject(res.raw) as { pass?: unknown; problems?: unknown };
    const problems = Array.isArray(raw.problems) ? raw.problems.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 160)).slice(0, 5) : [];
    return { pass: raw.pass !== false, problems, model: res.model, costCents: llmCostCents(res.model, res.usage) };
  } catch (e) {
    // sin control de calidad no se bloquea la imagen: se enseña y queda anotado
    console.warn(`[qc] ${e instanceof Error ? e.message : "error"}`);
    return null;
  }
}
