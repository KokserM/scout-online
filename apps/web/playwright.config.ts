import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: [
    {
      command: "npx --yes pnpm@10.15.0 --dir ../.. --filter @grandstand/game-engine build && npx --yes pnpm@10.15.0 --dir ../.. --filter @grandstand/shared build && npx --yes pnpm@10.15.0 --dir ../.. --filter @grandstand/server dev",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx --yes pnpm@10.15.0 dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: { baseURL: "http://127.0.0.1:5173", trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
