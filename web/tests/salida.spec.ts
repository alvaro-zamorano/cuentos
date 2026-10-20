import { test, expect } from "@playwright/test";

/**
 * Salida con la app cerrada (20 oct, lib/launch.ts): páginas de ocasión, lista de espera e interruptor.
 * Los tests de «app cerrada» solo corren con un build y un servidor con APP_ENABLED=0 (la landing lee la variable al
 * construir): `APP_ENABLED=0 npm run build && APP_ENABLED=0 npx playwright test tests/salida.spec.ts`.
 */
const CLOSED = process.env.APP_ENABLED === "0";

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text());
  });
});

test("Páginas de ocasión: índice, cinco ocasiones con título, canonical, datos estructurados y enlaces", async ({ page }) => {
  await page.goto("/cuento-personalizado");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un cuento personalizado para cada ocasión");
  const links = page.locator('main a[href^="/cuento-personalizado/"]');
  await expect(links).toHaveCount(5);

  await page.goto("/cuento-personalizado/navidad");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuento personalizado de Navidad");
  await expect(page).toHaveTitle(/Navidad/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/cuento-personalizado\/navidad$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  const types = (ld["@graph"] as { "@type": string }[]).map((x) => x["@type"]);
  expect(types).toEqual(["BreadcrumbList", "FAQPage"]);
  await expect(page.getByText("34,90 €").first()).toBeVisible();
  // pie: enlaces a todas las ocasiones
  await expect(page.getByTestId("footer").locator('a[href^="/cuento-personalizado/"]')).toHaveCount(5);

  const missing = await page.request.get("/cuento-personalizado/no-existe");
  expect(missing.status()).toBe(404);
  expect(errors).toEqual([]);
});

test("Lista de espera: la API pide email y casilla, y no deja pasar a los bots", async ({ request }) => {
  expect((await request.post("/api/lista", { data: { email: "no-es-un-email", consent: true } })).status()).toBe(400);
  expect((await request.post("/api/lista", { data: { email: "ana@ejemplo.es", consent: false } })).status()).toBe(400);
  const ok = await request.post("/api/lista", { data: { email: "ana@ejemplo.es", consent: true, idea: "navidad" } });
  expect(ok.status()).toBe(200);
  const bot = await request.post("/api/lista", { data: { email: "bot@ejemplo.es", consent: true, website: "http://spam" } });
  expect(bot.status()).toBe(200);
  expect(await bot.json()).toEqual({ ok: true });
});

test.describe("App abierta", () => {
  test.skip(CLOSED, "build con la app cerrada");

  test("Los botones de una ocasión abren /crear con su idea y la lista de espera lleva a /crear", async ({ page }) => {
    await page.goto("/cuento-personalizado/cumpleanos");
    await expect(page.locator("main").getByRole("link", { name: /Crear su cuento/ }).first()).toHaveAttribute("href", "/crear?idea=cumpleanos");
    const r = await page.request.get("/lista-de-espera?idea=navidad", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toMatch(/\/crear\?idea=navidad$/);
  });
});

test.describe("App cerrada", () => {
  test.skip(!CLOSED, "solo con APP_ENABLED=0");

  test("/crear lleva a la lista de espera y las API que gastan responden 503; las demás siguen", async ({ request }) => {
    const r = await request.get("/crear?idea=cole&b=abc12345", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toMatch(/\/lista-de-espera\?idea=cole$/);
    for (const path of ["/api/plan", "/api/libro/start", "/api/generate/run"]) {
      const res = await request.post(path, { data: {} });
      expect(res.status(), path).toBe(503);
    }
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect((await health.json()).app.enabled).toBe(false);
  });

  test("Landing y ocasiones llevan a la lista; apuntarse enseña la confirmación", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Abrimos muy pronto").first()).toBeVisible();
    await expect(page.locator('a[href="/crear"], a[href^="/crear?"]')).toHaveCount(0);
    await page.goto("/cuento-personalizado/navidad");
    await page.locator("main").getByRole("link", { name: /Avísame cuando abra/ }).first().click();
    await expect(page).toHaveURL(/\/lista-de-espera\?idea=navidad$/);
    await expect(page.getByText("te interesa: navidad")).toBeVisible();
    await page.getByLabel("Tu email").fill("ana@ejemplo.es");
    await page.getByRole("button", { name: "Avísame cuando abra" }).click();
    await expect(page.locator("form [role=alert]")).toHaveText(/Marca la casilla/);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Avísame cuando abra" }).click();
    await expect(page.getByTestId("waitlist-done")).toContainText("ana@ejemplo.es");
    expect(errors).toEqual([]);
  });
});
