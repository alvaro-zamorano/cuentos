import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3017);

/**
 * Tests del journey. Arranca `next start` sobre el build existente (npm run build antes), con el pago simulado
 * activo: el build tiene que hacerse con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 (en CI lo fija el workflow).
 */
export default defineConfig({
  testDir: "./tests",
  // los tests unitarios (node --test) viven en tests/unit: npm run test:unit
  testIgnore: ["unit/**"],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // los tests nunca llaman a proveedores de pago aunque haya claves en .env.local
    // ni Stripe ni Resend ni Gelato: el pago y la imprenta son de prueba y no se manda ningún email
    // la suite escribe más de 12 cuentos y empieza casi 10 libros desde la misma IP, y algún cuento dos veces en menos de
    // un segundo: con los topes de producción, los últimos tests y «Ficha pobre» fallaban con 429. Lo mismo con dos avisos
    // de página seguidos en la CI, que va más rápida que en local (27 oct)
    env: { ...(process.env as Record<string, string>), STORY_PROVIDER: "mock", GENERATION_PROVIDER: "dry-run", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", RESEND_API_KEY: "", GELATO_API_KEY: "", PLAN_RATE_PER_HOUR: "100", PLAN_MIN_GAP_MS: "0", START_RATE_PER_HOUR: "100", REPORT_MIN_GAP_MS: "0", VIEW_RATE_PER_HOUR: "100000" },
  },
});
