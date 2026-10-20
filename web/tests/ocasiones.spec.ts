import { test, expect } from "@playwright/test";

/** Páginas de ocasión (lib/ocasiones.ts), traídas de #18 sin la lista de espera. Con la app abierta (build de CI). */
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
  await expect(page.locator('main a[href^="/cuento-personalizado/"]')).toHaveCount(5);

  await page.goto("/cuento-personalizado/navidad");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuento personalizado de Navidad");
  await expect(page).toHaveTitle(/Navidad/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/cuento-personalizado\/navidad$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect((ld["@graph"] as { "@type": string }[]).map((x) => x["@type"])).toEqual(["BreadcrumbList", "FAQPage"]);
  await expect(page.getByText("34,90 €").first()).toBeVisible();
  await expect(page.getByTestId("footer").locator('a[href^="/cuento-personalizado/"]')).toHaveCount(5);

  expect((await page.request.get("/cuento-personalizado/no-existe")).status()).toBe(404);
  expect(errors).toEqual([]);
});

test("Con la app abierta, el botón de una ocasión abre /crear con su idea", async ({ page }) => {
  await page.goto("/cuento-personalizado/cumpleanos");
  await expect(page.locator("main").getByRole("link", { name: /Crear su cuento/ }).first()).toHaveAttribute("href", "/crear?idea=cumpleanos");
});
