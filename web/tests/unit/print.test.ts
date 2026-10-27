/**
 * B8 (D7): libro impreso de tapa dura. Dirección, cuerpo del pedido de Gelato, medidas de la cubierta, maqueta de 30
 * páginas, y el recorrido entero en memoria: pago con dirección → páginas → «Mandar a imprimir» → imprenta → seguimiento
 * → email. Sin red: Gelato, Chromium y Resend se sustituyen por dobles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, choosePage, payDryRun, pendingPageJobs, prepareCheckout, recordStripePayment, requestPages, savePlan, startBook, updateShipping } from "../../lib/book/service";
import { completePrint, handlePrintWebhook, printCron, refreshPrint, startPrint, type PrintDeps } from "../../lib/book/print";
import { advances, coverFromApi, estimatedCover, gelatoOrderBody, gelatoOrderType, gelatoPageCount, isLandscapeHardcover, landscapeSizeMm, mapGelatoStatus, pickLandscapeHardcover, printMode, type GelatoOrder } from "../../lib/print/gelato";
import { cleanShipping, splitName } from "../../lib/print/shipping";
import { PRICE_CENTS, eur } from "../../lib/print/prices";
import { checkoutBody, printableInEnv } from "../../lib/stripe";
import { pdfBookHtml, printCoverHtml, printInteriorHtml } from "../../lib/pdf/printHtml";
import { purgeExpired, type PurgeDb } from "../../lib/purge";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { getStyle } from "../../lib/generation/styles";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", line2: "3º B", postcode: "28013", city: "Madrid", phone: "600 111 222" };

async function paidHardcover() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { store, bookId: start.bookId };
}

async function paintPages(store: ReturnType<typeof memoryStore>, bookId: string) {
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
}

function fakeDeps(over: Partial<PrintDeps> = {}) {
  const mails: string[] = [];
  const orders: Parameters<PrintDeps["createOrder"]>[0][] = [];
  let gelato: GelatoOrder = { id: "gel-0001-abcd", status: "created", orderReferenceId: null, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null };
  const deps: PrintDeps = {
    mode: "dry-run",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_pf_210x280-mm-8x11-inch_pt_170-gsm_hor",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async (i) => {
      orders.push(i);
      gelato = { ...gelato, orderReferenceId: i.orderReferenceId };
      return gelato;
    },
    getOrder: async () => gelato,
    mail: {
      sentToPrint: async (to, title, _link, address) => (mails.push(`imprenta|${to}|${title}|${address}`), { sent: true }),
      shipped: async (to, _title, url) => (mails.push(`enviado|${to}|${url}`), { sent: true }),
      reminder: async (to) => (mails.push(`recordatorio|${to}`), { sent: true }),
    },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    ...over,
  };
  return { deps, mails, orders, setGelato: (g: Partial<GelatoOrder>) => (gelato = { ...gelato, ...g }) };
}

test("dirección: Península y Baleares, nombre con apellidos y los límites de la imprenta", () => {
  const ok = cleanShipping(ADDRESS);
  assert.ok(ok.ok);
  assert.deepEqual(ok.shipping, { ...ADDRESS, phone: "600111222", country: "ES" });
  assert.ok(cleanShipping({ ...ADDRESS, postcode: "07001", city: "Palma" }).ok, "Baleares sí");
  for (const cp of ["35001", "38001", "51001", "52001"]) {
    const r = cleanShipping({ ...ADDRESS, postcode: cp });
    assert.ok(!r.ok && r.field === "postcode" && /Península y Baleares/.test(r.message), cp);
  }
  assert.equal((cleanShipping({ ...ADDRESS, name: "Ana" }) as { field: string }).field, "name");
  assert.equal((cleanShipping({ ...ADDRESS, postcode: "2801" }) as { field: string }).field, "postcode");
  assert.equal((cleanShipping({ ...ADDRESS, postcode: "99001" }) as { field: string }).field, "postcode");
  assert.equal((cleanShipping({ ...ADDRESS, line1: "Avenida de la Constitución número 1234 esc. dcha" }) as { field: string }).field, "line1");
  assert.equal((cleanShipping({ ...ADDRESS, phone: "llámame" }) as { field: string }).field, "phone");
  // demasiado larga: el servidor dice lo mismo que el formulario, no «Escribe la población» (revisión 27 oct)
  const city = cleanShipping({ ...ADDRESS, city: "San Sebastián de los Reyes del Norte" });
  assert.ok(!city.ok && city.field === "city" && city.message === "La imprenta admite 30 letras en esta línea. Abrevia el nombre de la población.", JSON.stringify(city));
  assert.equal((cleanShipping({ ...ADDRESS, city: "M" }) as { message: string }).message, "Escribe la población.");
  assert.match((cleanShipping({ ...ADDRESS, line1: "Avenida de la Constitución, 21, portal B" }) as { message: string }).message, /admite 35 letras en esta línea\. Pasa el portal/);
  assert.deepEqual(splitName("María José Fernández de la Vega Sanz"), { firstName: "María", lastName: "José Fernández de la Vega" });
});

test("Gelato: el pedido lleva el producto, las páginas, el PDF y la dirección partida en nombre y apellidos", () => {
  const s = cleanShipping(ADDRESS);
  assert.ok(s.ok);
  const body = gelatoOrderBody({ orderReferenceId: "ord-1", customerReferenceId: "abc12345", productUid: "photobooks-hardcover_x", pageCount: 30, fileUrl: "https://files/x.pdf", shipping: s.shipping, email, orderType: "draft" });
  assert.equal(body.orderType, "draft");
  assert.equal(body.currency, "EUR");
  assert.deepEqual(body.items, [{ itemReferenceId: "ord-1-1", productUid: "photobooks-hardcover_x", pageCount: 30, files: [{ type: "default", url: "https://files/x.pdf" }], quantity: 1 }]);
  assert.deepEqual(body.shippingAddress, { firstName: "Ana", lastName: "García López", addressLine1: "Calle Mayor 12", addressLine2: "3º B", city: "Madrid", postCode: "28013", country: "ES", email, phone: "600111222" });
});

test("Gelato: modo, tipo de pedido y estados", () => {
  assert.equal(printMode({ GELATO_API_KEY: "k" }), "gelato");
  assert.equal(printMode({ NEXT_PUBLIC_DRY_RUN_PAYMENT: "1" }), "dry-run");
  assert.equal(printMode({ NEXT_PUBLIC_DRY_RUN_PAYMENT: "1", VERCEL_ENV: "production" }), "none", "la imprenta simulada nunca en producción");
  assert.equal(gelatoOrderType({}), "draft", "fuera de producción, borradores");
  assert.equal(gelatoOrderType({ GELATO_ORDER_TYPE: "order" }), "order");
  assert.equal(gelatoOrderType({ VERCEL_ENV: "production" }), "order");
  assert.equal(gelatoPageCount({}), 30, "las interiores: Gelato suma las tapas");
  assert.equal(gelatoPageCount({ GELATO_PAGE_COUNT: "32" }), 32);
  // productUid reales del catálogo de Gelato (20 oct): la medida corta primero y la orientación al final
  const tail = "_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_130-gsm-65-lb-cover-coated-silk";
  const HOR = `photobooks-hardcover_pf_210x280-mm-8x11-inch${tail}_hor`;
  const HOR_IN = `photobooks-hardcover_pf_8x11-inch-210x280-mm${tail}_hor`;
  const VER = `photobooks-hardcover_pf_210x280-mm-8x11-inch${tail}_ver`;
  const SQ = `photobooks-hardcover_pf_200x200-mm-8x8-inch${tail}_ver`;
  const SOFT = "photobooks-softcover_pf_140x215-mm-5_5x8_5-inch_pt_250-gsm-100-lb-text-uncoated_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-uncoated_hor_custom";
  assert.ok(isLandscapeHardcover(HOR));
  assert.ok(isLandscapeHardcover(HOR_IN));
  assert.ok(!isLandscapeHardcover(VER), "vertical no");
  assert.ok(!isLandscapeHardcover(SQ), "el cuadrado ya no");
  assert.ok(!isLandscapeHardcover(SOFT), "tapa blanda no");
  assert.ok(!isLandscapeHardcover(`photobooks-hardcover-layflat_pf_210x280-mm${tail}_hor`), "layflat no");
  assert.deepEqual(landscapeSizeMm(HOR), { w: 280, h: 210 });
  assert.deepEqual(landscapeSizeMm(HOR_IN), { w: 280, h: 210 });
  assert.equal(landscapeSizeMm(VER), null);
  assert.equal(pickLandscapeHardcover([SQ, VER, HOR_IN, HOR, SOFT]), HOR, "la apaisada, la variante en milímetros");
  assert.equal(pickLandscapeHardcover([SQ, VER, HOR_IN]), HOR_IN);
  assert.equal(pickLandscapeHardcover(["photobooks-hardcover_pf_200x200-mm-8x8-inch"]), null);
  assert.equal(mapGelatoStatus("passed"), "sent");
  assert.equal(mapGelatoStatus("printed"), "in_production");
  assert.equal(mapGelatoStatus("in_transit"), "shipped");
  assert.equal(mapGelatoStatus("delivered"), "delivered");
  assert.ok(advances("sent", "shipped") && !advances("shipped", "in_production"), "no se vuelve atrás");
  assert.equal(eur(PRICE_CENTS.hardcover), "34,90 €");
});

test("cubierta: medidas de la API (el pliego es la unión de las áreas) y la estimada para el apaisado de 280×210", () => {
  const api = coverFromApi({
    productUid: "x",
    measureUnit: "mm",
    wraparoundEdgeSize: { width: 468, height: 325, left: 0, top: 0 },
    wraparoundInsideSize: { width: 438, height: 295, left: 15, top: 15 },
    contentBackSize: { width: 210, height: 280, left: 22.5, top: 22.5 },
    jointBackSize: { width: 7, height: 280, left: 222.5, top: 22.5 },
    spineSize: { width: 6, height: 280, left: 229.5, top: 22.5 },
    jointFrontSize: { width: 7, height: 280, left: 235.5, top: 22.5 },
    contentFrontSize: { width: 210, height: 280, left: 242.5, top: 22.5 },
  });
  assert.ok(api);
  assert.equal(api.width, 468);
  assert.equal(api.height, 325);
  assert.equal(api.front.left, 242.5);
  assert.equal(api.source, "gelato");
  assert.equal(coverFromApi({ spineSize: { width: 6, height: 280 } }), null, "sin portada ni trasera no vale");
  const est = estimatedCover();
  assert.equal(est.width, 610);
  assert.equal(est.height, 240);
  assert.ok(est.back.left + est.back.width < est.spine.left && est.spine.left + est.spine.width < est.front.left);
});

test("maqueta: 30 páginas interiores apaisadas (280×210 + sangre), ilustración a la izquierda y cubierta con portada, lomo y trasera", () => {
  const input = { plan, heroName: "Vera", from: "los abuelos", coverUrl: "https://img/cover.jpg", sheetUrl: "https://img/sheet.jpg", pageUrls: Object.fromEntries(plan.pages.map((p) => [p.n, `https://img/p${p.n}.jpg`])), date: new Date("2026-10-18T10:00:00Z") };
  const inner = printInteriorHtml(input, { trimWidth: 280, trimHeight: 210, bleed: 4 });
  assert.equal(inner.pages, 30);
  assert.equal(inner.widthMm, 288);
  assert.equal(inner.heightMm, 218);
  assert.equal((inner.html.match(/<section class="pg/g) ?? []).length, 30);
  assert.equal((inner.html.match(/class="ill"/g) ?? []).length, 12, "una ilustración por escena");
  assert.match(inner.html, /size: 288mm 218mm/);
  assert.match(inner.html, /erasesuvez\.com/, "la última página lleva la web");
  assert.doesNotMatch(inner.html, /octubre de 2026|inteligencia artificial/, "sin fecha ni explicación de cómo se hizo");
  assert.match(inner.html, /De parte de los abuelos/);
  // cada ilustración en una página par (izquierda) y su texto enfrente: portadilla 1, personajes 2, dedicatoria 3, escena 1 en la 4
  const sections = inner.html.split('<section class="pg').slice(1);
  sections.forEach((sec, i) => {
    if (sec.includes('class="ill"')) {
      assert.equal((i + 1) % 2, 0, `ilustración en la página ${i + 1}`);
      assert.match(sections[i + 1], /class="txt"/, `texto enfrente de la página ${i + 1}`);
    }
  });
  const cover = printCoverHtml(input, estimatedCover());
  assert.equal(cover.widthMm, 610);
  assert.match(cover.html, /size: 610mm 240mm/);
  assert.match(cover.html, /class="area spine"/);
  assert.match(cover.html, /erasesuvez\.com/);
  assert.doesNotMatch(cover.html, /erasesuvez\.es/, "el .es no es nuestro");
  assert.ok(cover.html.includes(plan.title.replace(/&/g, "&amp;").slice(0, 20)));
});

test("PDF que se descarga: A4 apaisado con la maqueta del libro; el gratis sin las 12 ilustraciones", () => {
  const input = { plan, heroName: "Vera", coverUrl: "https://img/cover.jpg", sheetUrl: "https://img/sheet.jpg", pageUrls: Object.fromEntries(plan.pages.map((p) => [p.n, `https://img/p${p.n}.jpg`])), date: new Date("2026-10-18T10:00:00Z") };
  const full = pdfBookHtml(input, "full");
  assert.equal(full.pages, 29, "portada, personajes, dedicatoria, 24, fin y la página de la marca");
  assert.match(full.html, /size: 297mm 210mm/);
  const sections = full.html.split('<section class="pg').slice(1);
  assert.match(sections[0], /cover\.jpg/, "la portada primero");
  sections.slice(1).forEach((sec, j) => {
    const page = j + 2;
    if (sec.includes("https://img/p")) assert.equal(page % 2, 0, `ilustración en la página ${page}: a la izquierda con la portada sola`);
  });
  const free = pdfBookHtml(input, "free");
  assert.equal(free.pages, 16, "sin retratos (antes del pago) el gratis no lleva página de personajes");
  assert.doesNotMatch(free.html, /https:\/\/img\/p\d/, "sin las ilustraciones de pago");
  assert.match(free.html, /cover\.jpg/);
  // última página (25 oct): solo la marca y la web; el libro no explica cómo se hizo
  const last = sections[sections.length - 1];
  assert.match(last, /Érase su vez/);
  assert.match(last, /erasesuvez\.com/);
  for (const html of [full.html, free.html]) assert.doesNotMatch(html, /inteligencia artificial|\bIA\b/i, "sin mencionar la IA dentro del libro");
});

test("maqueta: solo caracteres que tienen Lora y Figtree (en Vercel no hay fuentes del sistema; «✦» salía como un cuadradito)", () => {
  const input = { plan, heroName: "Vera", from: "los abuelos", coverUrl: "https://img/cover.jpg", sheetUrl: "https://img/sheet.jpg", pageUrls: Object.fromEntries(plan.pages.map((p) => [p.n, `https://img/p${p.n}.jpg`])), date: new Date("2026-10-18T10:00:00Z") };
  const htmls = {
    interior: printInteriorHtml(input, { trimWidth: 280, trimHeight: 210, bleed: 4 }).html,
    cubierta: printCoverHtml(input, estimatedCover()).html,
    full: pdfBookHtml(input, "full").html,
    free: pdfBookHtml(input, "free").html,
  };
  // latín (con acentos, ñ, «», ¿¡), puntuación general (rayas, comillas, puntos suspensivos) y el WORD JOINER de los diálogos
  const ok = /^[\u0000-ɏ‐-‧‰-⁞⁠]$/u;
  for (const [name, html] of Object.entries(htmls)) {
    const text = html
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)));
    const bad = [...new Set([...text].filter((c) => !ok.test(c)))];
    assert.deepEqual(bad, [], `${name}: caracteres sin glifo en Lora/Figtree: ${bad.map((c) => `U+${c.codePointAt(0)!.toString(16)}`).join(", ")}`);
    assert.match(html, /<svg class="star"/, `${name}: la estrella de la marca va en SVG`);
  }
});

test("Stripe: la tapa dura va en los metadatos con su nombre y su descripción", () => {
  const p = checkoutBody({ bookId: "abc12345", email, title: "Vera y Toby", amountCents: 3490, origin: "https://x", edition: "hardcover" });
  assert.equal(p.get("metadata[edition]"), "hardcover");
  assert.equal(p.get("payment_intent_data[metadata][edition]"), "hardcover");
  assert.equal(p.get("line_items[0][price_data][unit_amount]"), "3490");
  assert.match(p.get("line_items[0][price_data][product_data][name]")!, /^Libro de tapa dura/);
  assert.match(p.get("line_items[0][price_data][product_data][description]")!, /Península y Baleares/);
});

test("pago: la tapa dura pide dirección y el pedido nace esperando a que el padre lo mande a imprimir", async () => {
  const { store, bookId } = await paidHardcover();
  const sinDireccion = await prepareCheckout(store, { bookId, edition: "hardcover" });
  assert.ok(!sinDireccion.ok && sinDireccion.error === "shipping" && sinDireccion.field === "name");
  const canarias = await prepareCheckout(store, { bookId, edition: "hardcover", shipping: { ...ADDRESS, postcode: "38001" } });
  assert.ok(!canarias.ok && canarias.field === "postcode");
  const prep = await prepareCheckout(store, { bookId, edition: "hardcover", shipping: ADDRESS });
  assert.ok(prep.ok && prep.edition === "hardcover" && prep.amountCents === 3490);

  const ev = { type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", amount_total: 3490, metadata: { bookId, edition: "hardcover" } } } };
  assert.deepEqual(await recordStripePayment(store, ev), { action: "paid", bookId });
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.edition === "hardcover");
  assert.equal(v.print?.status, "awaiting_approval");
  assert.equal(v.print?.shipping?.postcode, "28013");
  const order = await store.getOrder((await store.findBook({ publicId: bookId }))!.id);
  assert.equal(order?.amountCents, 3490);

  // la dirección se puede cambiar mientras no haya salido
  const moved = await updateShipping(store, { bookId, shipping: { ...ADDRESS, postcode: "07001", city: "Palma" } });
  assert.ok(moved.ok);
  assert.equal((await bookView(store, bookId) as { print: { shipping: { city: string } } }).print.shipping.city, "Palma");
});

test("PDF solo: sin dirección y sin imprenta", async () => {
  const { store, bookId } = await paidHardcover();
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.edition === "illustrated" && v.print === null);
  assert.equal((await startPrint(store, bookId, "dry-run") as { error: string }).error, "not_hardcover");
});

test("mandar a imprimir: solo con las 12 páginas, una vez, y después el libro no se puede cambiar", async () => {
  const { store, bookId } = await paidHardcover();
  assert.ok((await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  assert.equal((await startPrint(store, bookId, "none") as { status: number }).status, 501, "sin imprenta aquí");
  assert.equal((await startPrint(store, bookId, "dry-run") as { error: string }).error, "pages_missing");
  await paintPages(store, bookId);
  // la base es la misma que la de la preview: un libro pagado de prueba no se imprime en producción
  const prod = { VERCEL_ENV: "production" };
  assert.equal((await startPrint(store, bookId, "gelato", prod) as { error: string }).error, "test_order");
  assert.equal(printableInEnv("cs_test_a1", prod), false);
  assert.equal(printableInEnv(null, prod), false);
  assert.equal(printableInEnv("cs_live_a1", prod), true);
  assert.equal(printableInEnv("dry-run:abc", { VERCEL_ENV: "preview" }), true, "en la preview, todo");

  const first = await startPrint(store, bookId, "dry-run");
  assert.ok(first.ok);
  assert.equal((await startPrint(store, bookId, "dry-run") as { error: string }).error, "already_sent", "dos clics, un pedido");
  const edited = { ...plan, pages: plan.pages.map((p) => (p.n === 1 ? { ...p, text: `${p.text} Otra frase.` } : p)) };
  assert.equal((await savePlan(store, { bookId, plan: edited }) as { error: string }).error, "printed");
  assert.ok((await savePlan(store, { bookId, plan })).ok, "el guardado automático con los mismos textos no es un cambio");
  assert.equal((await requestPages(store, { bookId, page: 1 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM) as { error: string }).error, "printed");

  const { deps, mails } = fakeDeps();
  const done = await completePrint(store, first.orderId, deps);
  assert.ok(done.ok && done.printOrderId === `dry-run:${bookId}`);
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.print?.status === "sent" && v.print.sentAt);
  assert.deepEqual(mails, [`imprenta|${email}|${plan.title}|Calle Mayor 12, 3º B, 28013 Madrid`]);
  const page = v.jobs.find((j) => j.kind === "page");
  assert.equal((await choosePage(store, { bookId, jobId: page?.id }) as { error: string }).error, "printed");
  assert.equal((await updateShipping(store, { bookId, shipping: ADDRESS }) as { error: string }).error, "printed");
});

test("imprenta real (doble): pedido con el PDF, aviso, seguimiento y un solo email de envío", async () => {
  const { store, bookId } = await paidHardcover();
  await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS });
  await paintPages(store, bookId);
  const { deps, mails, orders, setGelato } = fakeDeps({ mode: "gelato" });
  const s = await startPrint(store, bookId, "gelato");
  assert.ok(s.ok);
  const done = await completePrint(store, s.orderId, deps);
  assert.ok(done.ok && done.printOrderId === "gel-0001-abcd");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].orderReferenceId, s.orderId);
  assert.equal(orders[0].pageCount, 30);
  assert.equal(orders[0].orderType, "draft");
  assert.equal(orders[0].shipping.postcode, "28013");

  // aviso con otro id de Gelato: no se toca nada
  assert.equal(await handlePrintWebhook(store, { event: "order_status_updated", orderId: "otro-id-1234", orderReferenceId: s.orderId }, deps), "ignored");
  assert.equal(await handlePrintWebhook(store, { event: "x" }, deps), "ignored");

  setGelato({ status: "printed" });
  assert.equal(await handlePrintWebhook(store, { event: "order_status_updated", orderId: "gel-0001-abcd", orderReferenceId: s.orderId, fulfillmentStatus: "delivered" }, deps), "updated");
  assert.equal((await bookView(store, bookId) as { print: { status: string } }).print.status, "in_production", "manda lo que dice su API, no el aviso");

  setGelato({ status: "shipped", trackingUrl: "https://track.example/ES123" });
  const order = (await store.getOrderById(s.orderId))!;
  assert.equal(await refreshPrint(store, order, deps), "updated");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.print?.status === "shipped" && v.print.trackingUrl === "https://track.example/ES123");
  assert.equal(await refreshPrint(store, (await store.getOrderById(s.orderId))!, deps), "unchanged");
  assert.deepEqual(mails.filter((m) => m.startsWith("enviado")), [`enviado|${email}|https://www.erasesuvez.com/seguimiento/${s.orderId}`], "el email lleva a nuestra página");
});

test("imprenta real: sin producto o sin medidas de cubierta no se manda, y se puede reintentar", async () => {
  const { store, bookId } = await paidHardcover();
  await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS });
  await paintPages(store, bookId);
  const s = await startPrint(store, bookId, "gelato");
  assert.ok(s.ok);
  const { deps, orders } = fakeDeps({ mode: "gelato", coverGeometry: async () => null });
  const r = await completePrint(store, s.orderId, deps);
  assert.ok(!r.ok && r.error === "print_failed");
  assert.equal(orders.length, 0);
  assert.equal((await bookView(store, bookId) as { print: { status: string } }).print.status, "failed");
  assert.ok((await savePlan(store, { bookId, plan })).ok, "tras el fallo se puede seguir retocando");
  const again = await startPrint(store, bookId, "gelato");
  assert.ok(again.ok, "y volver a mandarlo");
});

test("cron: recordatorio a los 2 días (y no antes), y libera un envío atascado", async () => {
  const { store, bookId } = await paidHardcover();
  await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS });
  await paintPages(store, bookId);
  const now = Date.now();
  const at = (h: number) => () => new Date(now + h * 3_600_000);
  let { deps, mails } = fakeDeps({ now: at(1) });
  assert.equal((await printCron(store, deps)).reminded, 0);
  ({ deps, mails } = fakeDeps({ now: at(49) }));
  assert.equal((await printCron(store, deps)).reminded, 1);
  assert.deepEqual(mails, [`recordatorio|${email}`]);
  assert.equal((await printCron(store, deps)).reminded, 0, "uno por vez");
  ({ deps } = fakeDeps({ now: at(24 * 7 + 1) }));
  assert.equal((await printCron(store, deps)).reminded, 1, "el segundo, a los 7 días");
  ({ deps } = fakeDeps({ now: at(24 * 12) }));
  assert.equal((await printCron(store, deps)).reminded, 0, "y no más");

  const s = await startPrint(store, bookId, "dry-run");
  assert.ok(s.ok);
  ({ deps } = fakeDeps({ now: at(24 * 12 + 1) }));
  assert.equal((await printCron(store, deps)).unstuck, 1);
  assert.equal((await bookView(store, bookId) as { print: { status: string } }).print.status, "failed");
});

test("borrado: un libro impreso sin mandar a la imprenta no se borra al caducar", async () => {
  const kept: string[] = [];
  const db: PurgeDb = {
    expiredBooks: async () => [{ id: "a", publicId: "aaaaaaaa" }, { id: "b", publicId: "bbbbbbbb" }],
    bookFiles: async (id) => [`books/${id}/x.jpg`],
    removeFiles: async (paths) => void kept.push(...paths.map((p) => `borrado:${p}`)),
    hasPaidOrder: async () => true,
    printPending: async (id) => id === "a",
    deleteBook: async () => undefined,
    scrubPaidBook: async (id) => void kept.push(`vaciado:${id}`),
    scrubStories: async () => 0,
    scrubLeads: async () => 0,
    scrubSpend: async () => 0,
  };
  const r = await purgeExpired(db, { deadline: Date.now() + 5_000 });
  assert.equal(r.keptForPrint, 1);
  assert.equal(r.scrubbedPaid, 1);
  assert.deepEqual(kept, ["borrado:books/b/x.jpg", "vaciado:b"]);
});

test("personajes (25 oct): tras el pago, un retrato por personaje con la hoja como referencia; sin pagar, ninguno", async () => {
  const { store, bookId } = await paidHardcover();
  const before = await bookView(store, bookId);
  assert.ok(before.ok);
  assert.ok(before.jobs.every((j) => j.kind !== "portrait"), "nunca antes del pago");
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  await paintPages(store, bookId);
  const view = await bookView(store, bookId);
  assert.ok(view.ok);
  const portraits = view.jobs.filter((j) => j.kind === "portrait");
  assert.ok(view.chosen.portraits.length >= 1);
  assert.equal(portraits.length, view.chosen.portraits.length, "uno por personaje");
  assert.ok(view.chosen.portraits.every((p) => p.job), "todos pintados");
  assert.ok(portraits.every((j) => j.sheetJobId === view.chosen.sheet), "con la hoja aprobada como referencia");
  assert.equal(view.chosen.portraits[0].name, ficha.hero.name);
  // pedir otra vez no duplica
  await paintPages(store, bookId);
  const again = await bookView(store, bookId);
  assert.ok(again.ok);
  assert.equal(again.jobs.filter((j) => j.kind === "portrait").length, portraits.length);
});

test("personajes en la maqueta: retratos con su nombre debajo; sin retratos, la hoja (el gratis quita la página)", () => {
  const base = { plan, heroName: "Vera", coverUrl: "https://img/cover.jpg", sheetUrl: "https://img/sheet.jpg", pageUrls: Object.fromEntries(plan.pages.map((p) => [p.n, `https://img/p${p.n}.jpg`])), date: new Date("2026-10-18T10:00:00Z") };
  const portraits = [
    { name: "Vera", url: "https://img/r1.jpg" },
    { name: "Toby", url: "https://img/r2.jpg" },
  ];
  const full = pdfBookHtml({ ...base, portraits }, "full");
  assert.equal(full.pages, 29);
  assert.match(full.html, /r1\.jpg[^]*Vera[^]*r2\.jpg[^]*Toby/, "cada retrato con su nombre debajo, en orden");
  assert.doesNotMatch(full.html, /sheet\.jpg/, "sin la hoja con todas las vistas");
  const inner = printInteriorHtml({ ...base, portraits }, { trimWidth: 280, trimHeight: 210, bleed: 4 });
  assert.equal(inner.pages, 30);
  assert.doesNotMatch(inner.html, /sheet\.jpg/);
  // falta un retrato: el impreso no pierde la página
  const partial = printInteriorHtml({ ...base, portraits: [portraits[0], { name: "Toby", url: null }] }, { trimWidth: 280, trimHeight: 210, bleed: 4 });
  assert.equal(partial.pages, 30);
  assert.match(partial.html, /sheet\.jpg/);
  const free = pdfBookHtml(base, "free");
  assert.doesNotMatch(free.html, /sheet\.jpg|Así son los personajes/, "el gratis, sin hoja");
  assert.equal(pdfBookHtml({ ...base, portraits }, "free").pages, 17);
});

test("personajes (25 oct): con tres retratos, la fila cabe dentro del margen de seguridad del impreso y del PDF", () => {
  const base = { plan, heroName: "Vera", coverUrl: "https://img/cover.jpg", sheetUrl: "https://img/sheet.jpg", pageUrls: Object.fromEntries(plan.pages.map((p) => [p.n, `https://img/p${p.n}.jpg`])), date: new Date("2026-10-18T10:00:00Z") };
  const portraits = ["Vera", "Toby", "La abuela Carmen"].map((name, i) => ({ name, url: `https://img/r${i + 1}.jpg` }));
  const sizes = (html: string) => [...html.matchAll(/style="width:(\d+)mm;height:\1mm"/g)].map((m) => Number(m[1]));
  // impreso 280×210 con 4 mm de sangre: 288 mm de ancho; margen de seguridad 18 mm + 6 de aire por lado
  const inner = printInteriorHtml({ ...base, portraits }, { trimWidth: 280, trimHeight: 210, bleed: 4 });
  const s = sizes(inner.html);
  assert.equal(s.length, 3);
  assert.ok(3 * s[0] + 2 * 12 <= 288 - 2 * (18 + 6), `fila de ${3 * s[0] + 24} mm`);
  const full = pdfBookHtml({ ...base, portraits }, "full");
  const f = sizes(full.html);
  assert.equal(f.length, 3);
  assert.ok(f[0] <= 78);
  // con uno o dos, el tamaño de siempre
  assert.deepEqual(sizes(printInteriorHtml({ ...base, portraits: portraits.slice(0, 2) }, { trimWidth: 280, trimHeight: 210, bleed: 4 }).html), [100, 100]);
});

test("personajes (25 oct): cambiar el texto del prompt en un despliegue no invalida los retratos ya pintados", async () => {
  const { store, bookId } = await paidHardcover();
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  await paintPages(store, bookId);
  const before = await bookView(store, bookId);
  assert.ok(before.ok && before.chosen.portraits.every((p) => p.job));
  const style = getStyle(before.ficha.styleId)!;
  const old = style.promptStyle;
  try {
    (style as { promptStyle: string }).promptStyle = `${old}, slightly different wording`;
    const after = await bookView(store, bookId);
    assert.ok(after.ok);
    assert.deepEqual(after.chosen.portraits, before.chosen.portraits, "siguen siendo los mismos");
    assert.equal(after.portraitsToRequest, false, "no hay que volver a pintarlos");
  } finally {
    (style as { promptStyle: string }).promptStyle = old;
  }
});

test("personajes (25 oct): un libro ya enviado a la imprenta sin retratos no los pide", async () => {
  const { store, bookId } = await paidHardcover();
  assert.ok((await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  await paintPages(store, bookId);
  const b = (await store.findBook({ publicId: bookId }))!;
  // como un libro de antes del cambio: sin retratos
  for (const j of (await store.listJobs(b.id)).filter((j) => j.kind === "portrait")) await store.updateJob(j.id, { status: "failed", attempts: 2 });
  const order = (await store.getOrder(b.id))!;
  await store.updateOrder(order.id, { printStatus: "sent" });
  const v = await bookView(store, bookId);
  assert.ok(v.ok);
  assert.equal(v.portraitsToRequest, false);
});
