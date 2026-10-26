/**
 * Tests unitarios de la muestra y el libro pagado (B3): huellas, invalidación, idempotencia de los jobs, ejecución de
 * un job con bloqueo optimista y presupuesto con los jobs de muestra. Sin red ni claves: almacén en memoria y dry-run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_DRAFT, buildBook } from "../../lib/story";
import { toStory } from "../../lib/story/generate";
import { composeMockStory } from "../../lib/story/mock";
import { storyInputFromDraft } from "../../lib/story/spec";
import { dryRunAdapter, type GenerationAdapter } from "../../lib/generation/adapter";
import { SAMPLE_PAGE, jobKey, sampleIsStale, sampleKey, sheetJobKey } from "../../lib/generation/keys";
import { gateSpend, requestBook, requestSample, runJob, jobStatus, sortJobs } from "../../lib/generation/service";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { currentKeys, isCurrentJob, pageVersions } from "../../lib/generation/view";
import type { Database } from "../../lib/supabase/types";
import type { Draft } from "../../lib/types";

function baseDraft(p: Partial<Draft> = {}): Draft {
  const d: Draft = {
    ...DEFAULT_DRAFT,
    hero: {
      name: "Vera",
      age: 6,
      traits: { hair: { shape: "rizos", color: "castano" }, skin: "clara", eyes: "marron", glasses: "no", outfit: "amarillo", garment: "jersey", accessory: "no" },
    },
    companion: { kind: "perro", name: "Toby", variant: "golden" },
    details: ["Los trenes de mercancías que pasan por el puente", "Dice «ya voy» antes de bajar la escalera"],
    styleId: "gouache",
    email: "vera@example.com",
    ...p,
  };
  return d;
}

/** Borrador con la historia escrita por el mock para sus entradas actuales. */
function withStory(d: Draft): Draft {
  const input = storyInputFromDraft(d);
  return { ...d, story: toStory(composeMockStory(input), input, d, "mock", "mock") };
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
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

/* ------------------------------ huellas ------------------------------ */

test("sampleKey: estable para las mismas entradas; cambia con rasgos, edad, estilo, acompañante e historia", () => {
  const d = withStory(baseDraft());
  const k = sampleKey(d, "gouache");
  assert.equal(k, sampleKey(JSON.parse(JSON.stringify(d)), "gouache"));
  assert.notEqual(k, sampleKey({ ...d, hero: { ...d.hero, traits: { ...d.hero.traits, hair: { shape: "rizos", color: "pelirrojo" } } } }, "gouache"));
  assert.notEqual(k, sampleKey({ ...d, hero: { ...d.hero, age: 5 } }, "gouache"), "la edad entra en la hoja (characterBible)");
  assert.notEqual(k, sampleKey(d, "flat"));
  assert.notEqual(k, sampleKey({ ...d, companion: { ...d.companion!, variant: "corgi" } }, "gouache"));
  // «Escribirlo de otra manera»: semilla nueva → historia nueva → muestra nueva
  const rewritten = withStory({ ...d, storySeed: 1 });
  assert.notEqual(k, sampleKey(rewritten, "gouache"));
  // sin historia escrita (arco base) también hay huella, distinta de la de la historia
  assert.notEqual(k, sampleKey({ ...d, story: undefined }, "gouache"));
});

test("sampleKey: editar el texto de una página no invalida la muestra (el texto no va en la imagen)", () => {
  const d = withStory(baseDraft());
  const edited = { ...d, textOverrides: { 9: "Texto cambiado.", 2: "Otro." } };
  assert.equal(sampleKey(d, "gouache"), sampleKey(edited, "gouache"));
  assert.equal(buildBook(edited).pages[8].text, "Texto cambiado.");
});

test("sampleIsStale: solo cuando se pidió una muestra y la huella ya no coincide", () => {
  const d = withStory(baseDraft());
  assert.equal(sampleIsStale(d), false, "sin muestra pedida no hay nada que invalidar");
  const asked: Draft = { ...d, illustration: { paid: false, buyerDeclaration: true, sheetApproved: false, pages: {}, sheetVersions: 1, pageVersions: {}, sampleKey: sampleKey(d, "gouache") } };
  assert.equal(sampleIsStale(asked), false);
  assert.equal(sampleIsStale({ ...asked, styleId: "lapiz" }), true);
  assert.equal(sampleIsStale({ ...asked, hero: { ...asked.hero, traits: { ...asked.hero.traits, garment: "peto" } } }), true);
  assert.equal(sampleIsStale({ ...asked, textOverrides: { 9: "Otro texto" } }), false);
});

test("sheetJobKey no depende de la historia ni del acompañante: una historia nueva reutiliza la hoja", () => {
  const d = withStory(baseDraft());
  assert.equal(sheetJobKey(d, "gouache"), sheetJobKey(withStory({ ...d, storySeed: 3 }), "gouache"));
  assert.equal(sheetJobKey(d, "gouache"), sheetJobKey({ ...d, companion: undefined }, "gouache"));
});

/* ------------------------------ muestra: jobs ------------------------------ */

function store(): GenStore {
  return memoryStore(newMemoryState());
}

test("requestSample: crea sheet + sample (página 9) una sola vez por huella", async () => {
  const s = store();
  const d = withStory(baseDraft());
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  assert.equal(a.created, 2);
  const jobs = await s.listJobs(a.bookId);
  assert.deepEqual(sortJobs(jobs).map((j) => [j.kind, j.page_n, j.variant, j.status]), [
    ["sheet", null, 1, "pending"],
    ["sample", SAMPLE_PAGE, 1, "pending"],
  ]);
  // la muestra lleva la hoja como referencia y el prompt de escena de la historia
  const sample = jobs.find((j) => j.kind === "sample")!;
  assert.deepEqual((sample.references as { kind: string; job_id?: string }[])[0], { kind: "sheet", job_id: a.sheetJobId });
  assert.equal(sample.prompt, buildBook(d).pages[8].scenePrompt);
  assert.equal(sample.job_key, jobKey("sample", SAMPLE_PAGE, 1, sampleKey(d, "gouache")));

  // recargar / repetir: no se crea nada
  const b = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(b.ok);
  assert.equal(b.created, 0);
  assert.equal(b.sampleJobId, a.sampleJobId);
  assert.equal((await s.listJobs(a.bookId)).length, 2);

  // historia nueva con los mismos rasgos: muestra nueva, misma hoja
  const c = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: withStory({ ...d, storySeed: 1 }) }, dryRunAdapter);
  assert.ok(c.ok);
  assert.equal(c.created, 1);
  assert.equal(c.sheetJobId, a.sheetJobId);
});

test("requestSample: email y estilo obligatorios", async () => {
  const s = store();
  const d = baseDraft();
  const r1 = await requestSample(s, { styleId: "gouache", draft: { ...d, email: undefined } }, dryRunAdapter);
  assert.equal(r1.ok, false);
  assert.equal(!r1.ok && r1.error, "email");
  const r2 = await requestSample(s, { email: "a@b.co", styleId: "otro", draft: d }, dryRunAdapter);
  assert.equal(!r2.ok && r2.error, "style_id");
});

test("«Otra versión de la hoja»: hasta 3 versiones en total; después max_versions", async () => {
  const s = store();
  const d = baseDraft();
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  const v2 = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d, sheetVersion: true }, dryRunAdapter);
  assert.ok(v2.ok && v2.sheetVersions === 2 && v2.sheetJobId !== a.sheetJobId);
  const v3 = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d, sheetVersion: true }, dryRunAdapter);
  assert.ok(v3.ok && v3.sheetVersions === 3);
  const v4 = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d, sheetVersion: true }, dryRunAdapter);
  assert.equal(!v4.ok && v4.error, "max_versions");
  assert.equal((await s.listJobs(a.bookId)).filter((j) => j.kind === "sheet").length, 3);
});

/* ------------------------------ ejecutar ------------------------------ */

test("runJob (dry-run): la página espera a la hoja; done con placeholder; repetir no vuelve a pintar", async () => {
  const s = store();
  const d = baseDraft();
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  const early = await runJob(s, a.sampleJobId, dryRunAdapter);
  assert.equal(!early.ok && early.error, "waiting_sheet");
  const sheet = await runJob(s, a.sheetJobId, dryRunAdapter);
  assert.ok(sheet.ok && sheet.ran && sheet.job.status === "done");
  assert.equal(sheet.ok && sheet.job.storage_path, null);
  assert.match(String(sheet.ok && sheet.job.chosen), /^dry-run\/gouache\/sheet-1\.png$/);
  const sample = await runJob(s, a.sampleJobId, dryRunAdapter);
  assert.ok(sample.ok && sample.ran && sample.job.status === "done");
  const again = await runJob(s, a.sampleJobId, dryRunAdapter);
  assert.ok(again.ok && !again.ran);
  const st = await jobStatus(s, a.bookId);
  assert.ok(st.ok);
  assert.deepEqual(st.ok && st.jobs.map((j) => [j.kind, j.status, j.placeholder, j.url]), [
    ["sheet", "done", true, null],
    ["sample", "done", true, null],
  ]);
});

test("runJob: bloqueo optimista — dos reclamaciones con la misma lectura, solo una gana", async () => {
  const s = store();
  const d = baseDraft();
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  const read = (await s.getJob(a.sheetJobId))!;
  const first = await s.claim(read);
  const second = await s.claim(read);
  assert.ok(first && first.status === "running" && first.attempts === 1);
  assert.equal(second, null);
});

test("runJob: un proveedor que falla deja el job en failed con el mensaje recortado; la muestra se puede reintentar una vez", async () => {
  const s = store();
  const d = baseDraft();
  const broken: GenerationAdapter = {
    name: "dry-run",
    generateSheet: async () => {
      throw new Error("x".repeat(1000));
    },
    generateScene: dryRunAdapter.generateScene,
    generateImage: dryRunAdapter.generateImage,
  };
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  const r = await runJob(s, a.sheetJobId, broken);
  assert.ok(r.ok && r.job.status === "failed" && r.job.error!.length === 300);
  // volver a pedir la muestra reabre el fallo (intentos < 2) sin crear jobs nuevos
  const again = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(again.ok && again.created === 0);
  assert.equal((await s.getJob(a.sheetJobId))!.status, "pending");
  await runJob(s, a.sheetJobId, broken);
  await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.equal((await s.getJob(a.sheetJobId))!.status, "failed", "con 2 intentos ya no se reabre");
});

/* ------------------------------ libro pagado ------------------------------ */

test("requestBook: 11 páginas + portada (la 9 de la muestra no se repite), paid, una sola vez", async () => {
  const s = store();
  const d = withStory(baseDraft());
  const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, dryRunAdapter);
  assert.ok(a.ok);
  const before = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d }, dryRunAdapter, { dryRunPayment: true });
  assert.equal(!before.ok && before.error, "sheet_not_ready", "sin hoja pintada no hay libro");
  await runJob(s, a.sheetJobId, dryRunAdapter);
  await runJob(s, a.sampleJobId, dryRunAdapter);

  const notPaid = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d }, dryRunAdapter, { dryRunPayment: false });
  assert.equal(!notPaid.ok && notPaid.error, "not_paid");

  const r = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d }, dryRunAdapter, { dryRunPayment: true });
  assert.ok(r.ok && r.created === 12);
  const jobs = await s.listJobs(a.bookId);
  const pages = jobs.filter((j) => j.kind === "page").map((j) => j.page_n);
  assert.deepEqual(pages.sort((x, y) => x! - y!), [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12]);
  assert.equal(jobs.filter((j) => j.kind === "cover").length, 1);
  assert.ok(jobs.filter((j) => j.kind === "page" || j.kind === "cover").every((j) => j.paid));
  assert.ok(jobs.filter((j) => j.kind === "sheet" || j.kind === "sample").every((j) => !j.paid));
  const again = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d }, dryRunAdapter, { dryRunPayment: true });
  assert.ok(again.ok && again.created === 0);
  assert.equal((await s.listJobs(a.bookId)).length, 14);

  // en cliente: las 12 páginas tienen versión (la 9 es la muestra) y todo es de la huella actual
  const st = await jobStatus(s, a.bookId);
  assert.ok(st.ok);
  const keys = currentKeys(d, "gouache");
  assert.ok(st.ok && st.jobs.every((j) => isCurrentJob(j, keys)));
  for (let n = 1; n <= 12; n++) assert.equal(pageVersions(st.ok ? st.jobs : [], keys, n).length, 1, `página ${n}`);
  assert.equal(pageVersions(st.ok ? st.jobs : [], keys, 9)[0].kind, "sample");

  // «Otra versión» de una página: una más como máximo (también la 9)
  const v = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d, page: 9 }, dryRunAdapter, { dryRunPayment: true });
  assert.ok(v.ok && v.created === 1);
  const v2 = await requestBook(s, { bookId: a.bookId, styleId: "gouache", draft: d, page: 9 }, dryRunAdapter, { dryRunPayment: true });
  assert.equal(!v2.ok && v2.error, "max_versions");
});

/* ------------------------------ presupuesto ------------------------------ */

type Row = { lead_id: string; cost_cents: number; created_at: string };

/** Cliente Supabase falso con lo que usa budget.ts (cuentos_spend: select → eq|gte, insert; cuentos_orders: sin pedidos). */
function fakeSpendDb(rows: Row[]) {
  const client = {
    from(table: string) {
      if (table === "cuentos_orders") return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
      return {
        select() {
          return {
            eq: (_c: string, v: string) => Promise.resolve({ data: rows.filter((r) => r.lead_id === v), error: null }),
            gte: (_c: string, v: string) => Promise.resolve({ data: rows.filter((r) => r.created_at >= v), error: null }),
          };
        },
        insert(row: { lead_id: string; cost_cents: number }) {
          rows.push({ ...row, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const NOW = new Date("2026-10-11T15:00:00Z");

test("canSpend con los jobs de muestra: hoja + página 9 y hasta dos imágenes más caben en el tope por lead; la siguiente no (gemini 4 c, tope 20 c)", async () => {
  await withEnv({ LEAD_CAP_CENTS: "20", DAILY_CAP_CENTS: undefined, GENERATION_COST_CENTS_PER_IMAGE: undefined }, async () => {
    const rows: Row[] = [];
    const db = fakeSpendDb(rows);
    const sample = await gateSpend(db, { leadId: "vera@example.com", images: 2, provider: "gemini-images", now: NOW });
    assert.deepEqual(sample, { ok: true, cents: 8 });
    rows.push({ lead_id: "vera@example.com", cost_cents: 8, created_at: "2026-10-11T14:00:00.000Z" });
    const another = await gateSpend(db, { leadId: "vera@example.com", images: 1, provider: "gemini-images", now: NOW });
    assert.deepEqual(another, { ok: true, cents: 4 });
    rows.push({ lead_id: "vera@example.com", cost_cents: 4, created_at: "2026-10-11T14:05:00.000Z" });
    rows.push({ lead_id: "vera@example.com", cost_cents: 4, created_at: "2026-10-11T14:06:00.000Z" });
    // 16 c gastados: una más (20 c) aún cabe; la siguiente ya no
    assert.deepEqual(await gateSpend(db, { leadId: "vera@example.com", images: 1, provider: "gemini-images", now: NOW }), { ok: true, cents: 4 });
    rows.push({ lead_id: "vera@example.com", cost_cents: 4, created_at: "2026-10-11T14:07:00.000Z" });
    const over = await gateSpend(db, { leadId: "vera@example.com", images: 1, provider: "gemini-images", now: NOW });
    assert.equal(over.ok, false);
    assert.match(over.reason!, /tope por lead \(20 c\)/);
    // otro email no se ve afectado; el libro pagado salta el tope por lead
    assert.equal((await gateSpend(db, { leadId: "otra@example.com", images: 2, provider: "gemini-images", now: NOW })).ok, true);
    assert.equal((await gateSpend(db, { leadId: "book-uuid", images: 12, provider: "gemini-images", paid: true, now: NOW })).ok, true);
    // openai (8 c/imagen): la muestra cabe (16 c), una versión más no
    assert.equal((await gateSpend(db, { leadId: "nuevo@example.com", images: 2, provider: "openai-images", now: NOW })).ok, true);
    assert.equal((await gateSpend(db, { leadId: "nuevo@example.com", images: 3, provider: "openai-images", now: NOW })).ok, false);
  });
});

test("gateSpend: dry-run no gasta y no necesita Supabase; un proveedor de pago sin Supabase no gasta", async () => {
  assert.deepEqual(await gateSpend(null, { leadId: "a@b.co", images: 2, provider: "dry-run" }), { ok: true, cents: 0 });
  await withEnv({ GENERATION_COST_CENTS_PER_IMAGE: undefined }, async () => {
    assert.equal((await gateSpend(null, { leadId: "a@b.co", images: 2, provider: "gemini-images" })).ok, false);
  });
});

test("requestSample con proveedor de pago: el presupuesto del lead corta la muestra y las versiones de la hoja", async () => {
  await withEnv({ LEAD_CAP_CENTS: "10", DAILY_CAP_CENTS: undefined, GENERATION_COST_CENTS_PER_IMAGE: undefined }, async () => {
    const rows: Row[] = [];
    const s: GenStore = { ...memoryStore(newMemoryState()), db: fakeSpendDb(rows) };
    const paidProvider = { name: "gemini-images" };
    const d = baseDraft();
    const a = await requestSample(s, { email: d.email, styleId: "gouache", draft: d }, paidProvider);
    assert.ok(a.ok && a.created === 2);
    // se gastan las dos imágenes de la muestra
    rows.push({ lead_id: d.email!, cost_cents: 8, created_at: new Date().toISOString() });
    const v = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "gouache", draft: d, sheetVersion: true }, paidProvider);
    assert.equal(!v.ok && v.error, "budget");
    // otro estilo = muestra nueva = 2 imágenes más: no cabe
    const other = await requestSample(s, { bookId: a.bookId, email: d.email, styleId: "flat", draft: d }, paidProvider);
    assert.equal(!other.ok && other.status, 402);
    assert.equal((await s.listJobs(a.bookId)).length, 2);
  });
});

test("requestSample (26 oct, B5): con Supabase nunca busca el libro por email; sin id, 400", async () => {
  const mem = memoryStore(newMemoryState());
  const asked: unknown[] = [];
  const s: GenStore = { ...mem, mode: "supabase", findBook: async (q) => (asked.push(q), mem.findBook(q)) };
  const r = await requestSample(s, { email: "vera@example.com", styleId: "gouache" }, dryRunAdapter);
  assert.equal(r.ok, false);
  assert.equal((r as { error: string }).error, "book_id");
  assert.deepEqual(asked, [], "no se consulta la base con el email");
  const b = await requestBook(s, { email: "vera@example.com", styleId: "gouache" }, dryRunAdapter, { dryRunPayment: true });
  assert.equal((b as { error: string }).error, "book_id");
});
