#!/usr/bin/env node
/**
 * Fase 0 (B1 del PLAN): 1 hoja de personaje + 3 páginas de un mismo niño, hoja de contacto y coste.
 *
 *   cd web && node scripts/fase0.mjs --provider dry-run                       # sin llamadas: prompts y peticiones
 *   cd web && node scripts/fase0.mjs --provider gemini-images --style gouache # DE PAGO: 4 imágenes
 *
 * Opciones: --provider gemini-images|openai-images|dry-run (por defecto dry-run) · --style <id> (gouache)
 *           --child '{"name":"Vera","age":6,"traits":{…}}' · --out <dir> (capturas/fase0)
 *           --candidates <0-2>: segunda versión de las páginas 1..N (usa las 2 imágenes de reserva).
 *
 * Reglas: tope duro de 6 imágenes por ejecución (se aborta antes de llamar si el plan lo supera); una llamada por
 * imagen, sin reintentos; si una llamada falla se para y se escribe el informe. Las claves se leen de web/.env.local
 * o del entorno y nunca se imprimen ni se escriben en el informe.
 * Salida real: <out>/<proveedor>-<fecha>/ (no sobrescribe ejecuciones de pago). Dry-run: <out>/dry-run/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_IMAGES = 6;
const PROVIDERS = ["dry-run", "gemini-images", "openai-images"];
const KEY_FOR = { "gemini-images": "GEMINI_API_KEY", "openai-images": "OPENAI_API_KEY" };

/* ------------------------------ entorno ------------------------------ */

/** Mezcla web/.env.local en process.env sin sobrescribir lo ya definido. No imprime nada. */
function loadEnvLocal() {
  let text;
  try {
    text = fs.readFileSync(path.join(WEB, ".env.local"), "utf8");
  } catch {
    return false;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return true;
}

function parseArgs(argv) {
  const out = { provider: "dry-run", style: "gouache", child: null, out: "capturas/fase0", candidates: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const val = () => (inline !== undefined ? inline : argv[++i]);
    if (flag === "--provider") out.provider = val();
    else if (flag === "--style") out.style = val();
    else if (flag === "--child") out.child = val();
    else if (flag === "--out") out.out = val();
    else if (flag === "--candidates") out.candidates = Number(val());
    else fail(`opción desconocida: ${a}`);
  }
  return out;
}

function fail(msg, code = 2) {
  console.error(`[fase0] ${msg}`);
  process.exit(code);
}

/* ------------------------------ escenas ------------------------------ */

/** Las tres páginas fijas de la prueba (inglés). {grandma} y {dog} se sustituyen por describeCompanionEn. */
const SCENES = [
  "At the kitchen table at home on a sunny afternoon, the child sits in front of a birthday cake with lit candles, cheeks puffed, about to blow them out; beside the child, {grandma} smiles and claps",
  "In a green park with a set of swings in the background, the child runs across the grass laughing, with {dog} running happily alongside",
  "The child's bedroom at night, lit only by the warm glow of a bedside lamp; the child sits on the bed under a quilt holding a picture book, sleepy and content; deep blue night sky through the window",
];

const DEFAULT_CHILD = {
  name: "Vera",
  age: 6,
  traits: {
    hair: { shape: "rizos-media", color: "castano" },
    skin: "clara",
    eyes: "marron",
    eyeShape: "redondos",
    glasses: "redondas",
    outfit: "amarillo",
    garment: "peto",
    accessory: "no",
  },
};

/* ------------------------------ informe ------------------------------ */

/** Sustituye los datos base64 de una petición Gemini por un resumen (tamaño), para el informe. */
function redactGemini(req, labels) {
  return {
    url: req.url,
    model: req.model,
    headers: { ...req.headers, "x-goog-api-key": "<GEMINI_API_KEY, se añade al enviar>" },
    body: {
      ...req.body,
      contents: req.body.contents.map((c) => ({
        parts: c.parts.map((p, i) =>
          p.inline_data
            ? { inline_data: { mime_type: p.inline_data.mime_type, data: `<base64 de ${labels[i] ?? "referencia"}: ${Math.floor((p.inline_data.data.length * 3) / 4)} bytes>` } }
            : p,
        ),
      })),
    },
  };
}

function redactOpenAI(req) {
  return { ...req, headers: { Authorization: "Bearer <OPENAI_API_KEY, se añade al enviar>" }, transport: "multipart/form-data; refs como image[]" };
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Ruta para mostrar: relativa a web/ si está dentro; absoluta si no. */
function shown(p) {
  const rel = path.relative(WEB, p);
  return rel.startsWith("..") ? p : rel;
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** Coste real a partir del uso, solo si hay tarifa configurada (céntimos por millón de tokens). */
function realCostCents(usage) {
  const pin = Number(process.env.IMAGE_PRICE_CENTS_PER_1M_INPUT_TOKENS || NaN);
  const pout = Number(process.env.IMAGE_PRICE_CENTS_PER_1M_OUTPUT_TOKENS || NaN);
  if (!usage || !Number.isFinite(pin) || !Number.isFinite(pout)) return null;
  const tin = usage.promptTokenCount ?? usage.input_tokens;
  const tout = usage.candidatesTokenCount ?? usage.output_tokens;
  if (!Number.isFinite(tin) || !Number.isFinite(tout)) return null;
  return Math.round(((tin * pin + tout * pout) / 1e6) * 100) / 100;
}

/* ------------------------------ hoja de contacto ------------------------------ */

/** contact.png: hoja a la izquierda (cuadrada), tres páginas apiladas a la derecha; 2400 px de ancho. */
async function contactSheet(dir, sheetFile, pageFiles) {
  const sharp = (await import("sharp")).default;
  const W = 2400, G = 24, R = 760; // ancho de la columna de páginas
  const ph = Math.round((R * 2) / 3);
  const H = 3 * ph + 2 * G;
  const S = W - 3 * G - R;
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const fit = (file, w, h) => sharp(file).resize(w, h, { fit: "contain", background: white }).png().toBuffer();
  const layers = [{ input: await fit(sheetFile, S, Math.min(S, H)), left: G, top: G + Math.max(0, Math.round((H - Math.min(S, H)) / 2)) }];
  for (const [i, f] of pageFiles.entries()) layers.push({ input: await fit(f, R, ph), left: 2 * G + S, top: G + i * (ph + G) });
  await sharp({ create: { width: W, height: H + 2 * G, channels: 4, background: { r: 244, g: 240, b: 232, alpha: 1 } } })
    .composite(layers)
    .png()
    .toFile(path.join(dir, "contact.png"));
}

/* ------------------------------ principal ------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!PROVIDERS.includes(args.provider)) fail(`--provider debe ser uno de: ${PROVIDERS.join(", ")}`);
  if (!Number.isInteger(args.candidates) || args.candidates < 0) fail("--candidates debe ser un entero ≥ 0");

  // plan de imágenes y tope duro, antes de nada
  const planned = 1 + SCENES.length + args.candidates;
  if (planned > MAX_IMAGES) fail(`el plan pide ${planned} imágenes y el tope es ${MAX_IMAGES} por ejecución. No se ha llamado a nada.`);
  if (args.candidates > SCENES.length) fail(`--candidates no puede superar ${SCENES.length}`);

  const hadEnvFile = loadEnvLocal();
  if (args.provider !== "dry-run") {
    const keyName = KEY_FOR[args.provider];
    if (!process.env[keyName]) {
      fail(`falta ${keyName} (en web/.env.local${hadEnvFile ? "" : ", que no existe,"} o en el entorno). No se ha llamado a nada.`);
    }
  }

  // módulos TypeScript de la app, cargados con tsx (ya en devDependencies)
  const ts = (p) => tsImport(p, import.meta.url);
  const { characterBible } = await ts("../lib/generation/character.ts");
  const { sheetPrompt, scenePrompt } = await ts("../lib/generation/prompts.ts");
  const { getStyle } = await ts("../lib/generation/styles.ts");
  const { describeCompanionEn, normalizeTraits } = await ts("../lib/traits.ts");
  const adapterMod = await ts("../lib/generation/adapter.ts");
  const { buildGeminiImageRequest, buildOpenAIImageRequest, estimatedCostCents, getAdapter, loadRef, geminiModel } = adapterMod;

  const style = getStyle(args.style);
  if (!style) fail(`estilo desconocido: ${args.style}`);

  let child = DEFAULT_CHILD;
  if (args.child) {
    try {
      const c = JSON.parse(args.child);
      child = { name: String(c.name ?? DEFAULT_CHILD.name), age: Number(c.age ?? DEFAULT_CHILD.age), traits: c.traits ?? DEFAULT_CHILD.traits };
    } catch {
      fail("--child no es JSON válido");
    }
  }
  const traits = normalizeTraits(child.traits);
  // sin el nombre: el modelo tiende a escribirlo (mismo criterio que /api/jobs)
  const bible = characterBible(traits, child.age);
  const grandma = describeCompanionEn({ kind: "abuela", variant: "abuela-mono" });
  const dog = describeCompanionEn({ kind: "perro", variant: "corgi" });
  const scenes = SCENES.map((s) => s.replace("{grandma}", grandma).replace("{dog}", dog));

  const prompts = {
    sheet: sheetPrompt(bible, style),
    pages: scenes.map((s) => scenePrompt(s, style, bible)),
  };

  const outRoot = path.resolve(WEB, args.out);
  const report = {
    fase: "0",
    provider: args.provider,
    model: args.provider === "gemini-images" ? geminiModel() : args.provider === "openai-images" ? buildOpenAIImageRequest("", [], 1).model : "none",
    style: { id: style.id, anchorPath: style.anchorPath, promptStyle: style.promptStyle },
    child: { name: child.name, age: child.age, traits },
    bible,
    scenes,
    prompts,
    limits: { maxImages: MAX_IMAGES, planned, candidates: args.candidates },
    estimatedCentsPerImage: args.provider === "dry-run" ? { "gemini-images": estimatedCostCents("gemini-images"), "openai-images": estimatedCostCents("openai-images") } : estimatedCostCents(args.provider),
    startedAt: new Date().toISOString(),
  };

  /* ---------- dry-run: solo prompts y peticiones construidas ---------- */
  if (args.provider === "dry-run") {
    const dir = path.join(outRoot, "dry-run");
    const anchorRef = { path: style.anchorPath };
    const anchor = await loadRef(anchorRef); // archivo local del repo; sin red
    const sheetStandIn = { mimeType: "image/png", data: new Uint8Array(0), label: "sheet.png (se genera en la ejecución real)" };
    const sheetRef = { path: path.join(dir, "sheet.png") };
    report.requests = {
      "gemini-images": {
        sheet: redactGemini(buildGeminiImageRequest(prompts.sheet, [anchor]), [style.anchorPath]),
        pages: prompts.pages.map((p) => redactGemini(buildGeminiImageRequest(p, [sheetStandIn, anchor]), [sheetStandIn.label, style.anchorPath])),
      },
      "openai-images": {
        sheet: redactOpenAI(buildOpenAIImageRequest(prompts.sheet, [anchorRef], 1, "square")),
        pages: prompts.pages.map((p) => redactOpenAI(buildOpenAIImageRequest(p, [sheetRef, anchorRef], 1, "landscape"))),
      },
    };
    report.images = [];
    report.finishedAt = new Date().toISOString();
    writeJson(path.join(dir, "report.json"), report);
    console.log(`[fase0] dry-run: ${planned} imágenes planificadas, 0 llamadas. Informe: ${shown(path.join(dir, "report.json"))}`);
    return;
  }

  /* ---------- ejecución real (de pago) ---------- */
  const adapter = getAdapter(args.provider);
  const dir = path.join(outRoot, `${args.provider}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  report.images = [];
  let calls = 0;
  const guard = () => {
    if (++calls > MAX_IMAGES) throw new Error(`tope de ${MAX_IMAGES} imágenes alcanzado`);
  };
  const save = (name, result, ms, kind) => {
    const img = result.images[0];
    if (!img?.data) throw new Error(`${name}: el proveedor no devolvió imagen`);
    fs.writeFileSync(path.join(dir, name), img.data);
    const usage = result.usage?.[0] ?? null;
    report.images.push({ file: name, kind, ms, model: result.model, estimatedCents: result.costCents, usage, realCents: realCostCents(usage) });
    report.model = result.model;
    console.log(`[fase0] ${name} (${ms} ms, ~${result.costCents} c estimados)`);
  };

  try {
    guard();
    let t = Date.now();
    const sheet = await adapter.generateSheet(bible, style, { candidates: 1 });
    save("sheet.png", sheet, Date.now() - t, "sheet");
    const sheetRef = { path: path.join(dir, "sheet.png") };

    for (const [i, scene] of scenes.entries()) {
      guard();
      t = Date.now();
      save(`page-${i + 1}.png`, await adapter.generateScene(sheetRef, style, scene, { candidates: 1, bible }), Date.now() - t, "page");
    }
    for (let i = 0; i < args.candidates; i++) {
      guard();
      t = Date.now();
      save(`page-${i + 1}b.png`, await adapter.generateScene(sheetRef, style, scenes[i], { candidates: 1, bible }), Date.now() - t, "page-candidate");
    }

    await contactSheet(dir, path.join(dir, "sheet.png"), [1, 2, 3].map((n) => path.join(dir, `page-${n}.png`)));
  } catch (e) {
    report.error = e instanceof Error ? e.message.slice(0, 500) : String(e);
    console.error(`[fase0] parada: ${report.error}`);
    process.exitCode = 1;
  } finally {
    const est = report.images.reduce((a, r) => a + r.estimatedCents, 0);
    const reals = report.images.map((r) => r.realCents);
    report.totals = {
      images: report.images.length,
      estimatedCents: est,
      realCents: reals.length && reals.every((v) => typeof v === "number") ? Math.round(reals.reduce((a, v) => a + v, 0) * 100) / 100 : null,
      realCentsNote: "con tarifa en IMAGE_PRICE_CENTS_PER_1M_INPUT_TOKENS / _OUTPUT_TOKENS; si no, usar los tokens de `usage` y la facturación del proveedor",
    };
    report.finishedAt = new Date().toISOString();
    writeJson(path.join(dir, "report.json"), report);
    console.log(`[fase0] ${report.images.length} imágenes. Informe: ${shown(path.join(dir, "report.json"))}`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e), 1));
