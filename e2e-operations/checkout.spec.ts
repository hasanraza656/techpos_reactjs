import { test, expect } from "@playwright/test";
import { php } from "../e2e/setup";

test("catalog, barcode checkout, durable offline reload, retry deduplication and shift reconciliation", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("Counter Owner");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("QA Counter Store");
  await page.getByLabel("Email address").fill("e2e-operations@example.test");
  await page.getByLabel("Password", { exact: true }).fill("CounterPassword123");
  await page.getByLabel("Confirm password").fill("CounterPassword123");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByRole("button", { name: "Finish later" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Counter." }),
  ).toBeVisible();
  php(["tests/e2e/identity.php", "verify-operations"]);
  await page.reload();
  await page
    .getByRole("link", { name: "Product catalog", exact: true })
    .click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Counter Tea");
  await dialog.getByLabel("SKU", { exact: true }).fill("TEA-01");
  await dialog.getByLabel("Cost price", { exact: true }).fill("60.0000");
  await dialog.getByLabel("Selling price", { exact: true }).fill("100.00");
  await dialog.getByLabel("Barcodes (one per line)").fill("896000000001");
  await dialog
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Counter Tea", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record stock", exact: true }).click();
  await dialog.getByLabel("Quantity", { exact: true }).fill("10.000");
  await dialog.getByLabel("Reason", { exact: true }).fill("Real opening count");
  await dialog
    .getByRole("button", { name: "Record inventory movement" })
    .click();
  await expect(page.getByText("10 piece", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Cashier", exact: true }).click();
  await page.getByRole("button", { name: "Skip walkthrough" }).click();
  await page.getByRole("button", { name: "Open register shift" }).click();
  await dialog.getByLabel("Opening float", { exact: true }).fill("1000.00");
  await dialog.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Manage shift", exact: true }),
  ).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto("/pos");
  await expect(otherTab.getByRole("alert")).toContainText(
    "Cashier is already open in another tab",
  );
  await expect(
    otherTab.getByRole("textbox", { name: "Scan barcode or search products" }),
  ).toHaveCount(0);
  await otherTab.close();
  const scanner = page.getByRole("textbox", {
    name: "Scan barcode or search products",
  });
  await scanner.fill("896000000001");
  await scanner.press("Enter");
  await expect(page.getByLabel("Quantity for Counter Tea")).toHaveValue(
    "1.000",
  );
  await scanner.press("F5");
  await dialog
    .getByLabel("Cart label", { exact: true })
    .fill("Waiting customer");
  await dialog.getByRole("button", { name: "Hold cart", exact: true }).click();
  await expect(page.getByLabel("Quantity for Counter Tea")).toHaveCount(0);
  await scanner.press("F6");
  await dialog.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByLabel("Quantity for Counter Tea")).toHaveValue(
    "1.000",
  );
  await scanner.fill("896000000001");
  await scanner.press("Enter");
  await expect(page.getByLabel("Quantity for Counter Tea")).toHaveValue(
    "2.000",
  );
  await page.getByRole("button", { name: "Take payment" }).click();
  await dialog.getByLabel("Amount received 1", { exact: true }).fill("500.00");
  await dialog
    .getByRole("button", { name: "Complete sale", exact: true })
    .dblclick();
  await expect(
    dialog.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Change: 300.00")).toBeVisible();
  await page.evaluate(() => {
    const prototype = HTMLIFrameElement.prototype;
    const original = Object.getOwnPropertyDescriptor(
      prototype,
      "contentWindow",
    )!;
    (
      window as Window & { restoreTestPrinter?: () => void }
    ).restoreTestPrinter = () =>
      Object.defineProperty(prototype, "contentWindow", original);
    Object.defineProperty(prototype, "contentWindow", {
      configurable: true,
      get(this: HTMLIFrameElement) {
        const frameWindow = original.get!.call(this) as Window | null;
        if (frameWindow && this.title === "Print preview")
          frameWindow.print = () => {
            throw new Error("Simulated unavailable printer");
          };
        return frameWindow;
      },
    });
  });
  await dialog
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "The print dialog could not open",
  );
  await page.evaluate(() => {
    (
      window as Window & { restoreTestPrinter?: () => void }
    ).restoreTestPrinter?.();
  });
  await dialog.getByRole("button", { name: "Next customer" }).click();
  await page
    .getByRole("button", { name: "Prepare offline catalog", exact: true })
    .click();
  await expect(
    page.getByText("1 products ready offline", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await scanner.fill("896000000001");
  await scanner.press("Enter");
  await page.getByRole("button", { name: "Take payment" }).click();
  await dialog
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Sale saved locally" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Next customer" }).click();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Scan barcode or search products" }),
  ).toBeVisible();
  await expect(page.locator(".cashier-tools")).toContainText("1 pending");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unsynced transactions");
  await page.getByRole("link", { name: "Sync issues", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local receipts · 1 pending" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Export pending journal", exact: true })
    .click();
  await dialog
    .getByLabel("Recovery passphrase", { exact: true })
    .fill("RecoveryBrowser123");
  await dialog
    .getByLabel("Confirm recovery passphrase", { exact: true })
    .fill("RecoveryBrowser123");
  const recoveryDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download encrypted backup", exact: true })
    .click();
  await (await recoveryDownload).saveAs("../.tools/recovery-e2e.json");
  await page
    .getByRole("button", { name: "Restore recovery file", exact: true })
    .click();
  await dialog
    .getByLabel("Encrypted recovery file", { exact: true })
    .setInputFiles("../.tools/recovery-e2e.json");
  await dialog
    .getByLabel("Recovery passphrase", { exact: true })
    .fill("RecoveryBrowser123");
  await dialog
    .getByRole("button", { name: "Import original records", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "0 original transactions restored; 1 already present",
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Synchronize", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local receipts · 0 pending" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Synchronize", exact: true }).click();
  await expect(page.getByText("Accepted", { exact: true })).toHaveCount(2);
  // Paid-plan fixture is restricted to the isolated test DB; real approvals have their own E2E workflow.
  php(["tests/e2e/identity.php", "enable-returns"]);
  await page.reload();
  await page
    .getByRole("link", { name: "Sales & cash returns", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View sale", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: "Record cash return", exact: true })
    .click();
  await dialog
    .getByLabel("Return quantity for Counter Tea", { exact: true })
    .fill("1.000");
  await dialog
    .getByLabel("Return reason", { exact: true })
    .fill("Sealed item returned");
  await dialog
    .getByRole("button", { name: "Confirm cash refund", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("PKR 100.00");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("link", { name: "Sales summary", exact: true }).click();
  await expect(
    page.locator(".stat").filter({ hasText: "Net receipts" }),
  ).toContainText("PKR 200.00");
  await expect(
    page.locator(".stat").filter({ hasText: "Gross profit" }),
  ).toContainText("PKR 80.0000");
  await page.getByRole("link", { name: "Cashier", exact: true }).click();
  await page.getByRole("button", { name: "Manage shift", exact: true }).click();
  await expect(dialog).toContainText("Expected cash: 1200.00");
  await dialog
    .getByRole("combobox", { name: "Action", exact: true })
    .selectOption("close");
  await dialog.getByLabel("Actual counted cash").fill("1200.00");
  await dialog
    .getByRole("button", { name: "Close shift", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open register shift" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-cart-summary")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.tools/cashier-mobile.png",
    fullPage: true,
  });
  const beforePractice = JSON.parse(
    php(["tests/e2e/identity.php", "operation-counts"]),
  );
  await page
    .getByRole("button", { name: "Cashier settings", exact: true })
    .click();
  await dialog
    .getByLabel("Practice mode (start with an empty cart)", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await scanner.fill("896000000001");
  await scanner.press("Enter");
  await page.locator(".mobile-cart-summary").click();
  await dialog.getByRole("button", { name: "Take payment" }).click();
  await dialog
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Practice complete", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Next customer" }).click();
  expect(
    JSON.parse(php(["tests/e2e/identity.php", "operation-counts"])),
  ).toEqual(beforePractice);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../.tools/cashier-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (await indexedDB.databases()).filter((d) =>
          d.name?.startsWith("techpos:v1:"),
        ).length,
    ),
  ).toBe(0);
  await page.getByLabel("Email address").fill("e2e-operations@example.test");
  await page.getByLabel("Password", { exact: true }).fill("CounterPassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Cashier", exact: true }).click();
  await page.getByRole("button", { name: "Skip walkthrough" }).click();
  await page
    .getByRole("button", { name: "Open register shift", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Open shift", exact: true }).click();
  await scanner.fill("896000000001");
  await scanner.press("Enter");
  await page.getByRole("button", { name: "Take payment" }).click();
  await dialog
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  const sequence = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((d) =>
      d.name?.startsWith("techpos:v1:"),
    )!.name!;
    const request = indexedDB.open(name);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db
        .transaction("receipts", "readonly")
        .objectStore("receipts")
        .getAll();
      const rows = await new Promise<{ payload: { local_sequence: number } }[]>(
        (resolve, reject) => {
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        },
      );
      return rows[0].payload.local_sequence;
    } finally {
      db.close();
    }
  });
  expect(sequence).toBe(3);
  expect(errors).toEqual([]);
});
