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
  // el reparto va en una fila plegable
  await page.locator("summary", { hasText: "Quién más sale" }).click();
  await page.getByTestId("add-cast").click();
  await page.getByTestId("cast-0").getByPlaceholder("Toby").fill("Toby");
  await page.getByTestId("cast-0").getByPlaceholder("su perro").fill("su perro");
  // «Lo que solo tú sabes» está a la vista; con un detalle no salen las tres preguntas
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
  // sin la renuncia al desistimiento no se puede pagar, y el servidor tampoco lo acepta
  await expect(page.getByTestId("pay")).toBeDisabled();
  const sinCasilla = await page.request.post("/api/libro/pay", { data: { bookId: await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string) } });
  expect(sinCasilla.status()).toBe(400);
  // la tapa dura viene marcada (imprenta simulada); este recorrido compra solo el PDF
  await expect(page.getByTestId("edition-hardcover")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("edition-illustrated").click();
  await expect(page.getByTestId("shipping-form")).toHaveCount(0);
  await page.getByTestId("waiver").check();
  await expect(page.getByTestId("pay")).toHaveText(/14,90 €/);
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("print-panel")).toHaveCount(0);

  // la hoja aprobada es la versión 2 y no hay jobs repetidos
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  const view = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  const kinds = (view.jobs as { kind: string }[]).reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {});
  expect(kinds).toEqual({ sheet: 2, cover: 2, page: 12 });
  const sheet2 = (view.jobs as { id: string; kind: string; variant: number }[]).find((j) => j.kind === "sheet" && j.variant === 2)!;
  expect(view.approvedSheetJobId).toBe(sheet2.id);
  expect(view.payment).toBe("dry-run");
  expect(view.edition).toBe("illustrated");
  expect(view.print).toBeNull();

  // «Otra versión» pide el motivo; dos como máximo; después, «Sigue sin estar bien»
  const p3 = page.getByTestId("book-page-3");
  await page.getByTestId("another-3").click();
  await expect(page.getByTestId("redo-submit")).toBeDisabled();
  await page.getByTestId("redo-form").getByRole("button", { name: "Postura o cuerpo raro" }).click();
  await page.getByTestId("redo-submit").click();
  await expect(p3.getByRole("button", { name: "Versión 2" })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("another-3").click();
  await page.getByTestId("redo-form").getByLabel("Qué cambiarías").fill("que el perro esté sentado");
  await page.getByTestId("redo-submit").click();
  await expect(p3.getByRole("button", { name: "Versión 3" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("another-3")).toHaveCount(0);
  await page.getByTestId("report-3").click();
  await page.getByTestId("report-form").getByLabel("Qué falla").fill("el perro sigue raro");
  await page.getByTestId("report-submit").click();
  await expect(p3.getByText("Nos has avisado")).toBeVisible();

  // sin claves de Stripe: ni checkout ni webhook
  expect((await page.request.post("/api/libro/checkout", { data: { bookId } })).status()).toBe(501);
  expect((await page.request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } })).status()).toBe(501);

  // PDF del libro como el impreso: portada, personajes, dedicatoria, 12 dobles (ilustración + texto), «Fin» y colofón (29 A4 apaisados)
  const res = await page.request.get(`/api/libro/pdf?b=${bookId}&kind=full`);
  if (res.status() === 503) test.info().annotations.push({ type: "pdf", description: "sin Chromium local: PDF no comprobado" });
  else {
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const file = test.info().outputPath("libro.pdf");
    const fs = await import("node:fs");
    fs.writeFileSync(file, await res.body());
    const info = execFileSync("pdfinfo", [file]).toString();
    expect(info).toMatch(/Pages:\s+29/);
    expect(info).toMatch(/Page size:\s+841\.\d+ x 59[45]\.\d+ pts \(A4\)/);
  }
  expect(errors).toEqual([]);
});

test("Tapa dura: dirección, pago de prueba, mandar a imprimir (imprenta simulada) y el libro ya no cambia", async ({ page }) => {
  test.setTimeout(300_000);
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("vera@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("paywall")).toBeVisible();
  await expect(page.getByTestId("edition-hardcover")).toHaveAttribute("aria-checked", "true");

  // dirección: a Canarias todavía no
  await page.getByTestId("ship-name").fill("Ana García López");
  await page.getByTestId("ship-line1").fill("Calle Mayor 12");
  await page.getByTestId("ship-line2").fill("3º B");
  await page.getByTestId("ship-postcode").fill("38001");
  await page.getByTestId("ship-city").fill("Santa Cruz");
  await page.getByTestId("waiver").check();
  await expect(page.getByTestId("pay")).toHaveText(/34,90 €/);
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("paywall")).toContainText("Península y Baleares");
  await expect(page.getByTestId("ship-postcode")).toHaveAttribute("aria-invalid", "true");
  // ese 400 era el esperado (la dirección rechazada)
  errors.splice(0, errors.length);
  await page.getByTestId("ship-postcode").fill("28013");
  await page.getByTestId("ship-city").fill("Madrid");
  await page.getByTestId("pay").click();

  // pagado: las 12 páginas y el panel de la imprenta, esperando a que lo mandemos
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 120_000 });
  const panel = page.getByTestId("print-panel");
  await expect(panel).toHaveAttribute("data-status", "awaiting_approval");
  await expect(page.getByTestId("print-address")).toContainText("Calle Mayor 12, 3º B, 28013 Madrid");

  // cambiar la dirección antes de mandarlo
  await panel.getByRole("button", { name: "Cambiar" }).click();
  await page.getByTestId("ship-line2").fill("4º A");
  await page.getByTestId("ship-save").click();
  await expect(page.getByTestId("print-address")).toContainText("4º A");

  // un texto retocado antes de mandarlo viaja con el libro
  await page.getByLabel("Texto de la página 1", { exact: true }).fill("Aquella noche, Vera no tenía nada de sueño.");
  await page.getByTestId("print-send").click();
  await page.getByTestId("print-confirm").click();
  await expect(panel).toHaveAttribute("data-status", /sent|failed/, { timeout: 180_000 });
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  const view = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  if (view.print.status === "failed") test.info().annotations.push({ type: "imprenta", description: "sin Chromium local: PDF de imprenta no comprobado" });
  else {
    expect(view.print.status).toBe("sent");
    await expect(panel).toContainText("En la imprenta");
    await expect(panel).toContainText("Imprenta simulada");
  }
  expect(view.edition).toBe("hardcover");
  expect(view.printMode).toBe("dry-run");
  expect(view.plan.pages[0].text).toBe("Aquella noche, Vera no tenía nada de sueño.");

  // ya en la imprenta: los textos solo se leen y el servidor no acepta cambios
  if (view.print.status === "sent") {
    await expect(page.getByLabel("Texto de la página 1", { exact: true })).toHaveAttribute("readonly", "");
    const edited = { ...view.plan, pages: view.plan.pages.map((p: { n: number; text: string }) => (p.n === 2 ? { ...p, text: `${p.text} Y otra cosa.` } : p)) };
    expect((await page.request.post("/api/libro/plan", { data: { bookId, plan: edited } })).status()).toBe(409);
    expect((await page.request.post("/api/libro/print", { data: { bookId } })).status()).toBe(409);
  }
  expect(errors).toEqual([]);
});

test("Ficha pobre: tres preguntas rápidas antes de escribir; lo contestado llega al cuento y no se repiten", async ({ page }) => {
  await page.getByTestId("hero-name").fill("Olivia");
  await page.getByTestId("hero-age").selectOption("2");
  await page.getByTestId("idea").fill("Olivia acaba de llegar a la tierra y conquista el mundo");
  await page.getByTestId("next-1").click();
  await page.getByTestId("next-2").click();
  await expect(page.getByRole("heading", { name: "Tres preguntas sobre Olivia" })).toBeVisible();
  // banco de su edad
  await expect(page.getByRole("button", { name: "dar palmas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "montar en bici" })).toHaveCount(0);
  await expect(page.getByTestId("quick-go")).toHaveText(/Escribir sin esto/);
  await page.getByRole("button", { name: "los animales" }).click();
  await page.getByTestId("quick-frase").fill("dice «¡mío!» a todo");
  await expect(page.getByTestId("quick-go")).toHaveText(/Escribir el cuento/);
  await page.getByTestId("quick-go").click();
  await expect(page.getByTestId("plan-pages").locator("li")).toHaveCount(12, { timeout: 20_000 });
  // el mock pone el primer detalle en la página 3
  await expect(page.getByTestId("page-3")).toContainText("Lo que más le gusta: los animales");
  // al volver, los detalles están en «Lo que solo tú sabes» y escribir ya no pregunta
  await page.getByRole("button", { name: "Paso anterior" }).click();
  await expect(page.getByTestId("detail-1")).toHaveValue("Frase o manía suya: dice «¡mío!» a todo");
  await page.getByTestId("detail-0").fill("");
  await page.getByTestId("detail-1").fill("");
  await page.getByTestId("next-2").click();
  await expect(page.getByTestId("quick")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Ficha pobre: «Escríbelo ya» salta las preguntas", async ({ page }) => {
  await page.getByTestId("hero-name").fill("Hugo");
  await page.getByTestId("surprise").click();
  await page.getByTestId("next-1").click();
  await page.getByTestId("next-2").click();
  await expect(page.getByRole("button", { name: "montar en bici" })).toBeVisible();
  await page.getByRole("button", { name: "montar en bici" }).click();
  await page.getByTestId("quick-skip").click();
  await expect(page.getByTestId("plan-pages").locator("li")).toHaveCount(12, { timeout: 20_000 });
  await expect(page.getByTestId("plan-pages")).not.toContainText("montar en bici");
  expect(errors).toEqual([]);
});

test("Llegar con una idea de la landing (/crear?idea=) y empezar otro sin ventanas del navegador", async ({ page }) => {
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => {
    errors.push(`diálogo inesperado: ${d.message()}`);
    void d.dismiss();
  });
  await page.goto("/crear?idea=luna");
  await expect(page.getByRole("button", { name: "Viaje a la Luna" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("hero-name").fill("Vera");
  // la idea elegida sigue al nombre mientras no se toca a mano
  await expect(page.getByTestId("idea")).toHaveValue(/^Vera construye un cohete/);
  await page.getByRole("button", { name: "Nuevo" }).or(page.getByRole("button", { name: "Empezar otro" })).first().click();
  await page.getByRole("dialog", { name: "Empezar un cuento nuevo" }).getByRole("button", { name: "Empezar otro" }).click();
  await expect(page.getByTestId("hero-name")).toHaveValue("");
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
