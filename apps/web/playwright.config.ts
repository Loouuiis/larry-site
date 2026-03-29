import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
        cwd: __dirname,
        url: "http://127.0.0.1:3000/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SHOW_DEV_LOGIN: "true",
          ALLOW_DEV_AUTH_BYPASS: "true",
          NEXT_PUBLIC_LARRY_ACTION_CENTRE_REFRESH_MS: "1000",
        },
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
