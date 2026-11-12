import { defineConfig } from "@playwright/test";
import foundation, {
  backendOrigin,
  frontendOrigin,
  frontendPort,
} from "./playwright.config";
export default defineConfig({
  ...foundation,
  testDir: "./e2e-operations",
  outputDir: "./test-results/operations",
  timeout: 120000,
  use: { ...foundation.use, actionTimeout: 15000 },
  webServer: [
    foundation.webServer[0],
    {
      command: `npm run preview -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendOrigin,
      env: { ...process.env, TECHPOS_BACKEND_URL: backendOrigin },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
