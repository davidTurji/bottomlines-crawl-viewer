import { defineConfig, devices } from "@playwright/test";

// Browser tests against the PRODUCTION build (no VITE_MOCK), so api.ts and
// req() run exactly as they do for a customer; e2e/fakeApi.ts answers the
// network. See e2e/report.spec.ts for why.
const PORT = 4179;
// The live smoke (npm run smoke:live, e2e/clickEverything.spec.ts) runs
// against a real link instead: no build, no server, the link's own origin.
const LIVE = process.env.VIEWER_SMOKE_BASE;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: LIVE || `http://localhost:${PORT}`,
    // Never on a live link: a trace or a screenshot would keep the link's
    // token and its filled-in sign-in on disk.
    trace: LIVE ? "off" : "retain-on-failure",
    screenshot: LIVE ? "off" : "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /report\.spec/, grep: /overview opens/ },
  ],
  webServer: LIVE
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        port: PORT,
        // Never test a leftover server: it may hold an older build.
        reuseExistingServer: false,
        timeout: 180_000,
        env: { VITE_MOCK: "false" },
      },
});
