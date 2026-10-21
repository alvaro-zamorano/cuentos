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

test("Flujo antiguo: /clasico, /ilustrado, /libro y /gratis llevan a /crear", async ({ page }) => {
  for (const path of ["/clasico", "/ilustrado", "/libro?print=1", "/gratis"]) {
    const r = await page.request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(307);
    expect(new URL(r.headers()["location"], "http://x").pathname, path).toBe("/crear");
  }
  await page.goto("/gratis");
  await expect(page).toHaveURL(/\/crear$/);
  expect(consoleErrors).toEqual([]);
});

test("Landing: estructura editorial y SEO", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Cuento personalizado/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Una frase tuya. Un libro suyo.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  for (const h of [
    "De una frase a un libro, en tres pasos.",
    "Hojea el libro de Vera.",
    "Cada uno, su historia.",
    "Lo que lo hace suyo",
    "Empiezas gratis. Pagas solo por el libro.",
    "Preguntas",
  ])
    await expect(page.getByRole("heading", { name: h, level: 2 })).toBeVisible();
  await expect(page.getByText("14,90 €").first()).toBeVisible();
  await expect(page.getByText("34,90 €").first()).toBeVisible();
  await expect(page.getByText("Tapa dura · envío incluido")).toBeVisible();
  // «peque(s)» como palabra suelta; \b no sirve porque en JS la «ñ» de «pequeño» cuenta como límite de palabra
  await expect(page.getByText(/(?<!\p{L})peques?(?!\p{L})/iu)).toHaveCount(0);
  // el cuento se escribe en el servidor: la landing no puede prometer que los datos se quedan en el navegador
  await expect(page.getByText(/se queda en tu navegador/i)).toHaveCount(0);
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

test("Cookies: PostHog solo tras aceptar (si el build lleva NEXT_PUBLIC_POSTHOG_KEY)", async ({ page }) => {
  // nada sale de verdad hacia PostHog: se cuenta y se responde aquí
  const posthogCalls: string[] = [];
  await page.route(/posthog\.com/, (route) => {
    posthogCalls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");
  const banner = page.getByTestId("cookie-consent");
  if ((await banner.count()) === 0) {
    // build sin identificador: no hay nada que consentir y no se carga nada
    await page.waitForTimeout(1500);
    expect(posthogCalls).toEqual([]);
    return;
  }
  await expect(banner).toBeVisible();
  await page.waitForTimeout(1500);
  expect(posthogCalls, "nada de PostHog antes de decidir").toEqual([]);
  await page.getByTestId("cookie-reject").click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(posthogCalls, "nada de PostHog tras rechazar").toEqual([]);
  await page.evaluate(() => localStorage.removeItem("cuentos:consent:analytics"));
  await page.reload();
  await page.getByTestId("cookie-accept").click();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  await expect.poll(() => posthogCalls.length, { message: "PostHog arranca tras aceptar" }).toBeGreaterThan(0);
});
