/**
 * Novedades por email (menores de la auditoría 26 oct; Álvaro, 27 oct: la baja y el registro ahora). Sin red: un
 * Supabase de mentira con la tabla de leads en memoria, que hace upsert como PostgREST.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { MARKETING_TEXT, recordLead, unsubscribe, unsubscribeLink } from "../../lib/marketing";
import { APP_API, closedAction, openAction } from "../../lib/appOpen";

type Lead = { email: string; edition: string; marketing: boolean; marketing_at?: string | null; marketing_text?: string | null; unsubscribe_token: string; unsubscribed_at?: string | null };

function fakeLeads(initial: Lead[] = []) {
  const rows = [...initial];
  const client = {
    from(table: string) {
      assert.equal(table, "cuentos_leads");
      return {
        upsert(row: Partial<Lead> & { email: string; edition: string }, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          assert.equal(opts.onConflict, "email,edition");
          const cur = rows.find((r) => r.email === row.email && r.edition === row.edition);
          if (!cur) rows.push({ marketing: false, unsubscribe_token: crypto.randomUUID(), ...row } as Lead);
          else if (!opts.ignoreDuplicates) Object.assign(cur, row);
          return Promise.resolve({ error: null });
        },
        update(patch: Partial<Lead>) {
          return {
            eq: (c: keyof Lead, v: string) => ({
              select: () => {
                const hit = rows.filter((r) => r[c] === v);
                hit.forEach((r) => Object.assign(r, patch));
                return Promise.resolve({ data: hit.map((_, i) => ({ id: i + 1 })), error: null });
              },
            }),
          };
        },
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

test("la baja con la llave del enlace deja de mandar novedades y apunta cuándo; volver a marcar la casilla la deshace", async () => {
  const token = crypto.randomUUID();
  const { db, rows } = fakeLeads([{ email: "ana@example.com", edition: "illustrated", marketing: true, unsubscribe_token: token }]);
  assert.deepEqual(await unsubscribe(db, token, NOW), { ok: true });
  assert.equal(rows[0].marketing, false);
  assert.equal(rows[0].unsubscribed_at, NOW.toISOString());
  // otra llave (o una mal copiada): no toca a nadie
  assert.deepEqual(await unsubscribe(db, crypto.randomUUID(), NOW), { ok: false, error: "not_found" });
  assert.deepEqual(await unsubscribe(db, "no-es-una-llave", NOW), { ok: false, error: "not_found" });
  await recordLead(db, { email: "ana@example.com", marketing: true, now: NOW });
  assert.equal(rows[0].marketing, true);
  assert.equal(rows[0].unsubscribed_at, null);
});

test("el enlace de baja lleva la llave; la baja funciona también con la app cerrada", () => {
  assert.equal(unsubscribeLink("https://www.erasesuvez.com", "abc"), "https://www.erasesuvez.com/baja?t=abc");
  assert.deepEqual(closedAction("/api/baja"), { type: "pass" });
  assert.deepEqual(openAction("/api/baja"), { type: "pass" });
  assert.ok(APP_API.includes("/api/baja"));
});
