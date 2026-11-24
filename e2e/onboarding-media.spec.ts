import { test, expect } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { php } from "./setup";
import { laravelDir } from "./laravelDir";

test("guided onboarding persists answers, resolves stale tabs, uploads private photos and connects real setup tasks", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("UX Owner");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("UX Corner Store");
  await page.getByLabel("Email address").fill("e2e-ux@example.test");
  await page.getByLabel("Password", { exact: true }).fill("UsabilityTest123");
  await page.getByLabel("Confirm password").fill("UsabilityTest123");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "What kind of business do you run?" }),
  ).toBeVisible();
  php(["tests/e2e/identity.php", "verify-ux"]);
  await page.reload();
  await page.getByLabel("Search industries").fill("restaurant");
  await page.getByRole("button", { name: /Restaurant/ }).click();
  const screenshots = path.resolve("../.tools/ux-review");
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, "onboarding-industry-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /Retail & wholesale/ }).click();
  await page.getByRole("button", { name: /Physical store/ }).click();
  await page.getByRole("button", { name: /Multiple locations/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "All changes saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Retail & wholesale/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /Multiple locations/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const me = await (await context.request.get("/api/v1/auth/me")).json();
  const headers = {
    "X-Tenant-ID": me.tenants[0].public_id,
    Accept: "application/json",
  };
  // A second writer changes the saved answers while this tab still holds its old revision.
  const old = await (
    await context.request.get("/api/v1/onboarding", { headers })
  ).json();
  const csrf = (await context.cookies()).find((c) => c.name === "XSRF-TOKEN")!;
  const changed = await context.request.put("/api/v1/onboarding", {
    headers: { ...headers, "X-XSRF-TOKEN": decodeURIComponent(csrf.value) },
    data: { step: 2, revision: old.revision, business_model: "wholesale" },
  });
  expect(changed.status()).toBe(200);
  await page.getByRole("button", { name: /Services only/ }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(
    page.getByRole("button", { name: /Services only/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Load saved setup" }).click();
  await expect(
    page.getByRole("button", { name: /^Wholesale/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Retail & wholesale/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: path.join(screenshots, "onboarding-questions-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel(/^Phone/).fill("03001234567");
  await page.getByLabel(/^City/).fill("Lahore");
  const photo = path.resolve(
    laravelDir,
    "resources/demo-products/TEST-005.webp",
  );
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles(photo);
  await expect(
    page.getByAltText("Business logo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Workflow in development.", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Getting started checklist" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Hello, UX." })).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Default tax rate (%)", { exact: true }).fill("18");
  await page.getByRole("button", { name: "Save tax defaults" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Tax defaults saved" }),
  ).toBeVisible();
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(page.getByLabel("Tax rate (%)", { exact: true })).toHaveValue(
    "18.0000",
  );
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Photographed Test Tea");
  await page.getByLabel("SKU", { exact: true }).fill("UX-TEA");
  await page.getByLabel("Cost price", { exact: true }).fill("50");
  await page.getByLabel("Selling price", { exact: true }).fill("100");
  await page.getByLabel(/^Product photo/).setInputFiles(photo);
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const thumbnail = page.getByAltText("Photographed Test Tea", { exact: true });
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() =>
      thumbnail.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const mediaUrl = await thumbnail.getAttribute("src");
  const protectedPhoto = await context.request.get(mediaUrl!);
  expect(protectedPhoto.status()).toBe(200);
  expect(protectedPhoto.headers()["content-type"]).toContain("image/webp");
  const guest = await browser.newContext();
  const noAccess = await guest.request.get(
    new URL(mediaUrl!, page.url()).href,
    { headers: { Accept: "application/json" } },
  );
  expect(noAccess.status()).toBe(401);
  await guest.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: path.join(screenshots, "catalog-photo-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({
    path: path.join(screenshots, "catalog-photo-desktop.png"),
    fullPage: true,
  });
  // Bulk CSV remains plan gated; the paid fixture is installed only in the isolated QA database.
  await page
    .getByRole("button", { name: "Import / export", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Compare plans", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  php(["tests/e2e/identity.php", "enable-bulk-ux"]);
  await page.reload();
  await page
    .getByRole("button", { name: "Import / export", exact: true })
    .click();
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,sku,selling_price,cost_price\r\nImported Coffee,UX-COFFEE,180,100\r\n",
    ),
  });
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByText("1 of 1 rows passed validation", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 1 products", exact: true })
    .click();
  await expect(
    page.getByText("Import complete", { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("techpos-products.csv");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported Coffee", exact: true }),
  ).toBeVisible();
  await page.goto("/labels");
  await page.getByLabel("Wording for Product").fill("UX Item");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Labels saved." }),
  ).toBeVisible();
  await page.getByLabel("Label section").selectOption("navigation");
  await page
    .getByRole("button", { name: "Restore section", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore default wording", exact: true })
    .click();
  await expect(page.getByLabel("Wording for Product")).not.toHaveValue(
    "UX Item",
  );
  // Delay actual Web Lock acquisition to expose any false initial conflict banner.
  await page.addInitScript(() => {
    const state = window as unknown as { checkoutConflictFlashes: number };
    state.checkoutConflictFlashes = 0;
    const observer = new MutationObserver(() => {
      if (
        Array.from(document.querySelectorAll('[role="alert"]')).some((el) =>
          el.textContent?.includes("Cashier is already open in another tab"),
        )
      )
        state.checkoutConflictFlashes++;
    });
    observer.observe(document, { childList: true, subtree: true });
    const request = navigator.locks.request.bind(navigator.locks);
    Object.defineProperty(navigator.locks, "request", {
      configurable: true,
      value: (name: string, ...args: unknown[]) => {
        if (!name.startsWith("techpos:checkout:"))
          return Reflect.apply(request, navigator.locks, [name, ...args]);
        return new Promise((resolve, reject) =>
          setTimeout(() => {
            Promise.resolve(
              Reflect.apply(request, navigator.locks, [name, ...args]),
            ).then(resolve, reject);
          }, 850),
        );
      },
    });
  });
  await page.goto("/pos");
  await expect(
    page.getByRole("status").filter({ hasText: "Preparing your cashier" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Skip walkthrough", exact: true })
    .click();
  const scanner = page.getByRole("textbox", {
    name: "Scan barcode or search products",
    exact: true,
  });
  await expect(scanner).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(scanner).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { checkoutConflictFlashes: number })
            .checkoutConflictFlashes,
      ),
    ).toBe(0);
  }
  const waiting = await context.newPage();
  await waiting.goto("/pos");
  await expect(waiting.getByRole("alert")).toContainText(
    "Cashier is already open in another tab",
  );
  await expect(
    waiting.getByRole("textbox", {
      name: "Scan barcode or search products",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.close();
  await expect(
    waiting.getByRole("textbox", {
      name: "Scan barcode or search products",
      exact: true,
    }),
  ).toBeVisible();
  await expect(waiting.getByRole("alert")).toHaveCount(0);
  await waiting.close();
});
