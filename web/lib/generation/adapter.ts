/**
 * Adaptador de generación de imágenes (RF-9). Interfaz única, implementaciones sustituibles.
 * Selección por GENERATION_PROVIDER: "dry-run" (por defecto, sin coste) | "gemini-images" | "openai-images".
 *
 * IMPORTANTE: gemini-images y openai-images hacen llamadas de pago. Solo se ejecutan desde el worker del
 * Mac Mini o desde scripts/fase0.mjs, con la clave en el entorno. Nunca desde el cliente.
 * Las funciones build*Request construyen la petición sin enviarla (se testean sin red).
 */
import { sheetPrompt, scenePrompt } from "./prompts";
import type { StyleDef } from "./styles";

/** Referencia de imagen: ruta local (worker) o URL https (p. ej. URL firmada de Storage). */
export type ImageRef = { path: string } | { url: string };

/** Referencia ya cargada en memoria (lo que viaja como inline_data en Gemini). */
export interface InlineImage {
  mimeType: string;
  data: Uint8Array;
  /** Solo para informes: de dónde salió (ruta o "url"). */
  label?: string;
}

/** Formato de salida: hoja de personaje cuadrada; páginas apaisadas 3:2. */
export type ImageAspect = "square" | "landscape";

export interface GeneratedImage {
  /** PNG en bytes (proveedor real) o null en dry-run. */
  data: Uint8Array | null;
  /** Ruta placeholder (dry-run) o nombre sugerido. */
  placeholder?: string;
  mimeType?: string;
}

export interface GenerationResult {
  images: GeneratedImage[];
  costCents: number;
  provider: string;
  model: string;
  prompt: string;
  /** Uso que devuelva la API (tokens), tal cual; un elemento por llamada. */
  usage?: unknown[];
}

export interface SceneOptions {
  candidates?: number;
  extraRef?: ImageRef;
  /** Descripción canónica del niño (characterBible) para redeclararla en la página. */
  bible?: string;
}

/** Imagen v2 (flujo nuevo): el prompt llega completo y las referencias ya resueltas. */
export interface ImageOptions {
  aspect: "3:2" | "1:1";
  size: ImageSize;
}
export type ImageSize = "1K" | "2K" | "4K";

export interface GenerationAdapter {
  name: string;
  /** Flujo nuevo (lib/plan/art.ts): prompt final + referencias (hoja, ancla), formato y resolución explícitos. */
  generateImage(prompt: string, refs: ImageRef[], opts: ImageOptions): Promise<GenerationResult>;
  /** Hoja de personaje: turnaround + 6 expresiones, con el ancla del estilo como referencia. `traitsEn` = characterBible. */
  generateSheet(traitsEn: string, style: StyleDef, opts?: { candidates?: number }): Promise<GenerationResult>;
  /** Escena: hoja aprobada + ancla como referencias (máx. 3 refs, RF-10). */
  generateScene(sheetRef: ImageRef, style: StyleDef, scenePromptText: string, opts?: SceneOptions): Promise<GenerationResult>;
}

export const MAX_REFS = 3;

/** Coste estimado por imagen en céntimos por proveedor si GENERATION_COST_CENTS_PER_IMAGE no está definida. */
export const DEFAULT_COST_CENTS: Record<string, number> = { "gemini-images": 4, "openai-images": 8, "dry-run": 0 };

/**
 * Coste por resolución (céntimos de dólar, redondeado hacia arriba con la entrada de referencias, ~3k tokens a 1,5 $/M).
 * gemini-nano-banana-2.1: 0,0336 $ (1K) · 0,0504 $ (2K) · 0,113 $ (4K) por imagen (ai.google.dev/gemini-api/docs/pricing, 13 oct).
 */
export const COST_CENTS_BY_SIZE: Record<string, Record<ImageSize, number>> = {
  "gemini-images": { "1K": 4, "2K": 6, "4K": 12 },
  "openai-images": { "1K": 8, "2K": 8, "4K": 8 },
  "dry-run": { "1K": 0, "2K": 0, "4K": 0 },
};

/**
 * Coste estimado por imagen en céntimos. Con resolución (flujo nuevo), la tabla por tamaño. Sin ella (flujo antiguo),
 * GENERATION_COST_CENTS_PER_IMAGE si está definida y, si no, el valor por defecto del proveedor (gemini 4, openai 8).
 */
export function estimatedCostCents(provider = process.env.GENERATION_PROVIDER ?? "dry-run", size?: ImageSize): number {
  // flujo nuevo: la resolución manda (la variable antigua es una tarifa plana del flujo de piezas)
  if (size && COST_CENTS_BY_SIZE[provider]) return COST_CENTS_BY_SIZE[provider][size];
  const raw = process.env.GENERATION_COST_CENTS_PER_IMAGE;
  if (raw !== undefined && raw.trim() !== "") {
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return DEFAULT_COST_CENTS[provider] ?? 8;
}

/* --------------------------- referencias --------------------------- */

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "image/png";
}

/**
 * Resuelve una ruta de referencia. Absoluta: tal cual. Relativa (p. ej. web/public/styles/gouache.jpg, relativa a la
 * raíz del repo): se prueba contra CUENTOS_REPO_ROOT, el directorio actual y su padre, y gana la primera que exista.
 * Así funciona tanto ejecutando desde web/ como desde la raíz del repo.
 */
export async function resolveRefPath(p: string, cwd = process.cwd()): Promise<string> {
  const { isAbsolute, resolve } = await import("node:path");
  if (isAbsolute(p)) return p;
  const { existsSync } = await import("node:fs");
  const roots = [process.env.CUENTOS_REPO_ROOT, cwd, resolve(cwd, "..")].filter((r): r is string => !!r);
  for (const root of roots) {
    const candidate = resolve(root, p);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(roots[0], p);
}

/** Carga una referencia (archivo local o URL) en memoria. */
export async function loadRef(ref: ImageRef): Promise<InlineImage> {
  if ("url" in ref) {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`referencia no disponible (${res.status})`);
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
    return { mimeType, data: new Uint8Array(await res.arrayBuffer()), label: "url" };
  }
  const { readFile } = await import("node:fs/promises");
  const file = await resolveRefPath(ref.path);
  return { mimeType: mimeFromPath(file), data: new Uint8Array(await readFile(file)), label: ref.path };
}

async function refToBlob(ref: ImageRef): Promise<Blob> {
  const img = await loadRef(ref);
  return new Blob([new Uint8Array(img.data)], { type: img.mimeType });
}

/* ------------------------------ dry-run ------------------------------ */

export const dryRunAdapter: GenerationAdapter = {
  name: "dry-run",
  async generateImage(prompt, _refs, opts) {
    return { images: [{ data: null, placeholder: `dry-run/${opts.aspect === "1:1" ? "square" : "landscape"}.png` }], costCents: 0, provider: "dry-run", model: "none", prompt };
  },
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
    const prompt = scenePrompt(scenePromptText, style, opts?.bible);
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

/** Construye la petición a /v1/images/edits sin ejecutarla. Páginas 1536x1024 (o OPENAI_IMAGE_SIZE); hoja 1024x1024. */
export function buildOpenAIImageRequest(prompt: string, refs: ImageRef[], n: number, aspect: ImageAspect = "landscape"): OpenAIImageRequest {
  if (refs.length > MAX_REFS) throw new Error("máximo 3 referencias por llamada (RF-10)");
  return {
    url: "https://api.openai.com/v1/images/edits",
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    n,
    size: aspect === "square" ? "1024x1024" : process.env.OPENAI_IMAGE_SIZE || "1536x1024",
    quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
    refs,
  };
}

async function executeOpenAI(req: OpenAIImageRequest): Promise<GenerationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no está definida en el entorno");
  const form = new FormData();
  form.append("model", req.model);
  form.append("prompt", req.prompt);
  form.append("n", String(req.n));
  form.append("size", req.size);
  form.append("quality", req.quality);
  for (const [i, ref] of req.refs.entries()) form.append("image[]", await refToBlob(ref), `ref-${i}.${"path" in ref ? ref.path.split(".").pop() : "png"}`);
  const res = await fetch(req.url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[]; usage?: unknown };
  const images = (json.data ?? []).map((d) => ({ data: d.b64_json ? Uint8Array.from(Buffer.from(d.b64_json, "base64")) : null, mimeType: "image/png" }));
  return {
    images,
    costCents: images.length * estimatedCostCents("openai-images"),
    provider: "openai-images",
    model: req.model,
    prompt: req.prompt,
    usage: json.usage ? [json.usage] : undefined,
  };
}

export const openAIImagesAdapter: GenerationAdapter = {
  name: "openai-images",
  async generateImage(prompt, refs, opts) {
    return executeOpenAI(buildOpenAIImageRequest(prompt, refs, 1, opts.aspect === "1:1" ? "square" : "landscape"));
  },
  async generateSheet(traitsEn, style, opts) {
    const req = buildOpenAIImageRequest(sheetPrompt(traitsEn, style), [{ path: style.anchorPath }], opts?.candidates ?? 1, "square");
    return executeOpenAI(req);
  },
  async generateScene(sheetRef, style, scenePromptText, opts) {
    const refs: ImageRef[] = [sheetRef, { path: style.anchorPath }];
    if (opts?.extraRef) refs.push(opts.extraRef);
    const req = buildOpenAIImageRequest(scenePrompt(scenePromptText, style, opts?.bible), refs, opts?.candidates ?? 2, "landscape");
    return executeOpenAI(req);
  },
};

/* --------------------------- gemini-images --------------------------- */

export interface GeminiPart {
  inline_data?: { mime_type: string; data: string };
  text?: string;
}

export interface GeminiImageRequest {
  url: string;
  model: string;
  /** Cabeceras sin la clave: x-goog-api-key se añade solo al enviar. */
  headers: Record<string, string>;
  body: {
    contents: { parts: GeminiPart[] }[];
    generationConfig: { responseModalities: string[]; imageConfig?: { aspectRatio?: string; imageSize?: string } };
  };
}

export function geminiModel(): string {
  // Nano Banana 2.1 (D4, 13 oct): el mismo modelo de la Fase 0 y la mitad de precio que gemini-3.1-flash-image
  // (0,0504 $ frente a 0,101 $ la imagen 2K, ai.google.dev/gemini-api/docs/pricing). GEMINI_IMAGE_MODEL lo sustituye.
  return process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
}

/**
 * Construye la petición a generateContent sin ejecutarla. Las referencias (ancla, hoja) van primero como inline_data
 * y el prompt al final. Una llamada = una imagen. El formato (cuadrado / 3:2) se pide en el prompt.
 */
export function buildGeminiImageRequest(prompt: string, refs: InlineImage[], opts?: ImageOptions): GeminiImageRequest {
  if (refs.length > MAX_REFS) throw new Error("máximo 3 referencias por llamada (RF-10)");
  const model = geminiModel();
  const modalities = (process.env.GEMINI_RESPONSE_MODALITIES || "IMAGE").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    model,
    headers: { "content-type": "application/json" },
    body: {
      contents: [
        {
          parts: [
            ...refs.map((r) => ({ inline_data: { mime_type: r.mimeType, data: Buffer.from(r.data).toString("base64") } })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: modalities,
        // formato y resolución explícitos (flujo nuevo); el flujo antiguo los pedía solo en el prompt
        ...(opts ? { imageConfig: { aspectRatio: opts.aspect, imageSize: opts.size } } : {}),
      },
    },
  };
}

type GeminiResponsePart = { text?: string; inline_data?: { mime_type?: string; data?: string }; inlineData?: { mimeType?: string; data?: string } };
export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiResponsePart[] }; finishReason?: string }[];
  usageMetadata?: unknown;
  promptFeedback?: unknown;
}

/** Extrae las imágenes de una respuesta de generateContent (acepta inline_data e inlineData). Lanza si no hay ninguna. */
export function parseGeminiImageResponse(json: GeminiResponse): { images: GeneratedImage[]; usage?: unknown } {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const images: GeneratedImage[] = [];
  for (const p of parts) {
    const data = p.inline_data?.data ?? p.inlineData?.data;
    if (!data) continue;
    images.push({ data: Uint8Array.from(Buffer.from(data, "base64")), mimeType: p.inline_data?.mime_type ?? p.inlineData?.mimeType ?? "image/png" });
  }
  if (images.length === 0) {
    const text = parts.map((p) => p.text ?? "").join(" ").trim();
    const reason = json.candidates?.[0]?.finishReason ?? (json.promptFeedback ? JSON.stringify(json.promptFeedback) : "sin candidatos");
    throw new Error(`gemini sin imagen (${reason}): ${text}`.slice(0, 300));
  }
  return { images, usage: json.usageMetadata };
}

async function executeGemini(prompt: string, refs: ImageRef[], opts?: ImageOptions): Promise<GenerationResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no está definida en el entorno");
  if (refs.length > MAX_REFS) throw new Error("máximo 3 referencias por llamada (RF-10)");
  const req = buildGeminiImageRequest(prompt, await Promise.all(refs.map(loadRef)), opts);
  const res = await fetch(req.url, { method: "POST", headers: { ...req.headers, "x-goog-api-key": key }, body: JSON.stringify(req.body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const { images, usage } = parseGeminiImageResponse((await res.json()) as GeminiResponse);
  return {
    images: images.slice(0, 1),
    costCents: estimatedCostCents("gemini-images", opts?.size),
    provider: "gemini-images",
    model: req.model,
    prompt,
    usage: usage ? [usage] : undefined,
  };
}

/** Gemini devuelve una imagen por llamada: `candidates` = n llamadas en serie (cada una cuenta para el coste). */
async function geminiN(prompt: string, refs: ImageRef[], n: number): Promise<GenerationResult> {
  const out: GenerationResult = { images: [], costCents: 0, provider: "gemini-images", model: geminiModel(), prompt, usage: [] };
  for (let i = 0; i < n; i++) {
    const r = await executeGemini(prompt, refs);
    out.images.push(...r.images);
    out.costCents += r.costCents;
    out.model = r.model;
    if (r.usage) out.usage!.push(...r.usage);
  }
  return out;
}

export const geminiImagesAdapter: GenerationAdapter = {
  name: "gemini-images",
  async generateImage(prompt, refs, opts) {
    return executeGemini(prompt, refs, opts);
  },
  async generateSheet(traitsEn, style, opts) {
    return geminiN(sheetPrompt(traitsEn, style), [{ path: style.anchorPath }], opts?.candidates ?? 1);
  },
  async generateScene(sheetRef, style, scenePromptText, opts) {
    const refs: ImageRef[] = [sheetRef, { path: style.anchorPath }];
    if (opts?.extraRef) refs.push(opts.extraRef);
    return geminiN(scenePrompt(scenePromptText, style, opts?.bible), refs, opts?.candidates ?? 2);
  },
};

export function getAdapter(provider = process.env.GENERATION_PROVIDER ?? "dry-run"): GenerationAdapter {
  if (provider === "gemini-images") return geminiImagesAdapter;
  if (provider === "openai-images") return openAIImagesAdapter;
  if (provider === "dry-run") return dryRunAdapter;
  throw new Error(`GENERATION_PROVIDER desconocido: ${provider}`);
}
