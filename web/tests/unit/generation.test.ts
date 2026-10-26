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
import { canSpend, freeSpendToday, leadCapCents, recordSpend, utcDayStart } from "../../lib/generation/budget";
import { TEXT_ESTIMATE_CENTS, recordText, textRoom } from "../../lib/plan/textBudget";
import { MOCK_LLM } from "../../lib/llm";
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
    assert.equal(req.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent");
    assert.equal(req.model, "gemini-nano-banana-2.1");
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

type Order = { book_id: string; stripe_session_id: string | null; status?: string; created_at?: string };

/**
 * Cliente Supabase falso: solo lo que usa budget.ts. `select` devuelve una consulta que admite eq, gte y like
 * encadenados y se resuelve al esperarla; `insert` guarda la fila (también la ven las lecturas siguientes).
 */
function fakeDb(rows: Row[], opts: { failRead?: boolean; orders?: Order[] } = {}) {
  const inserted: Row[] = [];
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const like = (v: unknown, pat: string) => new RegExp(`^${pat.split("%").map((a) => a.split("_").map(esc).join(".")).join(".*")}$`).test(String(v ?? ""));
  const query = (data: () => Record<string, unknown>[]) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let slice: [number, number] | null = null;
    const q = {
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      like: (c: string, pat: string) => (filters.push((r) => like(r[c], pat)), q),
      order: () => q,
      range: (from: number, to: number) => ((slice = [from, to + 1]), q),
      limit: (n: number) => ((slice = [0, n]), q),
      then: (ok: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const rows = data().filter((r) => filters.every((f) => f(r)));
        return Promise.resolve(opts.failRead ? { data: null, error: { message: "x" } } : { data: slice ? rows.slice(...slice) : rows, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const client = {
    from(table: string) {
      if (table === "cuentos_orders") {
        const all = () => (opts.orders ?? []).map((o) => ({ status: "paid", created_at: "2026-10-01T00:00:00.000Z", ...o }));
        return { select: () => query(all) };
      }
      assert.equal(table, "cuentos_spend");
      return {
        select: () => query(() => [...rows, ...inserted]),
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

test("canSpend: respeta el tope por lead (30 c por defecto, D2; aquí 20 c)", async () => {
  await withEnv({ LEAD_CAP_CENTS: undefined }, async () => assert.equal(leadCapCents(), 30));
  await withEnv({ LEAD_CAP_CENTS: "20", DAILY_CAP_CENTS: undefined }, async () => {
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

test("canSpend: respeta el tope diario UTC (500 c por defecto), salvo libros cobrados con Stripe", async () => {
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
  // un libro cobrado de verdad con Stripe pasa el tope diario; uno con pago de prueba, no (16 oct). Desde el 26 oct
  // (auditoría, B1) la tarjeta de prueba de Stripe (`cs_test_`) tampoco: en la preview pública pintaba sin tope
  await withEnv({ LEAD_CAP_CENTS: undefined, DAILY_CAP_CENTS: undefined }, async () => {
    const orders: Order[] = [
      { book_id: "cobrado", stripe_session_id: "cs_live_a1" },
      { book_id: "tarjeta-prueba", stripe_session_id: "cs_test_a1" },
      { book_id: "prueba", stripe_session_id: "dry-run:abc12345" },
      { book_id: "pendiente", stripe_session_id: "cs_live_b2", status: "pending" },
    ];
    const { db } = fakeDb([{ lead_id: "x", cost_cents: 500, created_at: TODAY }], { orders });
    assert.equal((await canSpend(db, { leadId: "cobrado", cents: 12, paid: true, now: NOW })).ok, true);
    assert.equal((await canSpend(db, { leadId: "tarjeta-prueba", cents: 12, paid: true, now: NOW })).ok, false);
    assert.equal((await canSpend(db, { leadId: "prueba", cents: 12, paid: true, now: NOW })).ok, false);
    assert.equal((await canSpend(db, { leadId: "pendiente", cents: 12, paid: true, now: NOW })).ok, false);
    // sin `paid` no se mira el pedido: el tope diario manda
    assert.equal((await canSpend(db, { leadId: "cobrado", cents: 12, now: NOW })).ok, false);
  });
  await withEnv({ DAILY_CAP_CENTS: "1000", LEAD_CAP_CENTS: "20" }, async () => {
    const { db } = fakeDb([{ lead_id: "x", cost_cents: 900, created_at: TODAY }]);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 20, now: NOW })).ok, true);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 21, now: NOW })).ok, false);
  });
  assert.equal(utcDayStart(NOW), "2026-10-11T00:00:00.000Z");
});

test("tope diario: lo pintado para libros cobrados tras el cobro no cuenta; lo de antes del pago y lo de prueba, sí (B2)", async () => {
  await withEnv({ LEAD_CAP_CENTS: undefined, DAILY_CAP_CENTS: undefined }, async () => {
    const PAID = "2026-10-11T10:00:00.000Z";
    const orders: Order[] = [
      { book_id: "venta1", stripe_session_id: "cs_live_1", created_at: PAID },
      { book_id: "venta2", stripe_session_id: "cs_live_2", created_at: PAID },
      { book_id: "prueba", stripe_session_id: "cs_test_1", created_at: PAID },
    ];
    const rows: Row[] = [
      // cinco ventas del día: 12 páginas y su repetición, después del cobro
      { lead_id: "venta1", cost_cents: 230, created_at: "2026-10-11T10:05:00.000Z" },
      { lead_id: "venta2", cost_cents: 230, created_at: "2026-10-11T11:05:00.000Z" },
      // la hoja y la portada gratis de venta1, antes de pagar: sí cuentan
      { lead_id: "venta1", cost_cents: 10, created_at: "2026-10-11T09:30:00.000Z" },
      { lead_id: "gratis", cost_cents: 30, created_at: TODAY },
    ];
    const { db } = fakeDb(rows, { orders });
    assert.equal((await freeSpendToday(db, NOW))?.total, 40);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 10, now: NOW })).ok, true, "antes, 500 c de 500: cerrado");
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 460, now: NOW, leadCap: 10_000 })).ok, true);
    assert.equal((await canSpend(db, { leadId: "nuevo", cents: 461, now: NOW, leadCap: 10_000 })).ok, false);
    // un libro pagado con la tarjeta de prueba sí cuenta (en la preview cualquiera «paga»)
    const test2 = fakeDb([...rows, { lead_id: "prueba", cost_cents: 455, created_at: "2026-10-11T12:00:00.000Z" }], { orders });
    assert.equal((await canSpend(test2.db, { leadId: "nuevo", cents: 10, now: NOW })).ok, false);
  });
});

test("aviso por email al pasar del 80 % del tope diario, una vez; lo de libros cobrados no avisa (B2)", async () => {
  await withEnv({ DAILY_CAP_CENTS: "100" }, async () => {
    const sent: string[] = [];
    const notify = async (subject: string) => (sent.push(subject), { sent: true });
    // fakeDb fecha las filas nuevas con la hora real: aquí todo va con la hora real
    const now = new Date();
    const orders: Order[] = [{ book_id: "venta", stripe_session_id: "cs_live_1", created_at: new Date(now.getTime() - 3600_000).toISOString() }];
    const { db } = fakeDb([{ lead_id: "x", cost_cents: 74, created_at: now.toISOString() }], { orders });
    const spend = (leadId: string, cents: number) => recordSpend(db, { leadId, kind: "page", provider: "gemini-images", model: "m", cents }, { now, notify });
    await spend("venta", 30);
    assert.deepEqual(sent, [], "lo de un libro cobrado no cuenta");
    await spend("y", 4);
    assert.deepEqual(sent, [], "78 c de 100");
    await spend("y", 4);
    assert.deepEqual(sent, ["Gasto del día al 82 %"]);
    await spend("y", 4);
    assert.equal(sent.length, 1, "ya había pasado: no se repite");
  });
});

test("el texto cuenta en el tope diario: se mira antes de escribir y se apunta después (I6)", async () => {
  await withEnv({ DAILY_CAP_CENTS: "100" }, async () => {
    const claude = { name: "anthropic" as const, model: "claude-sonnet-5-5" };
    const now = new Date();
    const { db, inserted } = fakeDb([{ lead_id: "x", cost_cents: 85, created_at: now.toISOString() }]);
    assert.equal((await textRoom(db, "plan", claude, now)).ok, true, "85 + 12 caben en 100");
    await recordText(db, "plan", claude, 7.2);
    assert.deepEqual({ ...inserted[0], created_at: undefined }, { lead_id: "texto:plan", kind: "story", provider: "anthropic", model: "claude-sonnet-5-5", cost_cents: 8, created_at: undefined });
    assert.equal((await textRoom(db, "plan", claude, now)).ok, false, "93 + 12 ya no");
    assert.equal((await textRoom(db, "page", claude, now)).ok, true, "una página (2 c) sí");
    await recordText(db, "page", claude, null);
    // pasado el 80 % queda también la marca del aviso del día (gasto cero)
    const spent = () => inserted.filter((r) => !r.lead_id.startsWith("aviso-tope:"));
    assert.equal(spent()[1].cost_cents, TEXT_ESTIMATE_CENTS.page, "sin precio conocido, la estimación");
    assert.equal(inserted.filter((r) => r.lead_id.startsWith("aviso-tope:")).length, 1);
    // con el modelo de prueba o sin base, ni se mira ni se apunta
    assert.equal((await textRoom(db, "plan", MOCK_LLM, now)).ok, true);
    await recordText(db, "plan", MOCK_LLM, 5);
    assert.equal(spent().length, 2);
    assert.equal((await textRoom(null, "plan", claude, now)).ok, true);
  });
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

test("tiempo agotado: no gasta el intento, pero se apunta su coste estimado y así los topes frenan los reintentos", async () => {
  const { memoryStore, newMemoryState } = await import("../../lib/generation/store");
  const { runJob } = await import("../../lib/generation/service");
  const { startBook } = await import("../../lib/book/service");
  const { normalizeFicha } = await import("../../lib/plan/ficha");
  const { mockPlan } = await import("../../lib/plan/mock");
  const { EVAL_CASES } = await import("../../lib/plan/evalCases");
  const { dryRunAdapter } = await import("../../lib/generation/adapter");
  await withEnv({ DAILY_CAP_CENTS: undefined, FREE_BOOK_CAP_CENTS: undefined }, async () => {
    const { db, inserted } = fakeDb([]);
    const store = { ...memoryStore(newMemoryState()), db };
    const ficha = normalizeFicha(EVAL_CASES[0]);
    const start = await startBook(store, { email: "vera@example.com", ficha, plan: mockPlan(ficha), planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
    assert.ok(start.ok, JSON.stringify(start));
    const slow = {
      ...dryRunAdapter,
      name: "gemini-images",
      generateImage: async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    };
    await runJob(store, start.sheetJobId, slow);
    const job = (await store.getJob(start.sheetJobId))!;
    assert.equal(job.status, "failed");
    assert.equal(job.attempts, 0, "el intento no se gasta");
    assert.equal(job.cost_cents, 4, "la hoja 1K de Gemini, estimada");
    assert.deepEqual(inserted.map((r) => [r.lead_id, r.model, r.cost_cents]), [[job.book_id, "tiempo-agotado", 4]]);
  });
});

test("aviso del 80 %: con varios gastos a la vez sale al menos una vez, y no vuelve a salir ese día", async () => {
  await withEnv({ DAILY_CAP_CENTS: "100" }, async () => {
    const sent: string[] = [];
    const notify = async (subject: string) => (sent.push(subject), { sent: true });
    const now = new Date();
    const { db } = fakeDb([{ lead_id: "x", cost_cents: 78, created_at: now.toISOString() }]);
    const spend = (cents: number) => recordSpend(db, { leadId: "y", kind: "page", provider: "gemini-images", model: "m", cents }, { now, notify });
    await Promise.all([spend(4), spend(4), spend(4)]);
    assert.ok(sent.length >= 1, "antes, con tres a la vez, no salía ninguno");
    const n = sent.length;
    await spend(4);
    assert.equal(sent.length, n);
  });
});
