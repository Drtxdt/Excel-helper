import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.001 },
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/*.visual.spec.ts", "**/*.tablet.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    ...(["chromium", "webkit"] as const).map((browserName) => ({
      name: `${browserName}-tablet`,
      testMatch: "**/*.tablet.spec.ts",
      use: {
        browserName,
        ...devices["iPad (gen 7) landscape"],
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1,
      },
    })),
    {
      name: "chromium-visual",
      testMatch: "**/*.visual.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
