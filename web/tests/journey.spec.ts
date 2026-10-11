import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Journey completo en móvil. Sin Supabase: /api/books se simula en el navegador (la app tiene que funcionar igual
 * con 503). /api/generate/* corre de verdad en el servidor con GENERATION_PROVIDER=dry-run (almacén en memoria).
 * Requiere un build con NEXT_PUBLIC_DRY_RUN_PAYMENT=1. Con CAPTURAS=1 guarda las capturas de capturas/v7/.
 */

const consoleErrors: string[] = [];
/** public_id que devuelve el /api/books simulado; el test del Ilustrado usa uno propio por ejecución. */
let mockBookId = "testbook01";

async function mockBackend(page: Page | BrowserContext) {
  const books = new Map<string, unknown>();
  await page.route("**/api/books", async (route) => {
    const body = route.request().postDataJSON() as { draft: unknown; public_id?: string };
    const id = body.public_id ?? mockBookId;
    books.set(id, body.draft);
    await route.fulfill({ json: { ok: true, public_id: id, url: `/crear?b=${id}` } });
  });
  await page.route("**/api/books/*", async (route) => {
    const id = route.request().url().split("/").pop()!;
    const draft = books.get(id);
    await route.fulfill(draft ? { json: { ok: true, book: { public_id: id, draft } } } : { status: 404, json: { ok: false } });
  });
}

const CAPTURAS = !!process.env.CAPTURAS;
async function capture(page: Page, name: string) {
  if (CAPTURAS) await page.screenshot({ path: `capturas/v7/${name}.png` });
}

type StatusJob = { id: string; kind: string; page: number | null; variant: number; status: string; key: string };
async function generationStatus(page: Page, bookId: string): Promise<StatusJob[]> {
  const res = await page.request.get(`/api/generate/status?bookId=${bookId}`);
  expect(res.ok()).toBe(true);
  const json = (await res.json()) as { ok: boolean; provider: string; jobs: StatusJob[] };
  expect(json.provider).toBe("dry-run");
  return json.jobs;
}

/** Ningún job repetido: una sola fila por (tipo, página, versión, huella). */
function expectNoDuplicates(jobs: StatusJob[]) {
  const ids = new Set(jobs.map((j) => j.id));
  const keys = new Set(jobs.map((j) => `${j.kind}:${j.page}:${j.variant}:${j.key}`));
  expect(ids.size).toBe(jobs.length);
  expect(keys.size).toBe(jobs.length);
}

function countKinds(jobs: StatusJob[]): Record<string, number> {
  return jobs.reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {});
}

test.beforeEach(async ({ page, context }) => {
  consoleErrors.length = 0;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // las anclas (public/styles/*.jpg) son binarios que pueden faltar en el checkout: la app pinta un degradado
    if (/status of 404/.test(m.text()) && /\/styles\/[a-z0-9]+\.jpg/.test(m.location().url)) return;
    consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  // window.print bloquearía la prueba: se sustituye por un contador
  await context.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints++;
    };
  });
  await mockBackend(context);
});

const DETAILS = ["Los trenes de mercancías que pasan por el puente", "Dice «ya voy» antes de bajar la escalera"];

/** Textos de las 12 páginas del paso 3. */
async function pageTexts(page: Page): Promise<string[]> {
  return page.locator("textarea[aria-label^='Texto de la página']").evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
}

/** Pasos 1 y 2 con dos detalles reales; deja la página en el paso 3 (o en el estado de escritura). */
async function toBookStep(page: Page) {
  await page.goto("/crear");
  await page.getByPlaceholder("Lucas, Vera, Mateo…").fill("Vera");
  await page.getByRole("combobox").selectOption("6");
  // los rasgos iniciales son aleatorios: se fijan pelo y ropa para comprobar la hoja de personaje
  await page.getByRole("button", { name: "Rizos cortos" }).click();
  await page.getByRole("button", { name: "Jersey" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "El mundo de Vera" })).toBeVisible();
  await page.getByRole("button", { name: "Su perro" }).click();
  await page.getByPlaceholder("Toby").fill("Toby");
  await page.getByRole("button", { name: /Dinosaurios/ }).click();
  // «Lo que solo tú sabes»: hacen falta dos detalles para continuar
  await page.getByTestId("detail-1").fill(DETAILS[0]);
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await expect(page.getByTestId("details-count")).toHaveText("1 de 5");
  await page.getByTestId("detail-2").fill(DETAILS[1]);
  await expect(page.getByTestId("details-count")).toHaveText("2 de 5");
  await page.getByRole("button", { name: "Continuar" }).click();
}

async function createClassic(page: Page) {
  await toBookStep(page);
  await expect(page.getByTestId("page-12")).toBeVisible();
  // el cuento lo escribe el motor (mock sin clave) con los detalles: alguna página los nombra
  expect((await pageTexts(page)).some((t) => /trenes|mercancías|escalera/.test(t))).toBe(true);
  const first = page.getByLabel("Texto de la página 1", { exact: true });
  await first.fill("Vera se despertó antes que nadie.");
  await expect(page.getByRole("button", { name: "Volver al texto original" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Elige la edición" })).toBeVisible();
  // registro adulto: nada de «peque» ni exclamaciones en la interfaz
  await expect(page.getByText(/\bpeques?\b/i)).toHaveCount(0);
}

test("Clásico: de /crear al PDF de 13 hojas", async ({ page, context }) => {
  mockBookId = "testbook01";
  await createClassic(page);
  await page.getByPlaceholder("tu@email.com").fill("prueba@example.com");
  await page.getByRole("checkbox").first().check();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Descargar PDF" }).click()]);
  await expect(page.getByTestId("book-link")).toContainText("/crear?b=testbook01");

  await tab.waitForLoadState();
  await expect(tab.locator("section.sheet")).toHaveCount(13);
  await expect(tab.getByText("Vera se despertó antes que nadie.")).toBeVisible();
  await expect(tab.locator("[data-edition=classic]")).toBeVisible();
  await expect.poll(() => tab.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBeGreaterThan(0);

  // el texto editado persiste al recargar
  await page.goto("/crear?paso=3");
  await expect(page.getByLabel("Texto de la página 1", { exact: true })).toHaveValue("Vera se despertó antes que nadie.");
  expect(consoleErrors).toEqual([]);
});

test("Ilustrado: email, muestra con 11 páginas bloqueadas, pago simulado, libro y PDF", async ({ page }) => {
  // el almacén en memoria del servidor vive mientras dure el proceso: un libro nuevo por ejecución
  const bookId = `t${Date.now().toString(36)}`;
  mockBookId = bookId;
  // /api/generate/run se retrasa a voluntad para ver los estados de espera
  let runDelay = 0;
  await page.route("**/api/generate/run", async (route) => {
    await new Promise((r) => setTimeout(r, runDelay));
    await route.continue();
  });

  await createClassic(page);
  // paso 4: dos ediciones; la tapa dura queda como línea dentro del Ilustrado
  await expect(page.getByRole("radio")).toHaveCount(2);
  await page.getByRole("radio", { name: /Ilustrado · PDF/ }).click();
  await expect(page.getByRole("radio", { name: /Ilustrado · PDF/ })).toContainText("Tu hijo pintado en cada página");
  await expect(page.getByRole("radio", { name: /Ilustrado · PDF/ })).toContainText("Tapa dura (desde 39,90 €): próximamente.");
  await page.getByPlaceholder("tu@email.com").fill("prueba@example.com");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("heading", { name: "Elige la edición" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await capture(page, "1-paso4");
  await page.getByRole("button", { name: "Ver cómo quedaría" }).scrollIntoViewIfNeeded();
  await capture(page, "1b-paso4-formulario");

  runDelay = 2500;
  await page.getByRole("button", { name: "Ver cómo quedaría" }).click();
  await expect(page).toHaveURL(/\/ilustrado$/);

  // espera sobria: sin porcentajes, tres líneas
  const waiting = page.getByTestId("sample-waiting");
  await expect(waiting.getByRole("heading", { name: "Pintando a Vera" })).toBeVisible();
  await expect(waiting.getByRole("listitem")).toHaveCount(3);
  await expect(waiting).not.toContainText("%");
  await capture(page, "2-espera-muestra");
  runDelay = 0;

  // muestra: hoja + página 9 + las otras 11 bloqueadas con su texto, y la CTA con el precio
  await expect(page.getByTestId("sample")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("character-sheet")).toBeVisible();
  await expect(page.getByTestId("sheet-hair")).toContainText("Rizos cortos");
  await expect(page.getByTestId("sample-page").getByTestId("illustrated-scene")).toHaveAttribute("data-painted-style", "gouache");
  await expect(page.getByTestId("test-preview-label").first()).toHaveText("Vista previa sin ilustrar (modo de prueba)");
  const locked = page.getByTestId("locked-page");
  await expect(locked).toHaveCount(11);
  await expect(locked.first()).toContainText("Se pinta al confirmar");
  await expect(page.locator("[data-testid=locked-page][data-page='9']")).toHaveCount(0);
  for (const n of [1, 12]) await expect(page.locator(`[data-testid=locked-page][data-page='${n}'] p.story`)).not.toHaveText("");
  const cta = page.getByTestId("cta-illustrate");
  await expect(cta).toHaveText("Ilustrar el libro completo · 14,90 €");
  await expect(cta).toBeInViewport();
  await capture(page, "3a-muestra-hoja");
  await page.getByTestId("sample-page").scrollIntoViewIfNeeded();
  await capture(page, "3b-muestra-pagina9");
  await locked.nth(0).scrollIntoViewIfNeeded();
  await capture(page, "3c-muestra-bloqueo-cta");
  await page.evaluate(() => window.scrollTo(0, 0));

  let jobs = await generationStatus(page, bookId);
  expect(countKinds(jobs)).toEqual({ sheet: 1, sample: 1 });
  expect(jobs.every((j) => j.status === "done")).toBe(true);
  expect(jobs.find((j) => j.kind === "sample")!.page).toBe(9);

  // recargar no crea ningún job
  await page.reload();
  await expect(page.getByTestId("locked-page")).toHaveCount(11);
  const reloaded = await generationStatus(page, bookId);
  expect(reloaded.map((j) => j.id)).toEqual(jobs.map((j) => j.id));

  // «Otra versión de la hoja»: dos como máximo; al agotarse, el botón desaparece y se explica
  await expect(page.getByTestId("sheet-versions-note")).toHaveText("Puedes pedir otra versión dos veces.");
  await page.getByTestId("sheet-another").click();
  await expect(page.getByTestId("sheet-version-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sheet-versions-note")).toHaveText("Puedes pedir otra versión una vez más.");
  await page.getByTestId("sheet-another").click();
  await expect(page.getByTestId("sheet-version-3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sheet-another")).toHaveCount(0);
  await expect(page.getByTestId("sheet-versions-note")).toHaveText("Ya has pedido las dos versiones adicionales de la hoja.");
  // se elige la versión 2 como referencia del libro
  await page.getByTestId("sheet-version-2").click();
  jobs = await generationStatus(page, bookId);
  expect(countKinds(jobs)).toEqual({ sheet: 3, sample: 1 });

  // pago simulado: sin volver a pedir la declaración del tutor
  await cta.click();
  await expect(page.getByRole("note")).toContainText("Pago de prueba — sin cargo");
  await expect(page.getByText("14,90 €").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId("buyer-declaration")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  runDelay = 400;
  await page.getByTestId("simulate-payment").click();

  // progreso por página: 12 páginas + portada; la 9 ya está pintada
  const grid = page.getByTestId("progress-grid");
  await expect(grid.locator("[data-testid^=slot-]")).toHaveCount(13);
  await expect(page.getByTestId("slot-9")).toHaveAttribute("data-done", "1");
  await expect.poll(() => grid.locator("[data-done='1']").count()).toBeGreaterThanOrEqual(3);
  await capture(page, "4-progreso-pago");
  runDelay = 0;

  // libro: 12 páginas pintadas y PDF
  await expect(page.getByTestId("illustrated-pdf")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("illustrated-scene")).toHaveCount(12);
  await expect(page.getByTestId("illustrated-scene").first()).toHaveAttribute("data-painted-style", "gouache");
  await capture(page, "5-libro");
  jobs = await generationStatus(page, bookId);
  expect(countKinds(jobs)).toEqual({ sheet: 3, sample: 1, page: 11, cover: 1 });
  expect(jobs.filter((j) => j.kind === "page").map((j) => j.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12]);
  expect(jobs.every((j) => j.status === "done")).toBe(true);
  expectNoDuplicates(jobs);

  // recargar el libro no crea jobs
  await page.reload();
  await expect(page.getByTestId("illustrated-pdf")).toBeVisible();
  expect((await generationStatus(page, bookId)).length).toBe(jobs.length);

  // «Otra versión» de una página: una como máximo; después se elige entre las dos
  const scene3 = page.getByTestId("page-3").getByTestId("illustrated-scene");
  await expect(scene3).toHaveAttribute("data-variant", "0");
  await page.getByTestId("regen-3").click();
  await expect(page.getByTestId("version-3-2")).toHaveAttribute("aria-pressed", "true");
  await expect(scene3).toHaveAttribute("data-variant", "1");
  await expect(page.getByTestId("regen-3")).toHaveCount(0);
  await expect(page.getByTestId("versions-3")).toContainText("Ya has pedido la otra versión de esta página.");
  jobs = await generationStatus(page, bookId);
  expect(countKinds(jobs)).toEqual({ sheet: 3, sample: 1, page: 12, cover: 1 });
  expectNoDuplicates(jobs);
  await page.getByLabel("Texto de la página 2", { exact: true }).fill("Texto cambiado en el ilustrado.");

  // persiste tras recargar
  await page.reload();
  await expect(page.getByTestId("page-3").getByTestId("illustrated-scene")).toHaveAttribute("data-variant", "1");
  await expect(page.getByLabel("Texto de la página 2", { exact: true })).toHaveValue("Texto cambiado en el ilustrado.");

  // PDF ilustrado: 13 hojas
  await page.goto("/libro?edition=illustrated&print=1");
  await expect(page.locator("[data-edition=illustrated]")).toBeVisible();
  await expect(page.locator("section.sheet")).toHaveCount(13);
  await expect(page.getByTestId("illustrated-scene")).toHaveCount(12);
  await expect(page.locator("[data-page='3']").getByTestId("illustrated-scene")).toHaveAttribute("data-variant", "1");
  await expect(page.getByText("Texto cambiado en el ilustrado.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBeGreaterThan(0);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(13);
  expect(consoleErrors).toEqual([]);
});

test("Ilustrado: cambiar de estilo antes de pagar avisa antes de pintar otra muestra", async ({ page }) => {
  mockBookId = `s${Date.now().toString(36)}`;
  await createClassic(page);
  await page.getByRole("radio", { name: /Ilustrado · PDF/ }).click();
  await page.getByPlaceholder("tu@email.com").fill("estilo@example.com");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Ver cómo quedaría" }).click();
  await expect(page.getByTestId("sample")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /Estilo/ }).click();
  await expect(page.getByRole("heading", { name: "Elige el estilo" })).toBeVisible();
  await expect(page.getByText(/La muestra está pintada en gouache/)).toBeVisible();
  // un estilo «Próximamente» se anota y se sigue pintando en gouache: la muestra vale
  await page.getByTestId("style-acuarela").click();
  await expect(page.getByTestId("style-pending-choice")).toContainText("Acuarela estará disponible próximamente");
  await page.getByRole("button", { name: /Continuar en gouache/ }).click();
  await expect(page.getByTestId("sample")).toBeVisible();
  // un estilo disponible distinto invalida la muestra: se avisa y no se pinta hasta confirmar
  await page.getByRole("button", { name: /Estilo/ }).click();
  await page.getByTestId("style-flat").click();
  await expect(page.getByTestId("sample-stale")).toBeVisible();
  const before = await generationStatus(page, mockBookId);
  expect(before.length).toBe(2);
  await page.getByTestId("sample-repaint").click();
  await expect(page.getByTestId("sample")).toBeVisible({ timeout: 20_000 });
  const after = await generationStatus(page, mockBookId);
  expect(countKinds(after)).toEqual({ sheet: 2, sample: 2 });
  expectNoDuplicates(after);
  expect(consoleErrors).toEqual([]);
});

test("Historia: estado de escritura y «Escribirlo de otra manera»", async ({ page }) => {
  // el mock responde al instante: se retrasa la respuesta para ver el estado de escritura
  let calls = 0;
  await page.route("**/api/story", async (route) => {
    calls++;
    await new Promise((r) => setTimeout(r, 1800));
    await route.continue();
  });
  await toBookStep(page);
  const writing = page.getByTestId("story-writing");
  await expect(writing.getByRole("heading", { name: "Escribiendo el cuento de Vera" })).toBeVisible();
  await expect(writing.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await expect(page.getByTestId("page-12")).toBeVisible();
  await expect(writing).toHaveCount(0);
  await expect(page.getByTestId("story-base-note")).toHaveCount(0);
  const before = await pageTexts(page);
  expect(before).toHaveLength(12);
  expect(before.some((t) => /trenes|mercancías|escalera/.test(t))).toBe(true);
  // la portada usa el título del cuento escrito
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("");

  await page.getByTestId("story-rewrite").click();
  await expect(writing).toBeVisible();
  await expect(page.getByTestId("page-12")).toBeVisible();
  const after = await pageTexts(page);
  expect(after.some((t, i) => t !== before[i])).toBe(true);
  await expect(page.getByText("Puedes pedir otra versión una vez más.")).toBeVisible();
  expect(calls).toBe(2);

  // al volver al paso 3 no se vuelve a escribir: la historia vale para las mismas entradas
  await page.goto("/crear?paso=3");
  await expect(page.getByTestId("page-12")).toBeVisible();
  expect(await pageTexts(page)).toEqual(after);
  expect(calls).toBe(2);
  expect(consoleErrors).toEqual([]);
});

test("Ilustrado sin terminar: /libro?edition=illustrated no imprime", async ({ page }) => {
  await createClassic(page);
  await page.goto("/libro?edition=illustrated&print=1");
  await expect(page.getByText("La edición ilustrada de este cuento aún no está terminada.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(0);
});

test("Lead magnet /gratis abre el cuento demo", async ({ page, context }) => {
  await page.goto("/gratis");
  await page.getByPlaceholder("tu@email.com").fill("demo@example.com");
  await page.getByRole("checkbox").first().check();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Descargar PDF" }).click()]);
  await expect(page.getByTestId("gratis-ok")).toBeVisible();
  await tab.waitForLoadState();
  await expect(tab.locator("section.sheet")).toHaveCount(13);
  await expect(tab.getByRole("heading", { level: 1 })).toContainText("Lucas");
  await expect(tab.getByText("Toby").first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("Landing: estructura editorial y SEO", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Cuento personalizado/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un libro escrito y pintado para un solo lector.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  for (const h of ["Cómo se hace", "Una doble página", "Ediciones", "Cómo lo hacemos", "Preguntas"]) await expect(page.getByRole("heading", { name: h, level: 2 })).toBeVisible();
  await expect(page.getByText("14,90 €").first()).toBeVisible();
  await expect(page.getByText("desde 39,90 €").first()).toBeVisible();
  await expect(page.getByText(/\bpeques?\b/i)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("Páginas legales enlazadas desde el footer", async ({ page }) => {
  await page.goto("/");
  for (const [name, path] of [
    ["Privacidad", "/privacidad"],
    ["Condiciones", "/condiciones"],
    ["Aviso legal", "/aviso-legal"],
  ] as const) {
    await page.getByTestId("footer").getByRole("link", { name }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByTestId("legal-draft")).toHaveText("Borrador pendiente de revisión legal");
    await page.goto("/");
  }
  await page.goto("/condiciones");
  await expect(page.getByText("art. 103.c)")).toBeVisible();
});

test("Cookies: Clarity solo tras aceptar (si el build lleva NEXT_PUBLIC_CLARITY_ID)", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByTestId("cookie-consent");
  if ((await banner.count()) === 0) {
    // build sin identificador de Clarity: no hay nada que consentir y no se carga nada
    await expect(page.locator("#ms-clarity")).toHaveCount(0);
    return;
  }
  await expect(banner).toBeVisible();
  await page.getByTestId("cookie-reject").click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator("#ms-clarity")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("cuentos:consent:analytics"));
  await page.reload();
  await page.getByTestId("cookie-accept").click();
  await expect(page.locator("#ms-clarity")).toHaveCount(1);
});

test("Constructor: vista clásica y vista ilustrada con los mismos rasgos", async ({ page }) => {
  await page.goto("/crear");
  await expect(page.getByTestId("builder-previews")).toBeVisible();
  await expect(page.getByTestId("builder-painted").locator("image[data-piece=head]")).toHaveCount(1);
  await expect(page.getByTestId("builder-painted").locator("image[data-piece=body]")).toHaveCount(1);
});
