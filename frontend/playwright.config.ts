import { defineConfig } from "@playwright/test";

const baseURL = process.env.MOMENTIFY_TEST_URL ?? "http://127.0.0.1:3200";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure" },
  webServer: process.env.MOMENTIFY_TEST_URL
    ? undefined
    : {
        command: "npm run start -- --port 3200 --hostname 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
          env: { BACKEND_URL: "http://127.0.0.1:3299", BACKEND_API_TOKEN: "" },
      },
});
