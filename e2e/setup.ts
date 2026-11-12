import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
export const backendOrigin = `http://127.0.0.1:${process.env.TECHPOS_E2E_BACKEND_PORT ?? 8000}`;
export const env = {
  ...process.env,
  APP_ENV: "testing",
  APP_URL: backendOrigin,
  FRONTEND_URL: `http://127.0.0.1:${process.env.TECHPOS_E2E_FRONTEND_PORT ?? 5173}`,
  DB_CONNECTION: "sqlite",
  DB_DATABASE: path.resolve("../.tools/e2e.sqlite"),
  SESSION_DRIVER: "database",
  QUEUE_CONNECTION: "database",
  MAIL_MAILER: "log",
  CACHE_FILE_PATH: path.resolve("../.tools/e2e-cache"),
};
export function php(args: string[]) {
  const r = spawnSync("php", args, {
    cwd: path.resolve("../laravel"),
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  return r.stdout;
}
export default function setup() {
  const root = path.resolve("../.tools");
  if (
    path.dirname(env.CACHE_FILE_PATH) !== root ||
    path.basename(env.DB_DATABASE) !== "e2e.sqlite"
  )
    throw new Error("Unexpected test storage path");
  mkdirSync(root, { recursive: true });
  rmSync(env.CACHE_FILE_PATH, { recursive: true, force: true });
  writeFileSync(env.DB_DATABASE, "");
  php(["artisan", "migrate", "--seed", "--force"]);
  php(["tests/e2e/identity.php", "admin"]);
}
