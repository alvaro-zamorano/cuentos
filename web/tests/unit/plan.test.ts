import { test } from "node:test";
import assert from "node:assert/strict";
import { fichaHash, normalizeFicha, describeLookEn } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { blockedWord, moderateFicha } from "../../lib/plan/moderation";
import { planBook, rewritePage } from "../../lib/plan/planner";
import { plannerUser } from "../../lib/plan/prompt";
import { countingIn, namedIp, textInImage } from "../../lib/plan/rules";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { normalizePlan, validatePlan } from "../../lib/plan/validate";
import { MOCK_LLM, type Llm, type LlmRequest } from "../../lib/llm";

const ficha = EVAL_CASES[0];

/** LLM falso que devuelve las respuestas en orden y guarda las peticiones. */
function fakeLlm(responses: string[]): Llm & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: "anthropic",
    model: "claude-fake",
    calls,
    async complete(req) {
      calls.push(req);
      const raw = responses.shift();
      if (raw === undefined) throw new Error("sin más respuestas");
      return { raw, model: "claude-fake", usage: { input: 100, output: 200 }, ms: 5 };
    },
  };
}

test("normalizeFicha limpia y acota lo que manda el cliente", () => {
  const f = normalizeFicha({
    idea: "  Una   idea 🚀 con espacios  ",
    hero: { name: "Vera<script>", age: 40, gender: "otro", look: { hair: { shape: "rizos", color: "verde" }, glasses: "redondas", unique: "pecas" } },
    cast: [{ name: "Toby", relation: "su perro", kind: "mascota" }, { name: "Ana" }, { name: "Sobra" }],
    details: ["uno", "", "dos", "tres", "cuatro", "cinco", "seis"],
    styleId: "inventado",
    seed: 3,
  });
  assert.equal(f.idea, "Una idea con espacios");
  assert.equal(f.hero.name, "Verascript");
  assert.equal(f.hero.age, 10);
  assert.equal(f.hero.gender, "neutro");
  assert.deepEqual(f.hero.look.hair, { shape: "rizos" });
  assert.deepEqual(f.cast.map((c) => [c.id, c.kind]), [["c1", "mascota"], ["c2", "persona"]]);
  assert.equal(f.details.length, 5);
  assert.equal(f.styleId, "gouache");
  assert.equal(f.seed, 3);
  assert.notEqual(fichaHash(f), fichaHash({ ...f, seed: 4 }));
  assert.equal(fichaHash(f), fichaHash({ ...f, styleId: "flat" }), "el estilo no cambia el texto");
  assert.equal(describeLookEn(f.hero.look), "short curly hair, thin round wire glasses");
});

test("moderación: bloquea lo que no va en un cuento y deja pasar las frases hechas", () => {
  assert.equal(blockedWord("tiene una pistola de agua"), "pistola");
  assert.equal(blockedWord("se quedó muerta de risa"), null);
  assert.equal(blockedWord("guarda los juguetes en el armario"), null);
  assert.equal(blockedWord("dijo un disparate"), null);
  const bad = moderateFicha(normalizeFicha({ ...ficha, details: ["escribe a vera@example.com"] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.field, "details.0");
  assert.ok(moderateFicha(ficha).ok);
});

test("reglas: personajes con derechos, contar en la imagen y letras en la imagen", () => {
  assert.equal(namedIp("quiere ser Spiderman"), "spiderman");
  assert.equal(namedIp("juega con sus Lego"), "lego");
  assert.equal(namedIp("es un encanto de niña"), null);
  assert.equal(countingIn("sopla cinco velas"), "cinco");
  assert.equal(countingIn("sopla 5 velas"), "5");
  assert.equal(countingIn("sopla unas velas"), null);
  assert.ok(textInImage("un cartel con su nombre"));
  assert.equal(textInImage("una carta doblada"), null);
});

test("el mock da un plan válido para las 10 fichas de prueba", () => {
  for (const [i, f] of EVAL_CASES.entries()) {
    const nf = normalizeFicha(f);
    const v = validatePlan(mockPlan(nf), nf);
    assert.ok(v.ok, `caso ${i + 1}: ${v.issues.map((x) => x.msg).join(" | ")}`);
  }
});

test("validatePlan detecta lo que rompe la ilustración", () => {
  const f = normalizeFicha(ficha);
  const plan = mockPlan(f);
  plan.pages[2] = { ...plan.pages[2], scene: "Vera sopla cinco velas junto a un cartel con su nombre", extras: ["un payaso", "una señora", "un niño"], place: "p9" };
  plan.pages[3] = { ...plan.pages[3], text: "Vera se disfrazó de Elsa y Olaf la miró." };
  for (const p of plan.pages.slice(4, 8)) p.who = [];
  const v = validatePlan(plan, f);
  const all = v.issues.map((i) => i.msg).join("\n");
  assert.equal(v.usable, false);
  assert.match(all, /obliga a contar/);
  assert.match(all, /letras dentro de la imagen/);
  assert.match(all, /personajes en la imagen/);
  assert.match(all, /lugar «p9»/);
  assert.match(all, /olaf/);
  assert.match(all, /protagonista sale en/);
});

test("normalizePlan corrige tipos y descarta ids que no existen", () => {
  const f = normalizeFicha(ficha);
  const raw = { ...mockPlan(f), pages: mockPlan(f).pages.map((p) => ({ ...p, who: p.n === 1 ? "hero" : ["hero", "zz"], shot: "raro", outfit: "null" })) };
  const plan = normalizePlan(raw, f);
  assert.deepEqual(plan.pages[0].who, ["hero"]);
  assert.deepEqual(plan.pages[1].who, ["hero"]);
  assert.equal(plan.pages[1].shot, "medio");
  assert.equal(plan.pages[0].outfit, null);
});

test("planBook: corrige en la misma conversación cuando la primera respuesta no vale", async () => {
  const f = normalizeFicha(ficha);
  const good = mockPlan(f);
  const bad = { ...good, pages: good.pages.slice(0, 11) };
  const llm = fakeLlm([`Aquí va: ${JSON.stringify(bad)}`, JSON.stringify(good)]);
  const r = await planBook(f, llm);
  assert.ok(r.ok);
  assert.equal(r.attempts, 2);
  assert.equal(llm.calls.length, 2);
  const second = llm.calls[1].messages;
  assert.equal(second.length, 3);
  assert.match(String(second[2].content), /12 páginas/);
  if (r.ok) assert.equal(r.record.plan.pages.length, 12);
});

test("planBook: moderación antes de llamar, rechazo del modelo y mock sin clave", async () => {
  const llm = fakeLlm([JSON.stringify({ refusal: "la idea incluye violencia" })]);
  const blocked = await planBook({ ...ficha, idea: "una guerra con armas" }, llm);
  assert.equal(blocked.ok, false);
  assert.equal(llm.calls.length, 0, "no se llama al modelo si la moderación local ya lo para");
  const refused = await planBook(ficha, llm);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "refusal");
  const mock = await planBook(ficha, MOCK_LLM);
  assert.ok(mock.ok);
  if (mock.ok) assert.equal(mock.record.provider, "mock");
  const noName = await planBook({ ...ficha, hero: { ...ficha.hero, name: "" } }, MOCK_LLM);
  assert.equal(noName.ok, false);
});

test("rewritePage: cambia solo la página pedida y acepta nombres de la petición", async () => {
  const f = normalizeFicha(ficha);
  const plan = mockPlan(f);
  const page = { ...plan.pages[4], text: "En el parque, Vera encontró a su prima Lola, que la esperaba junto al estanque con una cometa enorme y una sonrisa todavía más grande." };
  const llm = fakeLlm([JSON.stringify(page)]);
  const r = await rewritePage(f, plan, 5, "que salga su prima Lola", llm);
  assert.ok(r.ok, r.ok ? "" : r.message);
  if (r.ok) {
    assert.equal(r.page.n, 5);
    assert.match(r.page.text, /Lola/);
  }
  const blocked = await rewritePage(f, plan, 5, "que tenga una pistola", llm);
  assert.equal(blocked.ok, false);
});

test("el prompt lleva la ficha entera y la dedicatoria del adulto tal cual", () => {
  const f = normalizeFicha(EVAL_CASES[6]);
  const user = plannerUser(f);
  assert.match(user, /Martina/);
  assert.match(user, /cópiala tal cual/);
  assert.match(user, /le ha guardado su mejor juguete/);
  const surprise = plannerUser(normalizeFicha(EVAL_CASES[3]));
  assert.match(surprise, /Sorpréndeme/);
  assert.match(surprise, /Misu/);
});

test("extractJsonObject: primer objeto completo aunque haya texto u otro objeto detrás", async () => {
  const { extractJsonObject } = await import("../../lib/llm");
  assert.deepEqual(extractJsonObject('{"a":1}\n{"b":2}'), { a: 1 });
  assert.deepEqual(extractJsonObject('texto ```json\n{"a":"x}y{","b":{"c":[1,2]}}\n```'), { a: "x}y{", b: { c: [1, 2] } });
  assert.deepEqual(extractJsonObject('{"a":"comillas \\" dentro"}'), { a: 'comillas " dentro' });
});

test("rewritePage con plazo: cada intento espera solo lo que queda de la ruta, y sin tiempo para otro no se empieza (menores de la auditoría 26 oct)", async () => {
  const f = normalizeFicha(ficha);
  const plan = mockPlan(f);
  // el modelo falla las dos veces: antes cada intento podía esperar 120 s en una ruta de 120
  const llm = fakeLlm([]);
  const deadline = Date.now() + 60_000;
  const r = await rewritePage(f, plan, 5, "que llueva", llm, { deadline });
  assert.equal(r.ok, false);
  assert.equal(llm.calls.length, 2);
  for (const c of llm.calls) assert.ok(c.timeoutMs !== undefined && c.timeoutMs <= deadline - Date.now() && c.timeoutMs > 40_000, String(c.timeoutMs));
  // con menos de 25 s por delante no se llama al modelo: la ruta responde antes de que Vercel la corte
  const late = fakeLlm(["{}"]);
  const r2 = await rewritePage(f, plan, 5, "que llueva", late, { deadline: Date.now() + 20_000 });
  assert.equal(r2.ok, false);
  assert.equal(late.calls.length, 0);
  if (!r2.ok) assert.equal(r2.status, 504);
  // sin plazo, como antes
  const free = fakeLlm(["{}"]);
  await rewritePage(f, plan, 5, "que llueva", free);
  assert.equal(free.calls[0].timeoutMs, undefined);
});
