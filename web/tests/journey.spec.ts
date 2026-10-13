import { test, expect } from "@playwright/test";

/**
 * Páginas comunes en móvil: lead magnet, landing, legales y cookies. El flujo de creación está en crear.spec.ts
 * (el flujo antiguo de piezas salió del embudo el 13 oct, D1).
 */

const consoleErrors: string[] = [];
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
  for (const h of ["Cómo se hace", "Un libro de muestra", "Ediciones", "Cómo lo hacemos", "Preguntas"]) await expect(page.getByRole("heading", { name: h, level: 2 })).toBeVisible();
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
