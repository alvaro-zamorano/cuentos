/**
 * Novedades por email (menores de la auditoría 26 oct; Álvaro, 27 oct: la baja y el registro ahora). Sin red: un
 * Supabase de mentira con la tabla de leads en memoria, que hace upsert como PostgREST.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { MARKETING_TEXT, recordLead, unsubscribe, unsubscribeHeaders, unsubscribeOneClickUrl, unsubscribePageLink } from "../../lib/marketing";
import { normalizeEmail } from "../../lib/emailNorm";
import { APP_API, closedAction, openAction } from "../../lib/appOpen";

type Lead = {
  id: number;
  email: string;
  email_norm: string;
  edition: string;
  marketing: boolean;
  marketing_at?: string | null;
  marketing_text?: string | null;
  unsubscribe_token: string;
  unsubscribed_at?: string | null;
};
type Seed = Omit<Lead, "id" | "email_norm" | "unsubscribe_token"> & { unsubscribe_token?: string };

/** Lo justo de PostgREST para lib/marketing.ts: filtros eq, is y not-is; upsert por (email, edición); email_norm generada. */
function fakeLeads(initial: Seed[] = []) {
  const rows: Lead[] = [];
  const add = (r: Seed) => rows.push({ unsubscribe_token: crypto.randomUUID(), ...r, id: rows.length + 1, email_norm: normalizeEmail(r.email) });
  initial.forEach(add);
  const query = (filters: ((r: Lead) => boolean)[], run: (hit: Lead[]) => unknown) => {
    const q = {
      eq: (c: keyof Lead, v: unknown) => query([...filters, (r) => r[c] === v], run),
      is: (c: keyof Lead, v: null) => query([...filters, (r) => (r[c] ?? null) === v], run),
      not: (c: keyof Lead, op: "is", v: null) => query([...filters, (r) => (r[c] ?? null) !== v], run),
      limit: (n: number) => query(filters, (hit) => run(hit.slice(0, n))),
      maybeSingle: () => Promise.resolve({ data: (run(rows.filter((r) => filters.every((f) => f(r)))) as unknown[])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: run(rows.filter((r) => filters.every((f) => f(r)))), error: null }).then(ok, ko),
    };
    return q;
  };
  const client = {
    from(table: string) {
      assert.equal(table, "cuentos_leads");
      return {
        select: (cols: string) => query([], (hit) => hit.map((r) => Object.fromEntries(cols.split(",").map((c) => [c.trim(), r[c.trim() as keyof Lead]])))),
        upsert(row: Partial<Lead> & { email: string; edition: string }, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          assert.equal(opts.onConflict, "email,edition");
          const cur = rows.find((r) => r.email === row.email && r.edition === row.edition);
          if (!cur) add({ marketing: false, ...row } as Seed);
          else if (!opts.ignoreDuplicates) Object.assign(cur, row);
          return Promise.resolve({ error: null });
        },
        update: (patch: Partial<Lead>) =>
          query([], (hit) => {
            hit.forEach((r) => Object.assign(r, patch));
            return hit.map((r) => ({ id: r.id }));
          }),
      };
    },
  };
  return { db: client as unknown as SupabaseClient<Database>, rows };
}

const NOW = new Date("2026-10-27T18:00:00Z");

test("al marcar la casilla se guardan la fecha y el texto que se aceptó", async () => {
  const { db, rows } = fakeLeads();
  assert.deepEqual(await recordLead(db, { email: "ana@example.com", marketing: true, now: NOW }), { ok: true });
  assert.equal(rows[0].marketing, true);
  assert.equal(rows[0].marketing_at, NOW.toISOString());
  assert.equal(rows[0].marketing_text, MARKETING_TEXT);
});

test("empezar otro libro sin marcarla no retira un consentimiento que ya había; sin él, la fila se crea sin novedades", async () => {
  const { db, rows } = fakeLeads();
  await recordLead(db, { email: "ana@example.com", marketing: true, now: NOW });
  await recordLead(db, { email: "ana@example.com", marketing: false });
  assert.equal(rows[0].marketing, true, "antes se perdía sin que nadie lo pidiera");
  assert.equal(rows[0].marketing_text, MARKETING_TEXT);
  await recordLead(db, { email: "luis@example.com", marketing: false });
  assert.equal(rows[1].marketing, false);
  assert.equal(rows[1].marketing_at, undefined);
});

test("la baja con la llave del enlace deja de mandar novedades y apunta cuándo; una llave que no existe no toca a nadie", async () => {
  const token = crypto.randomUUID();
  const { db, rows } = fakeLeads([{ email: "ana@example.com", edition: "illustrated", marketing: true, unsubscribe_token: token }]);
  assert.deepEqual(await unsubscribe(db, token, NOW), { ok: true });
  assert.equal(rows[0].marketing, false);
  assert.equal(rows[0].unsubscribed_at, NOW.toISOString());
  // otra llave (o una mal copiada): no toca a nadie
  assert.deepEqual(await unsubscribe(db, crypto.randomUUID(), NOW), { ok: false, error: "not_found" });
  assert.deepEqual(await unsubscribe(db, "no-es-una-llave", NOW), { ok: false, error: "not_found" });
  // pulsarla otra vez dice que sí y deja la primera fecha
  assert.deepEqual(await unsubscribe(db, token, new Date("2026-11-01T00:00:00Z")), { ok: true });
  assert.equal(rows[0].unsubscribed_at, NOW.toISOString());
});

test("la baja es del buzón: todas sus filas, de cualquier edición y escritas de cualquier forma; las de otro buzón no", async () => {
  const token = crypto.randomUUID();
  const { db, rows } = fakeLeads([
    { email: "ana.lopez@gmail.com", edition: "illustrated", marketing: true, unsubscribe_token: token },
    { email: "analopez+cuentos@googlemail.com", edition: "illustrated", marketing: true },
    { email: "ana.lopez@gmail.com", edition: "classic", marketing: true },
    { email: "luis@gmail.com", edition: "illustrated", marketing: true },
  ]);
  assert.deepEqual(await unsubscribe(db, token, NOW), { ok: true });
  assert.deepEqual(rows.map((r) => [r.marketing, r.unsubscribed_at ?? null]), [
    [false, NOW.toISOString()],
    [false, NOW.toISOString()],
    [false, NOW.toISOString()],
    [true, null],
  ]);
});

test("volver a marcar la casilla no deshace una baja, tampoco con el email escrito de otra forma", async () => {
  const token = crypto.randomUUID();
  const { db, rows } = fakeLeads([{ email: "ana.lopez@gmail.com", edition: "illustrated", marketing: true, unsubscribe_token: token }]);
  assert.deepEqual(await unsubscribe(db, token, NOW), { ok: true });
  const later = new Date("2026-11-02T10:00:00Z");
  assert.deepEqual(await recordLead(db, { email: "ana.lopez@gmail.com", marketing: true, now: later }), { ok: true, unsubscribed: true });
  assert.deepEqual(await recordLead(db, { email: "analopez+otra@gmail.com", marketing: true, now: later }), { ok: true, unsubscribed: true });
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.marketing, false);
  assert.equal(rows[0].unsubscribed_at, NOW.toISOString());
  assert.equal(rows[0].marketing_at, undefined);
  // otro buzón sí se apunta
  assert.deepEqual(await recordLead(db, { email: "luis@example.com", marketing: true, now: later }), { ok: true });
  assert.equal(rows[2].marketing, true);
});

test("el enlace del email abre la página; la baja en un clic de los gestores de correo va a la API; con la app cerrada también", () => {
  const origin = "https://www.erasesuvez.com";
  assert.equal(unsubscribePageLink(origin, "abc"), "https://www.erasesuvez.com/baja?t=abc");
  assert.equal(unsubscribeOneClickUrl(origin, "abc"), "https://www.erasesuvez.com/api/baja?t=abc");
  assert.deepEqual(unsubscribeHeaders(origin, "abc"), { "List-Unsubscribe": "<https://www.erasesuvez.com/api/baja?t=abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  assert.deepEqual(closedAction("/api/baja"), { type: "pass" });
  assert.deepEqual(openAction("/api/baja"), { type: "pass" });
  assert.ok(APP_API.includes("/api/baja"));
});
