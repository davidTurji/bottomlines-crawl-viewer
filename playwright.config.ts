import { defineConfig, devices } from "@playwright/test";

// Browser tests against the PRODUCTION build (no VITE_MOCK), so api.ts and
// req() run exactly as they do for a customer; e2e/fakeApi.ts answers the
// network. See e2e/report.spec.ts for why.
const PORT = 4179;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /report\.spec/, grep: /overview opens/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    // Never test a leftover server: it may hold an older build.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_MOCK: "false" },
  },
});
