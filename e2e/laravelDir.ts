import { existsSync } from "node:fs";
import path from "node:path";

// The Laravel app sits beside this project as `techpos_laravel` (or `laravel` in older
// checkouts). TECHPOS_LARAVEL_DIR overrides both.
export const laravelDir = path.resolve(
  process.env.TECHPOS_LARAVEL_DIR ??
    (existsSync(path.resolve("../techpos_laravel"))
      ? "../techpos_laravel"
      : "../laravel"),
);
