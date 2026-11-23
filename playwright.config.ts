import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration for the three acceptance flows (PRD 1.9):
 *   search -> book, request -> approve, conflict -> recommend -> resolve.
 *
 * Run with `npm run test:e2e` after `npx playwright install chromium`.
 * The suite is not part of `npm test` because it needs a browser binary.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
