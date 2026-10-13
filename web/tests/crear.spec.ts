import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";

/**
 * Flujo nuevo de /crear (B2–B4) en móvil, sin coste: planificador `mock` e imágenes `dry-run` (playwright.config.ts
 * los fuerza) y almacén en memoria (sin Supabase en local). Requiere build con NEXT_PUBLIC_DRY_RUN_PAYMENT=1.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/status of 404/.test(m.text()) && /\/styles\/[a-z0-9]+\.jpg/.test(m.location().url)) return;
    // respuestas 4xx esperadas (moderación, enlace caducado): el navegador las registra como error de recurso
    if (/status of (404|422)/.test(m.text()) && /\/api\//.test(m.location().url)) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto("/crear");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function writeStory(page: Page) {
  await page.getByTestId("hero-name").fill("Vera");
  await page.getByTestId("hero-age").selectOption("6");
  await page.getByRole("button", { name: "Niña" }).click();
  await page.getByTestId("idea").fill("Vera construye un cohete con una caja de cartón y viaja a la Luna con su perro Toby.");
  await page.getByTestId("next-1").click();
  await expect(page.getByRole("heading", { name: "¿Cómo es Vera?" })).toBeVisible();
  await page.getByRole("button", { name: "Rizos media melena" }).click();
  await page.getByRole("button", { name: "Pelo caoba" }).click();
  // el paso 2 enseña lo que se elige: miniatura marcada y repintada con el color de pelo elegido
  await expect(page.getByRole("button", { name: "Rizos media melena" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-pick="rizos-media"] img')).toHaveAttribute("src", /^data:image\/png/);
  await page.getByTestId("add-cast").click();
  await page.getByTestId("cast-0").getByPlaceholder("Toby").fill("Toby");
  await page.getByTestId("cast-0").getByPlaceholder("su perro").fill("su perro");
  await page.getByTestId("detail-0").fill("le encantan los dinosaurios");
  await page.getByTestId("next-2").click();
  await expect(page.getByTestId("plan-pages").locator("li")).toHaveCount(12, { timeout: 20_000 });
}

test("De una frase al cuento escrito: 12 tarjetas, editar texto y cambiar una página con una frase", async ({ page }) => {
  await writeStory(page);
  await expect(page.getByTestId("plan-title")).toHaveValue("Vera y la gran idea");
  await expect(page.getByTestId("page-3")).toContainText("le encantan los dinosaurios");
  // editar a mano
  const p1 = page.getByTestId("page-1").getByRole("textbox");
  await p1.fill("Vera tenía una idea enorme y una caja de cartón todavía más grande.");
  // cambiar una página con una frase (el mock la añade al texto)
  await page.getByTestId("page-5").getByRole("button", { name: "Cambiar esta página" }).click();
  await page.getByTestId("page-5").getByPlaceholder(/prima Lola/).fill("que salga la Luna sonriendo");
  await page.getByTestId("page-5").getByRole("button", { name: "Cambiar", exact: true }).click();
  // por su nombre: mientras se reescribe, el campo de la frase también es un textbox (y el modo estricto falla sin esperar)
  await expect(page.getByTestId("page-5").getByRole("textbox", { name: "Texto de la página 5" })).toHaveValue(/Que salga la Luna sonriendo\./);
  // al recargar sigue todo (localStorage) y no se vuelve a escribir
  await page.reload();
  await expect(page.getByTestId("page-1").getByRole("textbox")).toHaveValue("Vera tenía una idea enorme y una caja de cartón todavía más grande.");
  // la moderación para lo que no va en un cuento
  await page.getByTestId("page-2").getByRole("button", { name: "Cambiar esta página" }).click();
  await page.getByTestId("page-2").getByPlaceholder(/prima Lola/).fill("que lleve una pistola");
  await page.getByTestId("page-2").getByRole("button", { name: "Cambiar", exact: true }).click();
  await expect(page.getByTestId("page-2")).toContainText("no lo podemos poner en un cuento infantil");
  expect(errors).toEqual([]);
});

test("Personajes y libro sin coste: email, hoja + portada, cambio con palabras, pago de prueba, 12 páginas y PDF", async ({ page }) => {
  test.setTimeout(240_000);
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("vera@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await expect(page.getByTestId("cover")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await expect(page.getByTestId("free-pdf")).toBeVisible();
  // el enlace para volver se enseña en pantalla (y va por email si Resend está configurado; aquí no)
  await expect(page.getByTestId("book-link")).toContainText("/crear?b=");
  await expect(page.getByTestId("book-link")).toContainText("Guárdalo.");

  // un cambio con palabras: hoja y portada nuevas
  await page.getByPlaceholder(/más rizos/).fill("más rizos");
  await page.getByRole("button", { name: "Pedir el cambio" }).click();
  await expect(page.getByText("te quedan 1")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Versión 2" })).toBeVisible();

  await page.getByTestId("approve").click();
  await expect(page.getByTestId("paywall")).toBeVisible();
  await expect(page.getByTestId("book-page-12")).toBeVisible();
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 120_000 });

  // la hoja aprobada es la versión 2 y no hay jobs repetidos
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  const view = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  const kinds = (view.jobs as { kind: string }[]).reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {});
  expect(kinds).toEqual({ sheet: 2, cover: 2, page: 12 });
  const sheet2 = (view.jobs as { id: string; kind: string; variant: number }[]).find((j) => j.kind === "sheet" && j.variant === 2)!;
  expect(view.approvedSheetJobId).toBe(sheet2.id);
  expect(view.payment).toBe("dry-run");

  // sin claves de Stripe: ni checkout ni webhook
  expect((await page.request.post("/api/libro/checkout", { data: { bookId } })).status()).toBe(501);
  expect((await page.request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } })).status()).toBe(501);

  // PDF del libro: portada, dedicatoria, 12 páginas y «Fin» (15 A4 verticales)
  const res = await page.request.get(`/api/libro/pdf?b=${bookId}&kind=full`);
  if (res.status() === 503) test.info().annotations.push({ type: "pdf", description: "sin Chromium local: PDF no comprobado" });
  else {
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const file = test.info().outputPath("libro.pdf");
    const fs = await import("node:fs");
    fs.writeFileSync(file, await res.body());
    const info = execFileSync("pdfinfo", [file]).toString();
    expect(info).toMatch(/Pages:\s+15/);
    expect(info).toMatch(/Page size:.*\(A4\)/);
  }
  expect(errors).toEqual([]);
});

test("Recuperar un libro con el enlace /crear?b=", async ({ page }) => {
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("lucas@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("cover")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/crear?b=${bookId}`);
  await expect(page.getByText("Libro recuperado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Así será Vera" })).toBeVisible();
  await page.goto("/crear?b=noexiste00");
  await expect(page.getByText("Este enlace ya no es válido")).toBeVisible();
});
