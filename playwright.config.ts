import { defineConfig } from "@playwright/test";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
export const backendPort = Number(process.env.TECHPOS_E2E_BACKEND_PORT ?? 8000);
export const frontendPort = Number(
  process.env.TECHPOS_E2E_FRONTEND_PORT ?? 5173,
);
export const backendOrigin = `http://127.0.0.1:${backendPort}`;
export const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const db = path.resolve("../.tools/e2e.sqlite");
mkdirSync(path.dirname(db), { recursive: true });
if (!existsSync(db)) writeFileSync(db, "");
export const e2eEnv = {
  ...process.env,
  APP_ENV: "testing",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: db,
  SESSION_DRIVER: "database",
  QUEUE_CONNECTION: "database",
  MAIL_MAILER: "log",
  APP_URL: backendOrigin,
  FRONTEND_URL: frontendOrigin,
  APP_DEBUG: "false",
  CACHE_FILE_PATH: path.resolve("../.tools/e2e-cache"),
};
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/foundation",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: frontendOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./e2e/setup.ts",
  webServer: [
    {
      command: `php artisan serve --host=127.0.0.1 --port=${backendPort}`,
      cwd: "../laravel",
      url: `${backendOrigin}/health`,
      env: e2eEnv,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: `npm run dev -- --port ${frontendPort}`,
      url: frontendOrigin,
      env: { ...process.env, TECHPOS_BACKEND_URL: backendOrigin },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
