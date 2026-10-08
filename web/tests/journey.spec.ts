import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Journey completo en móvil. Sin Supabase: /api/books y /api/jobs se simulan en el navegador
 * (la app tiene que funcionar igual con 503). Requiere un build con NEXT_PUBLIC_DRY_RUN_PAYMENT=1.
 */

const consoleErrors: string[] = [];

async function mockBackend(page: Page | BrowserContext) {
  const books = new Map<string, unknown>();
  await page.route("**/api/books", async (route) => {
    const body = route.request().postDataJSON() as { draft: unknown; public_id?: string };
    const id = body.public_id ?? "testbook01";
    books.set(id, body.draft);
    await route.fulfill({ json: { ok: true, public_id: id, url: `/crear?b=${id}` } });
  });
  await page.route("**/api/books/*", async (route) => {
    const id = route.request().url().split("/").pop()!;
    const draft = books.get(id);
    await route.fulfill(draft ? { json: { ok: true, book: { public_id: id, draft } } } : { status: 404, json: { ok: false } });
  });
  await page.route("**/api/jobs", async (route) => {
    const body = route.request().postDataJSON() as { kind: string; dry_run?: boolean };
    expect(body.dry_run).toBe(true);
    expect(body.kind).toBe("sheet");
    await route.fulfill({ json: { ok: true, jobs: ["00000000-0000-0000-0000-000000000001"], dry_run: true } });
  });
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

async function createClassic(page: Page) {
  await page.goto("/crear");
  await page.getByPlaceholder("Lucas, Vera, Mateo…").fill("Vera");
  await page.getByRole("combobox").selectOption("6");
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("heading", { name: "El mundo de Vera" })).toBeVisible();
  await page.getByRole("button", { name: "Su perro" }).click();
  await page.getByPlaceholder("Toby").fill("Toby");
  await page.getByRole("button", { name: /Dinosaurios/ }).click();
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByTestId("page-12")).toBeVisible();
  const first = page.getByLabel("Texto de la página 1", { exact: true });
  await first.fill("Vera se despertó antes que nadie.");
  await expect(page.getByRole("button", { name: "Volver al texto original" })).toBeVisible();
  await page.getByRole("button", { name: "Me gusta, a imprimir" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo lo quieres?" })).toBeVisible();
}

test("Clásico: de /crear al PDF de 13 hojas", async ({ page, context }) => {
  await createClassic(page);
  await page.getByPlaceholder("tu@email.com").fill("prueba@example.com");
  await page.getByRole("checkbox").first().check();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Abrir el PDF para imprimir" }).click()]);
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

test("Ilustrado en dry-run: pago simulado, estilo, hoja, progreso, preview y PDF", async ({ page }) => {
  await createClassic(page);
  await page.getByRole("button", { name: /Ilustrado · PDF/ }).click();
  await page.getByTestId("go-illustrated").click();

  // pago simulado, claramente etiquetado
  await expect(page.getByRole("note")).toContainText("PAGO SIMULADO");
  await expect(page.getByTestId("simulate-payment")).toBeDisabled();
  await page.getByTestId("buyer-declaration").check();
  await page.getByTestId("simulate-payment").click();

  // estilo: las 6 anclas
  await expect(page.getByRole("heading", { name: "Elige el estilo" })).toBeVisible();
  for (const id of ["3d", "flat", "gouache", "papercraft", "lapiz", "acuarela"]) await expect(page.getByTestId(`style-${id}`)).toBeVisible();
  // con las anclas presentes se ven las imágenes; sin ellas, un degradado con el nombre del estilo
  const anchors = await page.request.get("/styles/flat.jpg");
  if (anchors.ok()) await expect(page.getByTestId("style-fallback")).toHaveCount(0);
  else await expect(page.getByTestId("style-fallback")).toHaveCount(6);
  await page.getByTestId("style-acuarela").click();

  // hoja de personaje: acuarela no tiene pelo ni ropa → provisional
  await expect(page.getByRole("heading", { name: "Así va a ser Vera" })).toBeVisible();
  await expect(page.getByTestId("sheet-hair")).toHaveAttribute("data-provisional", "1");
  await expect(page.getByTestId("sheet-outfit")).toHaveAttribute("data-provisional", "1");
  await expect(page.getByTestId("sheet-skin")).toHaveAttribute("data-provisional", "0");
  await expect(page.getByText("provisional").first()).toBeVisible();

  // Cambiar rasgos vuelve al paso 1; al volver la hoja sigue pendiente
  await page.getByTestId("change-traits").click();
  await expect(page.getByRole("heading", { name: "¿Quién es el protagonista?" })).toBeVisible();
  await page.goto("/ilustrado");
  await expect(page.getByRole("heading", { name: "Así va a ser Vera" })).toBeVisible();

  // cambiar a un estilo sin huecos
  await page.getByRole("button", { name: "Otro estilo" }).click();
  await page.getByTestId("style-flat").click();
  await expect(page.getByTestId("sheet-hair")).toHaveAttribute("data-provisional", "0");
  await page.getByTestId("approve-sheet").click();

  // progreso: 12 casillas
  await expect(page.getByTestId("progress-grid").locator("[data-testid^=slot-]")).toHaveCount(12);
  await expect(page.getByText("Vista previa de demostración: las ilustraciones finales se generan tras el pago").first()).toBeVisible();

  // preview ilustrado
  await expect(page.getByTestId("dry-run-notice")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("illustrated-scene")).toHaveCount(12);
  const scene3 = page.getByTestId("page-3").getByTestId("illustrated-scene");
  await expect(scene3).toHaveAttribute("data-variant", "0");
  await page.getByTestId("regen-3").click();
  await expect(scene3).toHaveAttribute("data-variant", "1");
  await page.getByLabel("Texto de la página 2", { exact: true }).fill("Texto cambiado en el ilustrado.");

  // persiste tras recargar
  await page.reload();
  await expect(page.getByTestId("page-3").getByTestId("illustrated-scene")).toHaveAttribute("data-variant", "1");
  await expect(page.getByLabel("Texto de la página 2", { exact: true })).toHaveValue("Texto cambiado en el ilustrado.");

  // PDF ilustrado
  await page.goto("/libro?edition=illustrated&print=1");
  await expect(page.locator("[data-edition=illustrated]")).toBeVisible();
  await expect(page.locator("section.sheet")).toHaveCount(13);
  await expect(page.getByTestId("illustrated-scene")).toHaveCount(12);
  await expect(page.getByText("Texto cambiado en el ilustrado.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBeGreaterThan(0);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(13);
  expect(consoleErrors).toEqual([]);
});

test("Ilustrado sin terminar: /libro?edition=illustrated no imprime", async ({ page }) => {
  await createClassic(page);
  await page.goto("/libro?edition=illustrated&print=1");
  await expect(page.getByText("Este cuento aún no tiene la edición ilustrada terminada.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(0);
});

test("Lead magnet /gratis abre el cuento demo", async ({ page, context }) => {
  await page.goto("/gratis");
  await page.getByPlaceholder("tu@email.com").fill("demo@example.com");
  await page.getByRole("checkbox").first().check();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Descargar en PDF" }).click()]);
  await expect(page.getByTestId("gratis-ok")).toBeVisible();
  await tab.waitForLoadState();
  await expect(tab.locator("section.sheet")).toHaveCount(13);
  await expect(tab.getByRole("heading", { level: 1 })).toContainText("Lucas");
  await expect(tab.getByText("Toby").first()).toBeVisible();
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
