/**
 * Tests unitarios de la generación de imágenes (sin red, sin claves): npm run test:unit
 * Personaje canónico, construcción de peticiones Gemini/OpenAI, resolución de anclas y presupuesto.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { characterBible } from "../../lib/generation/character";
import { sheetPrompt, scenePrompt } from "../../lib/generation/prompts";
import { STYLES, getStyle } from "../../lib/generation/styles";
import {
  buildGeminiImageRequest,
  buildOpenAIImageRequest,
  estimatedCostCents,
  getAdapter,
  parseGeminiImageResponse,
  resolveRefPath,
} from "../../lib/generation/adapter";
import { canSpend, recordSpend, utcDayStart } from "../../lib/generation/budget";
import { DEFAULT_TRAITS } from "../../lib/traits";
import type { Database } from "../../lib/supabase/types";
import type { Traits } from "../../lib/types";

const VERA: Traits = {
  hair: { shape: "rizos-media", color: "castano" },
  skin: "clara",
  eyes: "marron",
  eyeShape: "redondos",
  glasses: "redondas",
  outfit: "amarillo",
  garment: "peto",
  accessory: "no",
};

/** Ejecuta fn con variables de entorno temporales y las restaura después. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* ------------------------------ personaje ------------------------------ */

test("characterBible: estable para los mismos rasgos", () => {
  const a = characterBible(VERA, 6);
  const b = characterBible(JSON.parse(JSON.stringify(VERA)), 6);
  assert.equal(a, b);
  assert.match(a, /about 6 years old/);
  assert.match(a, /curly bob chestnut brown hair/);
  assert.match(a, /thin round wire glasses/);
  assert.match(a, /wearing yellow dungarees/);
  assert.match(a, /always the same child/);
});

test("characterBible: distinto para rasgos o edad distintos; nombre opcional y saneado", () => {
  const base = characterBible(VERA, 6);
  assert.notEqual(base, characterBible({ ...VERA, hair: { ...VERA.hair, color: "pelirrojo" } }, 6));
  assert.notEqual(base, characterBible({ ...VERA, glasses: "no" }, 6));
  assert.notEqual(base, characterBible(VERA, 4));
  assert.doesNotMatch(characterBible({ ...VERA, glasses: "no" }, 6), /glasses/);
  assert.match(characterBible(VERA, 6, "Vera"), /^a child named Vera who looks/);
  assert.match(characterBible(VERA, 6, "Vera<script>"), /named Verascript who/);
  // orden fijo: edad → pelo → piel → ojos → gafas → ropa → proporciones
  const order = ["years old", "hair", "skin", "eyes", "glasses", "wearing", "proportions", "always the same child"].map((s) => base.indexOf(s));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test("prompts: hoja y página redeclaran el bible; sin texto; formato", () => {
  const style = getStyle("gouache")!;
  const bible = characterBible(VERA, 6);
  const sheet = sheetPrompt(bible, style);
  assert.ok(sheet.includes(bible));
  assert.ok(sheet.includes(style.promptStyle));
  assert.match(sheet, /front, three-quarter, side profile and back/);
  assert.match(sheet, /happy, laughing, surprised, curious, sleepy, proud/);
  assert.match(sheet, /white background/);
  assert.match(sheet, /No text/);
  assert.match(sheet, /Square image/);
  const page = scenePrompt("A park with swings", style, bible);
  assert.ok(page.includes(bible));
  assert.match(page, /exactly the child from the character sheet reference/);
  assert.match(page, /Landscape 3:2/);
  assert.match(page, /No text/);
  // firma anterior (sin bible) sigue funcionando
  assert.match(scenePrompt("A park", style), /character sheet reference/);
});

/* ------------------------------ anclas ------------------------------ */

test("styles: las seis anclas apuntan a web/public/styles/<id>.jpg y se resuelven desde web/ y desde la raíz", async () => {
  const web = resolve(__dirname, "../..");
  const root = resolve(web, "..");
  assert.equal(STYLES.length, 6);
  await withEnv({ CUENTOS_REPO_ROOT: undefined }, async () => {
    for (const s of STYLES) {
      assert.equal(s.anchorPath, `web/public/styles/${s.id}.jpg`);
      const fromWeb = await resolveRefPath(s.anchorPath, web);
      const fromRoot = await resolveRefPath(s.anchorPath, root);
      assert.equal(fromWeb, fromRoot);
      assert.ok(existsSync(fromWeb), fromWeb);
    }
  });
  await withEnv({ CUENTOS_REPO_ROOT: root }, async () => {
    assert.ok(existsSync(await resolveRefPath("web/public/styles/gouache.jpg", "/")));
  });
});

/* ------------------------------ Gemini ------------------------------ */

test("buildGeminiImageRequest: URL, cabeceras sin clave, refs como inline_data y prompt al final", async () => {
  await withEnv({ GEMINI_IMAGE_MODEL: undefined, GEMINI_RESPONSE_MODALITIES: undefined, GEMINI_API_KEY: "no-debe-aparecer" }, () => {
    const refs = [
      { mimeType: "image/png", data: new Uint8Array([1, 2, 3]) },
      { mimeType: "image/jpeg", data: new Uint8Array([4, 5]) },
    ];
    const req = buildGeminiImageRequest("draw it", refs);
    assert.equal(req.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent");
    assert.equal(req.model, "gemini-2.5-flash-image");
    assert.deepEqual(req.headers, { "content-type": "application/json" });
    assert.deepEqual(req.body.generationConfig, { responseModalities: ["IMAGE"] });
    const parts = req.body.contents[0].parts;
    assert.equal(parts.length, 3);
    assert.deepEqual(parts[0], { inline_data: { mime_type: "image/png", data: Buffer.from([1, 2, 3]).toString("base64") } });
    assert.deepEqual(parts[1], { inline_data: { mime_type: "image/jpeg", data: Buffer.from([4, 5]).toString("base64") } });
    assert.deepEqual(parts[2], { text: "draw it" });
    assert.ok(!JSON.stringify(req).includes("no-debe-aparecer"));
  });
  await withEnv({ GEMINI_IMAGE_MODEL: "otro-modelo", GEMINI_RESPONSE_MODALITIES: "text, image" }, () => {
    const req = buildGeminiImageRequest("x", []);
    assert.match(req.url, /models\/otro-modelo:generateContent$/);
    assert.deepEqual(req.body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
  });
});

test("buildGeminiImageRequest y buildOpenAIImageRequest rechazan más de 3 referencias", () => {
  const img = { mimeType: "image/png", data: new Uint8Array([0]) };
  assert.throws(() => buildGeminiImageRequest("x", [img, img, img, img]), /máximo 3/);
  assert.doesNotThrow(() => buildGeminiImageRequest("x", [img, img, img]));
  assert.throws(() => buildOpenAIImageRequest("x", [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }], 1), /máximo 3/);
  assert.doesNotThrow(() => buildOpenAIImageRequest("x", [{ path: "a" }, { path: "b" }, { path: "c" }], 1));
});

test("parseGeminiImageResponse: extrae la imagen (inlineData o inline_data), filtra texto y falla sin imagen", () => {
  const png = Buffer.from([137, 80, 78, 71]).toString("base64");
  const a = parseGeminiImageResponse({
    candidates: [{ content: { parts: [{ text: "Here you go" }, { inlineData: { mimeType: "image/png", data: png } }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290 },
  });
  assert.equal(a.images.length, 1);
  assert.deepEqual([...a.images[0].data!], [137, 80, 78, 71]);
  assert.deepEqual(a.usage, { promptTokenCount: 10, candidatesTokenCount: 1290 });
  const b = parseGeminiImageResponse({ candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: png } }] } }] });
  assert.equal(b.images.length, 1);
  assert.throws(
    () => parseGeminiImageResponse({ candidates: [{ content: { parts: [{ text: "I can't draw that" }] }, finishReason: "STOP" }] }),
    /gemini sin imagen \(STOP\): I can't draw that/,
  );
  assert.throws(() => parseGeminiImageResponse({}), /sin candidatos/);
});

/* ------------------------------ OpenAI ------------------------------ */

test("buildOpenAIImageRequest: edits, modelo, tamaño apaisado para páginas y cuadrado para la hoja", async () => {
  await withEnv({ OPENAI_IMAGE_MODEL: undefined, OPENAI_IMAGE_SIZE: undefined, OPENAI_IMAGE_QUALITY: undefined, OPENAI_API_KEY: "no-debe-aparecer" }, () => {
    const page = buildOpenAIImageRequest("p", [{ path: "sheet.png" }, { path: "web/public/styles/gouache.jpg" }], 1);
    assert.equal(page.url, "https://api.openai.com/v1/images/edits");
    assert.equal(page.model, "gpt-image-1");
    assert.equal(page.size, "1536x1024");
    assert.equal(page.quality, "medium");
    assert.equal(page.n, 1);
    assert.equal(page.refs.length, 2);
    assert.equal(buildOpenAIImageRequest("s", [{ path: "a" }], 1, "square").size, "1024x1024");
    assert.ok(!JSON.stringify(page).includes("no-debe-aparecer"));
  });
});

/* ------------------------------ coste y adaptadores ------------------------------ */

test("estimatedCostCents: por proveedor si no hay variable; la variable manda si está definida", async () => {
  await withEnv({ GENERATION_COST_CENTS_PER_IMAGE: undefined }, () => {
    assert.equal(estimatedCostCents("gemini-images"), 4);
    assert.equal(estimatedCostCents("openai-images"), 8);
    assert.equal(estimatedCostCents("dry-run"), 0);
  });
  await withEnv({ GENERATION_COST_CENTS_PER_IMAGE: "" }, () => assert.equal(estimatedCostCents("gemini-images"), 4));
  await withEnv({ GENERATION_COST_CENTS_PER_IMAGE: "6" }, () => assert.equal(estimatedCostCents("gemini-images"), 6));
});

test("getAdapter acepta gemini-images, openai-images y dry-run", () => {
  assert.equal(getAdapter("gemini-images").name, "gemini-images");
  assert.equal(getAdapter("openai-images").name, "openai-images");
  assert.equal(getAdapter("dry-run").name, "dry-run");
  assert.throws(() => getAdapter("otro"), /desconocido/);
});

test("dry-run: la página redeclara el bible y no cuesta nada", async () => {
  const style = getStyle("gouache")!;
  const bible = characterBible(VERA, 6);
  const r = await getAdapter("dry-run").generateScene({ path: "dry-run/x.png" }, style, "A park", { candidates: 1, bible });
  assert.equal(r.costCents, 0);
  assert.ok(r.prompt.includes(bible));
});

/* ------------------------------ presupuesto ------------------------------ */

type Row = { lead_id: string; cost_cents: number; created_at: string; kind?: string; provider?: string; model?: string };

/** Cliente Supabase falso: solo lo que usa budget.ts (from → select → eq|gte, insert). */
function fakeDb(rows: Row[], opts: { failRead?: boolean } = {}) {
  const inserted: Row[] = [];
  const result = (data: Row[]) => Promise.resolve(opts.failRead ? { data: null, error: { message: "x" } } : { data, error: null });
  const client = {
    from(table: string) {
      assert.equal(table, "cuentos_spend");
      return {
        select(cols: string) {
          assert.equal(cols, "cost_cents");
          return {
            eq: (col: string, v: string) => (assert.equal(col, "lead_id"), result(rows.filter((r) => r.lead_id === v))),
            gte: (col: string, v: string) => (assert.equal(col, "created_at"), result(rows.filter((r) => r.created_at >= v))),
          };
        },
        insert(row: Row) {
          inserted.push({ ...row, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db: client as unknown as SupabaseClient<Database>, inserted };
}

const NOW = new Date("2026-10-11T15:00:00Z");
const TODAY = "2026-10-11T09:00:00.000Z";
const YESTERDAY = "2026-10-10T23:59:00.000Z";

test("canSpend: sin cliente nunca gasta", async () => {
  assert.deepEqual(await canSpend(null, { leadId: "a@b.c", cents: 4 }), { ok: false, reason: "sin presupuesto configurado" });
  assert.equal((await recordSpend(null, { leadId: "a", kind: "sheet", provider: "p", model: "m", cents: 4 })).ok, false);
});

test("canSpend: respeta el tope por lead (20 c por defecto)", async () => {
  await withEnv({ LEAD_CAP_CENTS: undefined, DAILY_CAP_CENTS: undefined }, async () => {
    const { db } = fakeDb([{ lead_id: "a@b.c", cost_cents: 4, created_at: YESTERDAY }]);
    assert.deepEqual(await canSpend(db, { leadId: "a@b.c", cents: 4, now: NOW }), { ok: true });
    assert.deepEqual(await canSpend(db, { leadId: "a@b.c", cents: 16, now: NOW }), { ok: true });
    const over = await canSpend(db, { leadId: "a@b.c", cents: 17, now: NOW });
    assert.equal(over.ok, false);
    assert.match(over.reason!, /tope por lead \(20 c\)/);
    // otro lead no se ve afectado; un libro pagado salta el tope por lead
    assert.equal((await canSpend(db, { leadId: "otro@b.c", cents: 18, now: NOW })).ok, true);
    assert.equal((await canSpend(db, { leadId: "a@b.c", cents: 50, paid: true, now: NOW })).ok, true);
  });
});

test("canSpend: respeta el tope diario UTC (500 c por defecto) también para libros pagados", async () => {
  await withEnv({ LEAD_CAP_CENTS: undefined, DAILY_CAP_CENTS: undefined }, async () => {
    const rows: Row[] = [
      { lead_id: "x", cost_cents: 300, created_at: TODAY },
      { lead_id: "y", cost_cents: 196, created_at: TODAY },
      { lead_id: "z", cost_cents: 400, created_at: YESTERDAY },
    ];
    const { db } = fakeDb(rows);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 4, now: NOW })).ok, true);
    const over = await canSpend(db, { leadId: "nuevo", cents: 5, now: NOW });
    assert.equal(over.ok, false);
    assert.match(over.reason!, /tope diario \(500 c\)/);
    assert.equal((await canSpend(db, { leadId: "libro", cents: 5, paid: true, now: NOW })).ok, false);
  });
  await withEnv({ DAILY_CAP_CENTS: "1000", LEAD_CAP_CENTS: "20" }, async () => {
    const { db } = fakeDb([{ lead_id: "x", cost_cents: 900, created_at: TODAY }]);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 20, now: NOW })).ok, true);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 21, now: NOW })).ok, false);
  });
  assert.equal(utcDayStart(NOW), "2026-10-11T00:00:00.000Z");
});

test("canSpend: si la lectura falla no se gasta; recordSpend inserta la fila", async () => {
  const { db: broken } = fakeDb([], { failRead: true });
  assert.equal((await canSpend(broken, { leadId: "a", cents: 1, now: NOW })).ok, false);
  const { db, inserted } = fakeDb([]);
  assert.deepEqual(await recordSpend(db, { leadId: "a@b.c", kind: "sheet", provider: "gemini-images", model: "gemini-2.5-flash-image", cents: 3.6 }), { ok: true });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].lead_id, "a@b.c");
  assert.equal(inserted[0].kind, "sheet");
  assert.equal(inserted[0].cost_cents, 4);
});

test("DEFAULT_TRAITS produce un bible válido", () => {
  assert.match(characterBible(DEFAULT_TRAITS, 5), /short curly chestnut brown hair/);
});
