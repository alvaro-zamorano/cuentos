import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3017);

/**
 * Tests del journey. Arranca `next start` sobre el build existente (npm run build antes), con el pago simulado
 * activo: el build tiene que hacerse con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 (en CI lo fija el workflow).
 */
export default defineConfig({
  testDir: "./tests",
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
  },
});
