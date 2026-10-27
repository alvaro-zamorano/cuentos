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
import { normalizeEmail } from "../../lib/emailNorm";

const DIR = join(__dirname, "..", "..", "..", "supabase", "migrations");
const expected = JSON.parse(readFileSync(join(__dirname, "fixtures", "esquema-cuentos.json"), "utf8")) as Record<string, string[]>;

/** `before`: aplica solo las migraciones anteriores a ese fichero (para escribir filas antes de una migración). */
async function rebuilt({ before }: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  // lo mínimo de Supabase que tocan las migraciones: el bucket y los roles de las políticas
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false);
  `);
  for (const f of migrations().filter((f) => !before || f < before)) await apply(db, f);
  return db;
}

const migrations = () => readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

async function apply(db: PGlite, f: string): Promise<void> {
  {
    try {
      await db.exec(readFileSync(join(DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function snapshot(db: PGlite): Promise<Record<string, string[]>> {
  const q = async (sql: string) => ((await db.query<{ x: string }>(sql)).rows.map((r) => r.x)).sort();
  return {
    columns: await q(`select c.table_name || '.' || c.column_name || ' ' || c.data_type || coalesce(' default ' || c.column_default,'') || coalesce(' generated ' || c.generation_expression,'') || case when c.is_nullable='NO' then ' not null' else '' end as x from information_schema.columns c where c.table_schema='public' and c.table_name like 'cuentos\\_%'`),
    constraints: await q(`select conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) as x from pg_constraint where conrelid::regclass::text like 'cuentos\\_%' and contype in ('c','u','f','p')`),
    indexes: await q(`select indexdef as x from pg_indexes where schemaname='public' and tablename like 'cuentos\\_%'`),
    triggers: await q(`select event_object_table || ' ' || trigger_name || ' ' || action_timing || ' ' || event_manipulation as x from information_schema.triggers where event_object_schema='public' and event_object_table like 'cuentos\\_%'`),
    rls: await q(`select relname || ' ' || relrowsecurity as x from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'cuentos\\_%'`),
    functions: await q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || p.provolatile::text || coalesce(' ' || array_to_string(p.proconfig, ','), '') as x from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'cuentos\\_%'`),
    policies: await q(`select tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') as x from pg_policies where schemaname='public' and tablename like 'cuentos\\_%'`),
  };
}

test("las migraciones, en orden, dejan las tablas cuentos_* igual que la base real", async () => {
  const db = await rebuilt();
  const got = await snapshot(db);
  for (const k of ["columns", "constraints", "indexes", "triggers", "rls", "functions", "policies"]) {
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

test("0013 (I7): email_norm es normalizeEmail, también en las filas que ya había; solo el service role usa la función", async () => {
  const db = await rebuilt({ before: "0013" });
  // un libro de antes de la migración: la columna generada lo rellena al añadirse
  const drawn = (await db.query<{ id: string }>(`insert into cuentos_books (public_id, draft, edition, email) values ('antes2345', '{}', 'illustrated', 'Vera.Lopez+cuentos@GoogleMail.com') returning id`)).rows[0].id;
  await db.query(`insert into cuentos_generation_jobs (book_id, kind, style_id, prompt, job_key, status) values ($1, 'sheet', 'g', 'p', 'sheet:0:1:x', 'done')`, [drawn]);
  await db.query(`insert into cuentos_books (public_id, draft, edition, email) values ('sinhoja23', '{}', 'illustrated', 'vera@gmail.com')`);
  for (const f of migrations().filter((f) => f >= "0013")) await apply(db, f);
  const old = (await db.query<{ email_norm: string; free_claimed_at: Date | null; created_at: Date }>(`select email_norm, free_claimed_at, created_at from cuentos_books where public_id = 'antes2345'`)).rows[0];
  assert.equal(old.email_norm, "veralopez@gmail.com");
  assert.equal(old.free_claimed_at?.getTime(), old.created_at.getTime(), "con hoja: ya pasó la puerta");
  assert.equal((await db.query<{ c: Date | null }>(`select free_claimed_at as c from cuentos_books where public_id = 'sinhoja23'`)).rows[0].c, null, "sin hoja: no cuenta");

  const cases = [
    " Ana.Garcia+cuentos@Gmail.com ",
    "ana.garcia@googlemail.com",
    "ana.garcia+x@empresa.es",
    "ANA@EMPRESA.ES",
    "a.b.c@gmail.com",
    "+solo@gmail.com",
    "x+y+z@hotmail.com",
    "raro",
    "@gmail.com",
    "a@b@gmail.com",
    "ana@gmail.com.",
    "\tana@empresa.es\n",
    "a.@googlemail.com",
    "",
    // ya limpios (cleanEmail: sin espacios y en minúsculas), como se guardan, también con letras de fuera del ASCII
    "josé.garcía+cole@gmail.com",
    "müller@ejemplo.de",
    "ñandú@ejemplo.es",
  ];
  for (const e of cases) {
    const got = (await db.query<{ n: string }>(`select public.cuentos_email_norm($1) as n`, [e])).rows[0].n;
    assert.equal(got, normalizeEmail(e), JSON.stringify(e));
  }
  assert.equal((await db.query<{ n: string | null }>(`select public.cuentos_email_norm(null) as n`)).rows[0].n, null);

  // el código escribe como service role (en Supabase salta RLS): la columna generada usa la función, que anon no puede llamar
  await db.exec(`alter role service_role bypassrls; grant usage on schema public to anon, service_role; grant all on all tables in schema public to service_role;`);
  await db.exec(`set role service_role`);
  const r = (await db.query<{ email_norm: string }>(`insert into cuentos_books (public_id, draft, edition, email) values ('nuevo2345', '{}', 'illustrated', 'v.era@gmail.com') returning email_norm`)).rows[0];
  assert.equal(r.email_norm, "vera@gmail.com");
  await db.exec(`reset role; set role anon`);
  await assert.rejects(db.query(`select public.cuentos_email_norm('a@b.c')`), /permission denied/);
  await db.exec(`reset role`);

  // la consulta del límite usa el índice por buzón (con pocas filas, el planificador puede no usarlo: se le obliga)
  await db.exec(`set enable_seqscan = off`);
  const plan = (await db.query<{ "QUERY PLAN": string }>(`explain select id from cuentos_books where email_norm = 'vera@gmail.com' and created_at >= now() - interval '30 days' order by created_at desc limit 100`)).rows.map((x) => x["QUERY PLAN"]).join("\n");
  assert.match(plan, /cuentos_books_email_norm_idx/);
  await db.exec(`reset enable_seqscan`);

  // el bloqueo: la segunda inserción con la misma clave no entra (el código hace «on conflict do nothing» y mira si volvió su fila)
  await db.query(`insert into cuentos_locks (key, holder, expires_at) values ('free:x', 'a', now() + interval '20 seconds')`);
  const second = await db.query(`insert into cuentos_locks (key, holder, expires_at) values ('free:x', 'b', now() + interval '20 seconds') on conflict (key) do nothing returning holder`);
  assert.equal(second.rows.length, 0);
  // caducado, se lo queda otro solo si sigue caducado
  await db.query(`update cuentos_locks set expires_at = now() - interval '1 second' where key = 'free:x'`);
  const taken = await db.query<{ holder: string }>(`update cuentos_locks set holder = 'b', expires_at = now() + interval '20 seconds' where key = 'free:x' and expires_at < now() returning holder`);
  assert.deepEqual(taken.rows.map((x) => x.holder), ["b"]);
  const again = await db.query(`update cuentos_locks set holder = 'c' where key = 'free:x' and expires_at < now() returning holder`);
  assert.equal(again.rows.length, 0);
  await db.close();
});

test("0015: las filas de leads que ya había reciben su llave de baja, una distinta cada una, y su buzón", async () => {
  const db = await rebuilt({ before: "0015" });
  await db.query(`insert into cuentos_leads (email, marketing, edition) values ('ana.lopez+cuentos@googlemail.com', true, 'illustrated'), ('luis@example.com', false, 'illustrated')`);
  for (const f of migrations().filter((f) => f >= "0015")) await apply(db, f);
  const rows = (await db.query<{ unsubscribe_token: string; marketing_at: Date | null; email_norm: string }>(`select unsubscribe_token, marketing_at, email_norm from cuentos_leads order by email`)).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.email_norm), [normalizeEmail("ana.lopez+cuentos@googlemail.com"), "luis@example.com"]);
  assert.equal(rows[0].email_norm, "analopez@gmail.com");
  assert.ok(rows.every((r) => /^[0-9a-f-]{36}$/.test(r.unsubscribe_token)));
  assert.notEqual(rows[0].unsubscribe_token, rows[1].unsubscribe_token);
  assert.equal(rows[0].marketing_at, null, "los de antes no tienen fecha: no se guardaba");
  await assert.rejects(db.query(`update cuentos_leads set unsubscribe_token = $1`, [rows[0].unsubscribe_token]), /unique|duplicate/);
  await db.close();
});
