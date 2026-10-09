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
  // los rasgos iniciales son aleatorios: se fijan pelo y ropa para comprobar la hoja de personaje
  await page.getByRole("button", { name: "Rizos cortos" }).click();
  await page.getByRole("button", { name: "Jersey" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "El mundo de Vera" })).toBeVisible();
  await page.getByRole("button", { name: "Su perro" }).click();
  await page.getByPlaceholder("Toby").fill("Toby");
  await page.getByRole("button", { name: /Dinosaurios/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("page-12")).toBeVisible();
  const first = page.getByLabel("Texto de la página 1", { exact: true });
  await first.fill("Vera se despertó antes que nadie.");
  await expect(page.getByRole("button", { name: "Volver al texto original" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Elige la edición" })).toBeVisible();
  // registro adulto: nada de «peque» ni exclamaciones en la interfaz
  await expect(page.getByText(/\bpeques?\b/i)).toHaveCount(0);
}

test("Clásico: de /crear al PDF de 13 hojas", async ({ page, context }) => {
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

test("Ilustrado en dry-run: pago simulado, estilo, hoja, progreso, preview y PDF", async ({ page }) => {
  await createClassic(page);
  await page.getByRole("radio", { name: /Ilustrado · PDF/ }).click();
  await page.getByTestId("go-illustrated").click();

  // pago de prueba, etiquetado con sobriedad
  await expect(page.getByRole("note")).toContainText("Pago de prueba — sin cargo");
  await expect(page.getByText("14,90 €").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId("simulate-payment")).toBeDisabled();
  await page.getByTestId("buyer-declaration").check();
  await page.getByTestId("simulate-payment").click();

  // estilo: las 6 anclas; solo gouache tiene piezas pintadas
  await expect(page.getByRole("heading", { name: "Elige el estilo" })).toBeVisible();
  for (const id of ["3d", "flat", "gouache", "papercraft", "lapiz", "acuarela"]) await expect(page.getByTestId(`style-${id}`)).toBeVisible();
  await expect(page.getByTestId("style-gouache")).toContainText("Disponible");
  await expect(page.getByTestId("style-acuarela")).toContainText("Próximamente");
  // con las anclas presentes se ven las imágenes; sin ellas, un degradado con el nombre del estilo
  const anchors = await page.request.get("/styles/flat.jpg");
  if (anchors.ok()) await expect(page.getByTestId("style-fallback")).toHaveCount(0);
  else await expect(page.getByTestId("style-fallback")).toHaveCount(6);

  // un estilo «Próximamente» se puede elegir para avisar, pero se pinta en gouache
  await page.getByTestId("style-acuarela").click();
  await expect(page.getByTestId("style-pending-choice")).toContainText("Acuarela estará disponible próximamente");
  await page.getByRole("button", { name: /Continuar en gouache/ }).click();
  await expect(page.getByRole("heading", { name: "Así va a ser Vera" })).toBeVisible();
  await expect(page.getByTestId("character-sheet").getByTestId("style-pending")).toContainText("vista en gouache");

  // hoja de personaje: tres vistas con la figura pintada y la ficha de rasgos
  for (const id of ["sheet-front", "sheet-mirror", "sheet-head"]) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId("sheet-front").locator("image[data-piece=body]")).toHaveCount(1);
  await expect(page.getByTestId("sheet-head").locator("image[data-piece=head]")).toHaveCount(1);
  await expect(page.getByTestId("sheet-hair")).toContainText("Rizos cortos");
  await expect(page.getByTestId("sheet-outfit")).toContainText("Jersey");

  // Cambiar rasgos vuelve al paso 1; al volver la hoja sigue pendiente
  await page.getByTestId("change-traits").click();
  await expect(page.getByRole("heading", { name: "¿Quién es el protagonista?" })).toBeVisible();
  await page.goto("/ilustrado");
  await expect(page.getByRole("heading", { name: "Así va a ser Vera" })).toBeVisible();

  // cambiar a un estilo disponible
  await page.getByRole("button", { name: "Otro estilo" }).click();
  await page.getByTestId("style-gouache").click();
  await expect(page.getByTestId("character-sheet").getByTestId("style-pending")).toHaveCount(0);
  await page.getByTestId("approve-sheet").click();

  // progreso: 12 casillas, sin avisos de demostración
  await expect(page.getByTestId("progress-grid").locator("[data-testid^=slot-]")).toHaveCount(12);
  await expect(page.getByText(/demostración/i)).toHaveCount(0);

  // preview ilustrado: escenas pintadas
  await expect(page.getByTestId("illustrated-pdf")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("illustrated-scene")).toHaveCount(12);
  await expect(page.getByTestId("illustrated-scene").first()).toHaveAttribute("data-painted-style", "gouache");
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
