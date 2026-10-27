/**
 * Las migraciones del repo reconstruyen la base (auditoría 26 oct, I14). Se aplican en orden sobre un Postgres en memoria
 * (PGlite) y el esquema de las tablas cuentos_* tiene que ser el mismo que el de la base real
 * (fixtures/esquema-cuentos.json, leído el 27 oct). Después se escribe en ellas como lo hace el código.
 * Lo que es de Supabase y no de este producto (el esquema storage y los roles) se crea antes, mínimo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DIR = join(__dirname, "..", "..", "..", "supabase", "migrations");
const expected = JSON.parse(readFileSync(join(__dirname, "fixtures", "esquema-cuentos.json"), "utf8")) as Record<string, string[]>;

async function rebuilt(): Promise<PGlite> {
  const db = new PGlite();
  // lo mínimo de Supabase que tocan las migraciones: el bucket y los roles de las políticas
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false);
  `);
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return db;
}

async function snapshot(db: PGlite): Promise<Record<string, string[]>> {
  const q = async (sql: string) => ((await db.query<{ x: string }>(sql)).rows.map((r) => r.x)).sort();
  return {
    columns: await q(`select c.table_name || '.' || c.column_name || ' ' || c.data_type || coalesce(' default ' || c.column_default,'') || case when c.is_nullable='NO' then ' not null' else '' end as x from information_schema.columns c where c.table_schema='public' and c.table_name like 'cuentos\\_%'`),
    constraints: await q(`select conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) as x from pg_constraint where conrelid::regclass::text like 'cuentos\\_%' and contype in ('c','u','f','p')`),
    indexes: await q(`select indexdef as x from pg_indexes where schemaname='public' and tablename like 'cuentos\\_%'`),
    triggers: await q(`select event_object_table || ' ' || trigger_name || ' ' || action_timing || ' ' || event_manipulation as x from information_schema.triggers where event_object_schema='public' and event_object_table like 'cuentos\\_%'`),
    rls: await q(`select relname || ' ' || relrowsecurity as x from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'cuentos\\_%'`),
    policies: await q(`select tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') as x from pg_policies where schemaname='public' and tablename like 'cuentos\\_%'`),
  };
}

test("las migraciones, en orden, dejan las tablas cuentos_* igual que la base real", async () => {
  const db = await rebuilt();
  const got = await snapshot(db);
  for (const k of ["columns", "constraints", "indexes", "triggers", "rls", "policies"]) {
    const want = [...expected[k]].sort();
    assert.deepEqual(got[k], want, `${k}: falta ${JSON.stringify(want.filter((x) => !got[k].includes(x)))}; sobra ${JSON.stringify(got[k].filter((x) => !want.includes(x)))}`);
  }
  await db.close();
});

test("en la base reconstruida se escribe como lo hace el código: libro, trabajos de pago, retrato, versión 4, gasto, cuento y pedido", async () => {
  const db = await rebuilt();
  const book = (await db.query<{ id: string }>(`insert into cuentos_books (public_id, draft, edition, email) values ('abcd2345ef', '{"v":2}', 'illustrated', 'vera@example.com') returning id`)).rows[0].id;
  await db.query(
    `insert into cuentos_generation_jobs (book_id, kind, page_n, style_id, prompt, paid, variant, job_key, status) values
      ($1, 'sheet', null, 'gouache', 'p', false, 1, 'sheet:0:1:x', 'done'),
      ($1, 'cover', null, 'gouache', 'p', true, 1, 'cover:0:1:x', 'failed'),
      ($1, 'page', 3, 'gouache', 'p', true, 4, 'page:3:4:x', 'pending'),
      ($1, 'portrait', 1, 'gouache', 'p', true, 1, 'portrait:1:1:x', 'running')`,
    [book],
  );
  // la huella es única por libro: la segunda vez no entra
  await assert.rejects(db.query(`insert into cuentos_generation_jobs (book_id, kind, page_n, style_id, prompt, job_key) values ($1, 'page', 3, 'g', 'p', 'page:3:4:x')`, [book]));
  await db.query(`insert into cuentos_spend (lead_id, kind, provider, model, cost_cents) values ('vera@example.com', 'story', 'anthropic', 'm', 12), ($1, 'page', 'gemini', 'm', 6)`, [book]);
  await db.query(`insert into cuentos_stories (input_hash, input, story, provider) values ('h', '{}', '{}', 'mock')`);
  await db.query(
    `insert into cuentos_orders (book_id, edition, amount_cents, stripe_session_id, status, shipping, print_status, print_info) values ($1, 'hardcover', 3490, 'cs_test_1', 'paid', '{"city":"Madrid"}', 'awaiting_approval', '{"steps":{}}')`,
    [book],
  );
  await db.query(`update cuentos_orders set status = 'refunded', print_status = 'canceled', print_error = 'devuelto' where book_id = $1`, [book]);
  await db.query(`insert into cuentos_feedback (book_id, kind, page_n, variant, reason) values ($1, 'redo', 3, 2, 'pose')`, [book]);
  // el guardado condicional del borrador (I13) se apoya en que updated_at cambie al escribir
  const before = (await db.query<{ updated_at: Date }>(`select updated_at from cuentos_books where id = $1`, [book])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 5));
  await db.query(`update cuentos_books set draft = '{"v":2,"x":1}' where id = $1`, [book]);
  const after = (await db.query<{ updated_at: Date }>(`select updated_at from cuentos_books where id = $1`, [book])).rows[0].updated_at;
  assert.ok(after > before);
  await db.close();
});
