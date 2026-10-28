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
  // una persona del reparto: su aspecto también puede llevar algo de salud (revisión 27 oct); una mascota, no
  await page.getByTestId("cast-0").getByRole("button", { name: "Persona" }).click();
  await expect(page.getByTestId("cast-0").getByTestId("cast-health-note")).toContainText("que la abuela va en silla de ruedas");
  await page.getByTestId("cast-0").getByRole("button", { name: "Mascota" }).click();
  await expect(page.getByTestId("cast-0").getByTestId("cast-health-note")).toHaveCount(0);
  await page.getByTestId("cast-0").getByPlaceholder("Toby").fill("Toby");
  await page.getByTestId("cast-0").getByPlaceholder("su perro").fill("su perro");
  // «Lo que solo tú sabes» está a la vista; con un detalle no salen las tres preguntas
  await page.getByTestId("detail-0").fill("le encantan los dinosaurios");
  // antes de mandar la ficha se dice qué pasa con ella, y qué con los datos de salud (I26, I27)
  await expect(page.getByTestId("before-write")).toContainText("proveedor de IA");
  await expect(page.getByTestId("write-consent")).toContainText("declaras ser su madre, padre o tutor");
  await expect(page.getByTestId("write-consent")).toContainText("consientes que usemos lo que has escrito, también lo de su salud si lo hay, solo para este cuento");
  await page.screenshot({ path: test.info().outputPath("barra-consentimiento.png") });
  await expect(page.getByTestId("write-consent").getByRole("link", { name: "privacidad" })).toHaveAttribute("href", "/privacidad");
  await expect(page.getByTestId("health-note").first()).toContainText("solo para este cuento");
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
  // el libro en 3D es para la tapa dura: con el PDF pagado no sale
  await expect(page.getByTestId("book3d-section")).toHaveCount(0);
  // el padre ve la página de personajes antes de descargar (25 oct)
  await expect(page.getByTestId("cast-portraits")).toBeVisible();
  await expect(page.getByTestId("portrait-1")).toHaveAttribute("data-state", /done|placeholder/);

  // la hoja aprobada es la versión 2 y no hay jobs repetidos
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  const view = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  const kinds = (view.jobs as { kind: string }[]).reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {});
  // un retrato por personaje para la página de personajes del libro (25 oct)
  const cast = (view.chosen.portraits as { job: string | null }[]).length;
  expect(cast).toBeGreaterThan(0);
  expect((view.chosen.portraits as { job: string | null }[]).every((p) => p.job)).toBe(true);
  expect(kinds).toEqual({ sheet: 2, cover: 2, page: 12, portrait: cast });
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

  // una página pagada que no ha salido nunca no deja al padre sin salida: puede avisar (I3). El dry-run no falla,
  // así que la vista del libro se reescribe en el navegador con la página 4 fallida
  await page.route(/\/api\/libro\/view\?/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const j of body.jobs as { kind: string; page: number | null; status: string; url: string | null; error: string | null }[]) {
      if (j.kind === "page" && j.page === 4) Object.assign(j, { status: "failed", url: null, error: "error" });
    }
    await route.fulfill({ response: res, json: body });
  });
  await page.reload();
  const p4 = page.getByTestId("book-page-4");
  await expect(page.getByTestId("another-4")).toHaveCount(0);
  await expect(page.getByTestId("report-4")).toHaveText("¿No sale esta ilustración? Avísanos", { timeout: 30_000 });
  await expect(p4).toContainText("Esta ilustración no ha salido.");
  await p4.screenshot({ path: test.info().outputPath("pagina-sin-salir.png") });
  await page.getByTestId("report-4").click();
  await page.getByTestId("report-form").getByLabel("Qué falla").fill("se queda en blanco");
  await page.getByTestId("report-submit").click();
  await expect(p4.getByText("Nos has avisado")).toBeVisible();
  await page.unroute(/\/api\/libro\/view\?/);

  // pagado, volver atrás no repinta nada (I2): el paso 4 enseña los personajes sin cambios ni otras versiones, el 3
  // solo deja corregir textos y los pasos 1 y 2 ya no se abren
  await page.getByRole("button", { name: "Paso anterior" }).click();
  await expect(page.getByTestId("approve")).toHaveText(/Volver al libro/);
  await expect(page.getByText("¿Cambiamos algo?")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Versiones de los personajes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Paso anterior" }).click();
  await expect(page.getByTestId("paid-text-only")).toBeVisible();
  await expect(page.getByTestId("rewrite")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cambiar esta página" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Paso anterior" })).toHaveCount(0);
  await expect(page.getByTestId("next-3")).toHaveText("Volver al libro");
  await page.getByTestId("next-3").click();
  await expect(page.getByTestId("full-pdf")).toBeVisible();
  const after = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  expect(after.jobs.length).toBe(view.jobs.length + 2);

  // sin claves de Stripe: ni checkout ni webhook
  expect((await page.request.post("/api/libro/checkout", { data: { bookId } })).status()).toBe(501);
  expect((await page.request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } })).status()).toBe(501);

  // PDF del libro como el impreso: portada, personajes, dedicatoria, 12 dobles (ilustración + texto), «Fin» y la marca (29 A4 apaisados)
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

    // el botón (I10): «Preparando el PDF…» mientras tanto y después la descarga, sin salir de la página
    const download = page.waitForEvent("download");
    await page.getByTestId("full-pdf").click();
    await expect(page.getByTestId("full-pdf")).toHaveAttribute("aria-busy", "true");
    expect((await download).suggestedFilename()).toMatch(/^cuento-.+-ilustrado\.pdf$/);
    await expect(page.getByTestId("full-pdf")).toBeVisible();
  }
  // el enlace directo con un error: una página en castellano, no un JSON (I10)
  const bad = await page.request.get(`/api/libro/pdf?b=zzzzzzzz&kind=full`);
  expect(bad.status()).toBe(404);
  expect(bad.headers()["content-type"]).toContain("text/html");
  expect(await bad.text()).toContain("Guardamos los libros 30 días");
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

  // antes de pagar: el libro en 3D con su portada (o, sin WebGL, la portada en 2D), y se abre
  const book3d = page.getByTestId("book3d");
  await book3d.scrollIntoViewIfNeeded();
  await expect(book3d).toHaveAttribute("data-state", /ready|fallback/, { timeout: 30_000 });
  if ((await book3d.getAttribute("data-state")) === "ready") {
    await expect(page.getByTestId("book3d-step")).toHaveText("La portada");
    await page.getByRole("button", { name: "Abrir el libro" }).click();
    await expect(page.getByTestId("book3d-step")).toHaveText("Portadilla");
  }

  // cuándo llega, antes de pagar
  await expect(page.getByTestId("paywall")).toContainText("Suele llegar en una o dos semanas desde que lo mandas a imprimir");
  // una calle larga no se corta sin aviso: se cuenta y se dice qué hacer
  await page.getByTestId("ship-line1").fill("Avenida de la Constitución, 21, portal B");
  await expect(page.getByTestId("ship-line1")).toHaveValue("Avenida de la Constitución, 21, portal B");
  await expect(page.getByTestId("ship-line1-count")).toHaveText("40/35");
  await expect(page.getByTestId("ship-line1-long")).toContainText("Pasa el portal, el piso o la puerta a la línea de abajo");
  // el aviso describe el campo, no forma parte de su nombre (revisión 27 oct)
  await expect(page.getByRole("textbox", { name: "Calle y número", exact: true })).toHaveAccessibleDescription(/40\/35 La imprenta admite 35 letras en esta línea/);
  await page.getByTestId("shipping-form").screenshot({ path: test.info().outputPath("direccion-larga.png") });
  // dirección: a Canarias todavía no
  await page.getByTestId("ship-name").fill("Ana García López");
  await page.getByTestId("ship-line1").fill("Calle Mayor 12");
  await expect(page.getByTestId("ship-line1-long")).toHaveCount(0);
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
  // la vista no trae la calle ni el teléfono (I16): el enlace del libro se reenvía
  await expect(page.getByTestId("print-address")).toContainText("Ana García López · 28013 Madrid");
  await expect(page.getByTestId("print-address")).not.toContainText("Calle Mayor");
  await panel.screenshot({ path: test.info().outputPath("panel-direccion.png") });
  // la última revisión antes de mandarlo: el libro en 3D con sus páginas
  await expect(page.getByTestId("book3d-section")).toContainText("así quedará impreso");

  // cambiar la dirección antes de mandarlo: «Cambiar» la trae entera (no se pierden el piso ni el teléfono) y se puede
  // cancelar sin tocar nada (revisión 27 oct)
  await panel.getByRole("button", { name: "Cambiar" }).click();
  await expect(page.getByTestId("ship-line1")).toHaveValue("Calle Mayor 12");
  await expect(page.getByTestId("ship-line2")).toHaveValue("3º B");
  await page.getByTestId("ship-line2").fill("algo que no se guarda");
  await page.getByTestId("ship-cancel").click();
  await expect(page.getByTestId("print-address")).toContainText("Ana García López · 28013 Madrid");
  await panel.getByRole("button", { name: "Cambiar" }).click();
  await expect(page.getByTestId("ship-name")).toHaveValue("Ana García López");
  await expect(page.getByTestId("ship-line2")).toHaveValue("3º B");
  await page.getByTestId("ship-line2").fill("4º A");
  await page.getByTestId("ship-postcode").fill("28014");
  await page.getByTestId("ship-save").click();
  await expect(page.getByTestId("print-address")).toContainText("Ana García López · 28014 Madrid");

  // un texto retocado antes de mandarlo viaja con el libro. Se guarda solo; si el guardado falla, se dice y se
  // reintenta, y no se da por guardado hasta que el servidor lo confirma (I13)
  await page.route("**/api/libro/plan", (r) => r.abort(), { times: 1 });
  await page.getByLabel("Texto de la página 1", { exact: true }).fill("Aquella noche, Vera no tenía nada de sueño.");
  await expect(page.getByTestId("save-error")).toContainText("Sin conexión");
  errors.splice(0, errors.length); // el fallo de red provocado
  await page.getByTestId("save-retry").click();
  await expect(page.getByTestId("save-state")).toHaveText("Guardado");
  await expect(page.getByTestId("save-error")).toHaveCount(0);
  await page.getByTestId("print-send").click();
  // antes de mandarlo se ve la dirección entera, con la calle y el piso
  await expect(panel.getByRole("alertdialog")).toContainText("Lo enviaremos a Ana García López, Calle Mayor 12, 4º A, 28014 Madrid.");
  await panel.screenshot({ path: test.info().outputPath("panel-confirmar.png") });
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
  expect(view.print.shipping).toEqual({ name: "Ana García López", postcode: "28014", city: "Madrid" });
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

test("PDF primero y después tapa dura: pagas la diferencia, el panel de imprenta aparece y nada se repinta", async ({ page }) => {
  test.setTimeout(300_000);
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("vera@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await page.getByTestId("approve").click();
  await page.getByTestId("edition-illustrated").click();
  await page.getByTestId("waiver").check();
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("print-panel")).toHaveCount(0);

  // la oferta: la diferencia y la fecha límite
  const card = page.getByTestId("upgrade-card");
  await expect(card).toContainText("20,00 €");
  await expect(card).toContainText(/hasta el \d{1,2} de \p{L}+/u);
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  const before = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  expect(before.edition).toBe("illustrated");
  expect(before.upgrade.cents).toBe(2000);

  await page.getByTestId("upgrade-open").click();
  await expect(page.getByTestId("upgrade-pay")).toBeDisabled();
  await page.getByTestId("ship-name").fill("Ana García López");
  await page.getByTestId("ship-line1").fill("Calle Mayor 12");
  await page.getByTestId("ship-postcode").fill("07001");
  await page.getByTestId("ship-city").fill("Palma");
  await page.getByTestId("upgrade-waiver").check();
  await expect(page.getByTestId("upgrade-pay")).toHaveText(/20,00 €/);
  await page.getByTestId("upgrade-pay").click();

  const panel = page.getByTestId("print-panel");
  await expect(panel).toHaveAttribute("data-status", "awaiting_approval", { timeout: 30_000 });
  await expect(page.getByTestId("print-address")).toContainText("Ana García López · 07001 Palma");
  await expect(card).toHaveCount(0);
  const after = await (await page.request.get(`/api/libro/view?b=${bookId}`)).json();
  expect(after.edition).toBe("hardcover");
  expect(after.upgrade).toBeNull();
  expect(after.jobs.length).toBe(before.jobs.length);
  // una segunda mejora no se cobra
  expect((await page.request.post("/api/libro/pay", { data: { bookId, upgrade: true, waiver: true, shipping: { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" } } })).status()).toBe(409);
  expect(errors).toEqual([]);
});

test("Ficha pobre: tres preguntas rápidas antes de escribir; lo contestado llega al cuento y no se repiten", async ({ page }) => {
  await page.getByTestId("hero-name").fill("Olivia");
  await page.getByTestId("hero-age").selectOption("2");
  await page.getByRole("button", { name: "Niña" }).click();
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
  await page.getByRole("button", { name: "Niño" }).click();
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
  // un cuento a medias, sin email, no se pierde al abrir el enlace de otro libro: se guarda aparte (mirada de usuario)
  await page.goto("/crear");
  await page.getByTestId("hero-name").fill("Martina");
  await page.getByTestId("idea").fill("Martina encuentra un mapa en el desván de la abuela.");
  await page.goto(`/crear?b=${bookId}`);
  await expect(page.getByText("Libro recuperado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Así será Vera" })).toBeVisible();
  await expect(page.getByTestId("aside")).toContainText("el cuento a medias de Martina");
  await page.getByTestId("aside-restore").click();
  await expect(page.getByTestId("hero-name")).toHaveValue("Martina");
  await expect(page.getByTestId("idea")).toHaveValue("Martina encuentra un mapa en el desván de la abuela.");
  await expect(page.getByTestId("aside")).toHaveCount(0);
  await expect(page).toHaveURL(/\/crear$/);
  await page.goto("/crear?b=noexiste00");
  await expect(page.getByText("Este enlace ya no abre ningún libro")).toBeVisible();

  // con el servidor fallando no dice que el enlace no vale: reintenta y, si sigue, dice que el libro sigue guardado (I9)
  await page.evaluate(() => localStorage.clear());
  await page.route(/\/api\/libro\/view\?/, (r) => r.fulfill({ status: 500, json: { ok: false, error: "server" } }));
  await page.goto(`/crear?b=${bookId}`);
  await expect(page.getByText("No hemos podido abrir tu libro ahora mismo")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Este enlace ya no abre ningún libro")).toHaveCount(0);
  await page.unroute(/\/api\/libro\/view\?/);
  errors.splice(0, errors.length); // los 500 provocados
});

test("Sin red al pagar: el botón no se queda colgado y lo dice (I9)", async ({ page }) => {
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("nora@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await page.getByTestId("approve").click();
  await page.getByTestId("edition-illustrated").click();
  await page.getByTestId("waiver").check();
  await page.route("**/api/libro/pay", (r) => r.abort());
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("paywall")).toContainText("Sin conexión");
  await expect(page.getByTestId("pay")).toBeEnabled();
  await page.unroute("**/api/libro/pay");
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 120_000 });

  // el libro no carga (servidor caído): lo dice y deja volver a intentarlo, en vez de quedarse en blanco
  await page.route(/\/api\/libro\/view\?/, (r) => r.fulfill({ status: 503, json: { ok: false, error: "server" } }));
  await page.reload();
  await expect(page.getByTestId("load-error")).toContainText("Tu libro sigue guardado", { timeout: 15_000 });
  await page.getByTestId("load-error").screenshot({ path: test.info().outputPath("libro-no-carga.png") });
  await page.unroute(/\/api\/libro\/view\?/);
  await page.getByRole("button", { name: "Volver a intentarlo" }).click();
  await expect(page.getByTestId("full-pdf")).toBeVisible({ timeout: 30_000 });
});

test("Si falla el dibujo de los personajes, «Reintentar» lo repite aquí sin empezar otro cuento", async ({ page }) => {
  await writeStory(page);
  await page.getByTestId("next-3").click();
  // Gemini caído: la hoja y la portada salen fallidas. El dry-run no falla nunca, así que se simula en las respuestas
  // (lo del servidor lo cubre tests/unit/reintentar.test.ts)
  let down = true;
  await page.route("**/api/generate/run", async (route) => {
    if (!down) return route.continue();
    const { jobId } = route.request().postDataJSON() as { jobId: string };
    await route.fulfill({ json: { ok: true, ran: true, job: { id: jobId, status: "failed" } } });
  });
  await page.route(/\/api\/libro\/view\?/, async (route) => {
    if (!down) return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    for (const j of json.jobs) if (j.kind === "sheet" || j.kind === "cover") Object.assign(j, { status: "failed", url: null, placeholder: false, error: "error" });
    json.chosen = { ...json.chosen, sheet: null, cover: null };
    await route.fulfill({ response: res, json });
  });
  await page.getByTestId("email").fill("nora@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("cast-retry")).toContainText("El dibujo de los personajes no ha salido");
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "failed");
  await expect(page.getByTestId("approve")).toBeDisabled();

  down = false;
  const retried = page.waitForResponse((r) => r.url().endsWith("/api/libro/retry") && r.status() === 200);
  await page.getByTestId("retry").click();
  await retried;
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await expect(page.getByTestId("cover")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await expect(page.getByTestId("cast-retry")).toHaveCount(0);
  await expect(page.getByTestId("approve")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("«Que salga la abuela»: el paso 3 avisa de cómo sacarla en los dibujos, se puede dibujar y un cambio que no se guarda se dice", async ({ page }) => {
  await writeStory(page);
  const p4 = page.getByTestId("page-4");
  await p4.getByRole("button", { name: "Cambiar esta página" }).click();
  await p4.getByRole("button", { name: "que salga la abuela" }).click();
  await p4.getByRole("button", { name: "Cambiar", exact: true }).click();
  await expect(p4.getByRole("textbox", { name: "Texto de la página 4" })).toHaveValue(/Que salga la abuela\./);
  await expect(page.getByTestId("family-hint-4")).toContainText("«abuela»");
  await expect(page.getByTestId("family-hint-4")).toContainText("Quién más sale");
  // antes: 422 con «Aparecen familiares que el adulto no ha puesto…» al dibujar
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("abril@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });

  // con los personajes ya dibujados, el paso 3 ya no manda al paso 2; y un cambio que no vale se dice
  await page.getByRole("button", { name: "Paso anterior" }).click();
  await expect(page.getByTestId("page-4")).toBeVisible();
  await expect(page.getByTestId("family-hint-4")).toHaveCount(0);
  const t2 = page.getByTestId("page-2").getByRole("textbox", { name: "Texto de la página 2" });
  await t2.fill(`${await t2.inputValue()} 🚀`);
  await expect(page.getByTestId("save-error")).toContainText("Quita el emoji de la página 2", { timeout: 10_000 });
  await t2.fill((await t2.inputValue()).replace(" 🚀", ""));
  await expect(page.getByTestId("save-error")).toHaveCount(0, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("Vuelta de Stripe sin red: no dice que el pago no ha llegado, dice que no puede comprobarlo (revisión 27 oct)", async ({ page }) => {
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("rita@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("paywall")).toBeVisible();
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  // el libro se abre; la red se va mientras se espera al pago
  let offline = false;
  await page.route("**/api/libro/view**", (route) => (offline ? route.abort("internetdisconnected") : route.continue()));
  await page.clock.install();
  await page.goto(`/crear?b=${bookId}&pagado=1`);
  await expect(page.getByText("Confirmando el pago…")).toBeVisible();
  offline = true;
  // dos minutos de espera, de 3 s en 3 s, dejando que cada petición fallida vuelva antes de seguir. fastForward salta el
  // tiempo sin pasar por cada fotograma del libro en 3D (runFor los pintaba todos y en una máquina lenta no daba tiempo)
  for (let i = 0; i < 42; i++) {
    await page.clock.fastForward(3_000);
    await page.waitForTimeout(50);
  }
  await expect(page.getByTestId("pay-pending")).toBeVisible();
  await expect(page.getByTestId("pay-offline")).toContainText("parece que no hay conexión");
  await expect(page.getByTestId("paywall")).toHaveCount(0);
});

test("Pago que volvió de Stripe sin confirmar: al volver con el enlace no se ofrece pagar otra vez", async ({ page }) => {
  await writeStory(page);
  await page.getByTestId("next-3").click();
  await page.getByTestId("email").fill("rita@example.com");
  await page.getByTestId("consent").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("sheet")).toHaveAttribute("data-state", "placeholder", { timeout: 30_000 });
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("paywall")).toBeVisible();
  const bookId = await page.evaluate(() => JSON.parse(localStorage.getItem("cuentos:crear:v2") ?? "{}").bookId as string);
  // lo que deja la vuelta de Stripe (?pagado=1) cuando el pago aún no ha llegado
  await page.evaluate((id) => localStorage.setItem(`cuentos:pago-pendiente:pago:${id}`, String(Date.now())), bookId);
  await page.goto(`/crear?b=${bookId}`);
  await expect(page.getByTestId("pay-pending")).toBeVisible();
  await expect(page.getByTestId("paywall")).toHaveCount(0);
  expect(errors).toEqual([]);
});
