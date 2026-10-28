/**
 * Auditoría 26 oct, menores: «Tus cuentos te esperan» manda cada enlace solo al email guardado en su libro, nunca al
 * alias que se acaba de escribir (el límite cuenta por buzón: vera+otro@gmail.com es vera@gmail.com). Y se manda antes
 * de responder, para que la pantalla no diga que han salido si no han salido.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { startBook, type FreeLimitFail } from "../../lib/book/service";
import { mailYourBooks } from "../../lib/book/freeLimit";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const start = (store: ReturnType<typeof memoryStore>, email: string) => startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);

/** Tres libros del mismo buzón con dos direcciones guardadas, y un cuarto intento con otro alias. */
async function fullMailbox() {
  const store = memoryStore(newMemoryState());
  const savedIn = new Map<string, string>();
  for (const e of ["vera@gmail.com", "vera@gmail.com", "v.era+cole@gmail.com"]) {
    const r = await start(store, e);
    assert.ok(r.ok, JSON.stringify(r));
    savedIn.set(r.bookId, e);
  }
  const r = await start(store, "VERA+otro@gmail.com");
  assert.ok(!r.ok && r.error === "free_limit", JSON.stringify(r));
  return { books: (r as FreeLimitFail).books, savedIn };
}

test("cada enlace va solo al email guardado en su libro, nunca al alias escrito; uno por email", async () => {
  const { books, savedIn } = await fullMailbox();
  assert.deepEqual(
    books.map((b) => [b.publicId, b.email]).sort(),
    [...savedIn].sort(),
    "cada libro lleva el email con el que se guardó",
  );
  const sent: { to: string; links: string[] }[] = [];
  const mailed = await mailYourBooks(books, "https://erasesuvez.com", async (to, list) => {
    sent.push({ to, links: list.map((b) => b.link) });
    return { sent: true };
  });
  assert.equal(mailed, true);
  assert.deepEqual(sent.map((s) => s.to).sort(), ["v.era+cole@gmail.com", "vera@gmail.com"], "uno por email guardado, ninguno al alias escrito");
  for (const s of sent)
    for (const link of s.links) {
      const id = new URL(link).searchParams.get("b")!;
      assert.equal(savedIn.get(id), s.to, `${link} va a ${s.to}`);
    }
  assert.deepEqual(sent.map((s) => s.links.length).sort(), [1, 2], "los dos de vera@gmail.com van juntos");
});

test("si el correo no sale, se dice; sin el correo configurado, la pantalla dice lo de siempre", async () => {
  const { books } = await fullMailbox();
  assert.equal(await mailYourBooks(books, "https://x", async () => ({ sent: false, reason: "resend_500" })), false);
  let n = 0;
  const oneFails = async () => (n++ === 0 ? Promise.reject(new Error("red")) : { sent: true });
  assert.equal(await mailYourBooks(books, "https://x", oneFails), false, "si uno no sale, no se dice que han salido");
  const hangs = () => new Promise<{ sent: boolean }>(() => {});
  const t0 = Date.now();
  assert.equal(await mailYourBooks(books, "https://x", hangs, 50), false, "sin respuesta a tiempo, no ha salido");
  assert.ok(Date.now() - t0 < 2000, "no se queda esperando");
  assert.equal(await mailYourBooks(books, "https://x", async () => ({ sent: false, reason: "sin_configurar" })), null);
  assert.equal(await mailYourBooks([], "https://x", async () => ({ sent: true })), false, "sin emails guardados, nada ha salido");
});
