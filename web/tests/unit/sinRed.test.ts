/**
 * Sin cobertura o con un error del servidor, la pantalla no se cuelga ni dice que el libro no existe (auditoría 26 oct,
 * I9). Sin red: un `fetch` de mentira.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { errorMessage, fetchView, loadView, postJson, runJob, timeoutFor, viewErrorMessage } from "../../lib/bookClient";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Respuestas en orden; un Error se lanza como lo haría fetch sin red. */
function fakeFetch(...answers: (Response | Error)[]) {
  let i = 0;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a.clone();
  }) as typeof fetch;
  return calls;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const view = { ok: true, bookId: "abc12345", jobs: [] };

test("postJson sin red no lanza: devuelve status 0 y un mensaje de conexión", async () => {
  fakeFetch(new TypeError("Failed to fetch"));
  const r = await postJson("/api/libro/pay", {});
  assert.equal(r.status, 0);
  assert.equal(r.json.error, "network");
  assert.match(errorMessage(r.json), /^Sin conexión/);
});

test("un 504 de Vercel en HTML dice que el servidor no responde, no «algo ha fallado»", async () => {
  fakeFetch(new Response("<html>An error occurred</html>", { status: 504 }));
  const r = await postJson("/api/libro/checkout", {});
  assert.equal(r.status, 504);
  assert.equal(r.json.error, "server");
  assert.match(errorMessage(r.json), /servidor no responde/);
});

test("loadView: un 404 es «no existe» enseguida; un 500 o sin red se reintenta y, si sigue, no dice que el enlace no vale", async () => {
  let calls = fakeFetch(json(404, { ok: false, error: "not_found" }));
  assert.deepEqual(await loadView("abc12345", { wait: 1 }), { ok: false, error: "not_found" });
  assert.equal(calls.length, 1);
  assert.match(viewErrorMessage("not_found"), /ya no es válido/);

  calls = fakeFetch(json(500, { ok: false, error: "server" }), new TypeError("Failed to fetch"), json(200, view));
  const r = await loadView("abc12345", { wait: 1 });
  assert.ok(r.ok && r.view.bookId === "abc12345");
  assert.equal(calls.length, 3);

  fakeFetch(json(500, { ok: false }));
  const server = await loadView("abc12345", { wait: 1 });
  assert.deepEqual(server, { ok: false, error: "server" });
  assert.doesNotMatch(viewErrorMessage("server"), /no es válido/);
  assert.match(viewErrorMessage("server"), /sigue guardado/);

  fakeFetch(new TypeError("Failed to fetch"));
  assert.deepEqual(await loadView("abc12345", { wait: 1 }), { ok: false, error: "network" });
  assert.match(viewErrorMessage("network"), /conexión/);
});

test("fetchView (para refrescar) hace una sola llamada y devuelve null si falla", async () => {
  const calls = fakeFetch(json(500, { ok: false }));
  assert.equal(await fetchView("abc12345"), null);
  assert.equal(calls.length, 1);
});

test("runJob sin red reintenta y acaba en «error», sin lanzar", async () => {
  const calls = fakeFetch(new TypeError("Failed to fetch"));
  const t0 = Date.now();
  // con 3 s entre intentos tardaría 9 s: se corta por el tiempo máximo
  assert.equal(await runJob("j1", undefined, 50), "error");
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(calls.length >= 1);
});

test("runJob: un corte de red entre medias no rompe nada y sigue hasta «done»", async () => {
  fakeFetch(new TypeError("Failed to fetch"), json(200, { ok: true, job: { id: "j1", status: "done" } }));
  assert.equal(await runJob("j1", undefined, 10_000), "done");
});

test("una conexión colgada no bloquea para siempre: cada ruta tiene su tiempo y se dice que va lenta", async () => {
  // las que pintan o escriben esperan a su maxDuration; el resto, segundos
  assert.equal(timeoutFor("/api/libro/pages"), 310_000);
  assert.equal(timeoutFor("/api/plan"), 310_000);
  assert.equal(timeoutFor("/api/plan/page"), 135_000);
  assert.equal(timeoutFor("/api/libro/pay"), 45_000);

  let signal: AbortSignal | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    throw new DOMException("The operation timed out.", "TimeoutError");
  }) as typeof fetch;
  const r = await postJson("/api/libro/pay", {});
  assert.ok(signal, "la petición lleva un AbortSignal");
  assert.equal(r.status, 0);
  assert.equal(r.json.error, "timeout");
  assert.match(errorMessage(r.json), /muy lenta/);
});
