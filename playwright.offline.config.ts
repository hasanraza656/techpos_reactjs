import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-offline",
  outputDir: "./test-results/offline",
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
  },
});
