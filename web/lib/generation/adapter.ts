/**
 * Adaptador de generación de imágenes (RF-9). Interfaz única, implementaciones sustituibles.
 * Selección por GENERATION_PROVIDER: "dry-run" (por defecto, sin coste) | "openai-images".
 *
 * IMPORTANTE: la implementación openai-images hace llamadas de pago. Solo se ejecuta desde el worker
 * del Mac Mini con OPENAI_API_KEY en su entorno y para libros pagados. Nunca desde el cliente.
 */
import { sheetPrompt, scenePrompt } from "./prompts";
import type { StyleDef } from "./styles";

/** Referencia de imagen: ruta local (worker) o URL https (p. ej. URL firmada de Storage). */
export type ImageRef = { path: string } | { url: string };

export interface GeneratedImage {
  /** PNG en bytes (proveedor real) o null en dry-run. */
  data: Uint8Array | null;
  /** Ruta placeholder (dry-run) o nombre sugerido. */
  placeholder?: string;
}

export interface GenerationResult {
  images: GeneratedImage[];
  costCents: number;
  provider: string;
  model: string;
  prompt: string;
}

export interface GenerationAdapter {
  name: string;
  /** Hoja de personaje: turnaround + 6 expresiones, con el ancla del estilo como referencia. */
  generateSheet(traitsEn: string, style: StyleDef, opts?: { candidates?: number }): Promise<GenerationResult>;
  /** Escena: hoja aprobada + ancla como referencias (máx. 3 refs, RF-10). */
  generateScene(sheetRef: ImageRef, style: StyleDef, scenePromptText: string, opts?: { candidates?: number; extraRef?: ImageRef }): Promise<GenerationResult>;
}

/** Coste estimado por imagen en céntimos (configurable; medir el real en la Fase 0). */
export function estimatedCostCents(): number {
  const v = Number(process.env.GENERATION_COST_CENTS_PER_IMAGE ?? "7");
  return Number.isFinite(v) && v >= 0 ? v : 7;
}

/* ------------------------------ dry-run ------------------------------ */

export const dryRunAdapter: GenerationAdapter = {
  name: "dry-run",
  async generateSheet(traitsEn, style, opts) {
    const prompt = sheetPrompt(traitsEn, style);
    const n = opts?.candidates ?? 1;
    return {
      images: Array.from({ length: n }, (_, i) => ({ data: null, placeholder: `dry-run/${style.id}/sheet-${i + 1}.png` })),
      costCents: 0,
      provider: "dry-run",
      model: "none",
      prompt,
    };
  },
  async generateScene(_sheetRef, style, scenePromptText, opts) {
    const prompt = scenePrompt(scenePromptText, style);
    const n = opts?.candidates ?? 2;
    return {
      images: Array.from({ length: n }, (_, i) => ({ data: null, placeholder: `dry-run/${style.id}/scene-${i + 1}.png` })),
      costCents: 0,
      provider: "dry-run",
      model: "none",
      prompt,
    };
  },
};

/* --------------------------- openai-images --------------------------- */

export interface OpenAIImageRequest {
  url: string;
  model: string;
  prompt: string;
  n: number;
  size: string;
  quality: string;
  refs: ImageRef[];
}

/** Construye la petición a /v1/images/edits sin ejecutarla (se puede inspeccionar y testear sin coste). */
export function buildOpenAIImageRequest(prompt: string, refs: ImageRef[], n: number): OpenAIImageRequest {
  if (refs.length > 3) throw new Error("máximo 3 referencias por llamada (RF-10)");
  return {
    url: "https://api.openai.com/v1/images/edits",
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    prompt,
    n,
    size: process.env.OPENAI_IMAGE_SIZE ?? "1536x1024",
    quality: process.env.OPENAI_IMAGE_QUALITY ?? "medium",
    refs,
  };
}

async function refToBlob(ref: ImageRef): Promise<Blob> {
  if ("url" in ref) {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`referencia no disponible (${res.status})`);
    return await res.blob();
  }
  const { readFile } = await import("node:fs/promises");
  const { isAbsolute, resolve } = await import("node:path");
  // rutas relativas (p. ej. assets/raw/… del ancla) se resuelven contra la raíz del repo
  const root = process.env.CUENTOS_REPO_ROOT ?? resolve(process.cwd(), "..");
  const buf = await readFile(isAbsolute(ref.path) ? ref.path : resolve(root, ref.path));
  return new Blob([new Uint8Array(buf)], { type: "image/png" });
}

async function executeOpenAI(req: OpenAIImageRequest): Promise<GenerationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no está definida en el entorno del worker");
  const form = new FormData();
  form.append("model", req.model);
  form.append("prompt", req.prompt);
  form.append("n", String(req.n));
  form.append("size", req.size);
  form.append("quality", req.quality);
  for (const [i, ref] of req.refs.entries()) form.append("image[]", await refToBlob(ref), `ref-${i}.png`);
  const res = await fetch(req.url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const images = (json.data ?? []).map((d) => ({ data: d.b64_json ? Uint8Array.from(Buffer.from(d.b64_json, "base64")) : null }));
  return { images, costCents: images.length * estimatedCostCents(), provider: "openai-images", model: req.model, prompt: req.prompt };
}

export const openAIImagesAdapter: GenerationAdapter = {
  name: "openai-images",
  async generateSheet(traitsEn, style, opts) {
    const req = buildOpenAIImageRequest(sheetPrompt(traitsEn, style), [{ path: style.anchorPath }], opts?.candidates ?? 1);
    return executeOpenAI(req);
  },
  async generateScene(sheetRef, style, scenePromptText, opts) {
    const refs: ImageRef[] = [sheetRef, { path: style.anchorPath }];
    if (opts?.extraRef) refs.push(opts.extraRef);
    const req = buildOpenAIImageRequest(scenePrompt(scenePromptText, style), refs, opts?.candidates ?? 2);
    return executeOpenAI(req);
  },
};

export function getAdapter(provider = process.env.GENERATION_PROVIDER ?? "dry-run"): GenerationAdapter {
  if (provider === "openai-images") return openAIImagesAdapter;
  if (provider === "dry-run") return dryRunAdapter;
  throw new Error(`GENERATION_PROVIDER desconocido: ${provider}`);
}
