import { test, expect, type Page } from "@playwright/test";
import { php } from "./setup";

test.use({ actionTimeout: 15000 });

async function login(
  page: Page,
  email = "e2e-admin@example.test",
  password = "BrowserAdmin123",
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".platform-sidebar")).toBeVisible();
}
async function save(page: Page, label = "Save changes") {
  const d = page.getByRole("dialog").last();
  await d
    .getByLabel("Reason / administrative note")
    .fill("Browser QA administrator action");
  await d.getByLabel("Confirm your password").fill("BrowserAdmin123");
  await d.getByRole("button", { name: label, exact: true }).click();
  await expect(d).toHaveCount(0);
}
async function scope(page: Page, id: string) {
  await page.getByLabel("Filter by client").selectOption(id);
}

test("platform inventory scope, approval, invoices and responsive navigation", async ({
  page,
}) => {
  test.setTimeout(120000);
  const fixture = JSON.parse(
    php(["tests/e2e/identity.php", "platform-fixture"]),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(
    page
      .getByRole("navigation", { name: "Platform navigation" })
      .getByRole("link"),
  ).toHaveCount(14);
  await page
    .getByRole("link", { name: "All client inventory", exact: true })
    .click();
  await scope(page, fixture.north);
  await expect(page.getByText("North Tea", { exact: true })).toBeVisible();
  await expect(page.getByText("South Tea", { exact: true })).toHaveCount(0);
  await page.getByLabel("Filter branch").selectOption({ label: "Main branch" });
  await page
    .getByLabel("Filter warehouse")
    .selectOption({ label: "Main stockroom" });
  await expect(page.getByText("North Tea", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Stock history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Opening stock");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Payments & approvals", exact: true })
    .click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await save(page, "Save review");
  await expect(
    page.getByRole("table").getByText("Approved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Status timeline");
  await expect(
    page.getByRole("link", { name: "Download private proof", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Billing invoices", exact: true })
    .click();
  await expect(
    page.getByRole("table").getByText("Paid", { exact: true }),
  ).toBeVisible();
  const [doc] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: "View / print", exact: true }).click(),
  ]);
  await expect(
    doc.getByText("Subscription invoice", { exact: true }),
  ).toBeVisible();
  await expect(doc.locator("body")).toContainText("Portal North Shop");
  await doc.close();
  await page
    .getByRole("link", { name: "Subscriptions & due dates", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: /Standard/ }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "../.tools/platform-subscriptions-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open platform navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "All client inventory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inventory across every client." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.tools/platform-inventory-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("platform creates user and role, assigns restricted staff and enforces API permissions", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await page.getByLabel("Full name").fill("Portal Observer");
  await page.getByLabel("Email address").fill("portal-observer@example.test");
  await page
    .getByLabel("New password", { exact: true })
    .fill("ObserverPassword123");
  await save(page);
  const user = page
    .getByRole("row")
    .filter({ hasText: "portal-observer@example.test" });
  await user.getByRole("button", { name: "Verify email", exact: true }).click();
  await save(page);
  await page
    .getByRole("link", { name: "Roles & permissions", exact: true })
    .click();
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  await page.getByLabel("Role name").fill("Portal inventory observer");
  await page
    .getByRole("checkbox", { name: /View client profiles and usage/ })
    .check();
  await page
    .getByRole("checkbox", { name: /Read inventory across clients/ })
    .check();
  await save(page);
  await expect(
    page.getByRole("heading", {
      name: "Portal inventory observer",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await user.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: "Assign platform roles", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Portal inventory observer", exact: true })
    .check();
  await save(page);
  const staff = await browser.newContext();
  const restricted = await staff.newPage();
  await login(
    restricted,
    "portal-observer@example.test",
    "ObserverPassword123",
  );
  await expect(restricted).toHaveURL(/\/platform\/clients/);
  await expect(
    restricted.getByRole("link", { name: "All client inventory", exact: true }),
  ).toBeVisible();
  await expect(
    restricted.getByRole("link", { name: "Payments & approvals", exact: true }),
  ).toHaveCount(0);
  const response = await restricted.request.get("/api/v1/platform/payments");
  expect(response.status()).toBe(403);
  await restricted
    .getByRole("link", { name: "All client inventory", exact: true })
    .click();
  await expect(
    restricted.getByRole("columnheader", {
      name: "Recorded cost",
      exact: true,
    }),
  ).toHaveCount(0);
  await staff.close();
  await user.getByRole("button", { name: "Suspend", exact: true }).click();
  await save(page);
  await expect(user.getByText("Suspended", { exact: true })).toBeVisible();
  await user.getByRole("button", { name: "Activate", exact: true }).click();
  await save(page);
});

test("platform client lifecycle, invoices, tenant roles and configuration forms", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page);
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await page.getByLabel("Business name").fill("Portal Created Client");
  await page.getByLabel("New owner name").fill("Created Owner");
  await page
    .getByLabel("New owner email")
    .fill("portal-created-owner@example.test");
  await page.getByLabel("New owner password").fill("CreatedOwner123");
  await save(page);
  const row = page
    .getByRole("row")
    .filter({ hasText: "Portal Created Client" });
  await row.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "portal-created-owner@example.test",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await row.getByRole("button", { name: "Suspend", exact: true }).click();
  await save(page);
  await row
    .getByRole("button", { name: "Restore access", exact: true })
    .click();
  await save(page);
  const client = await page.evaluate(async () => {
    const data = await fetch(
      "/api/v1/platform/clients?q=Portal%20Created%20Client",
      { headers: { Accept: "application/json" } },
    ).then((r) => r.json());
    return data.data[0].public_id as string;
  });
  await scope(page, client);
  await page
    .getByRole("link", { name: "Billing invoices", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  await page
    .getByLabel("Plan", { exact: true })
    .selectOption({ label: "Standard" });
  await save(page);
  await expect(
    page.getByRole("table").getByText("Issued", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Void", exact: true }).click();
  await save(page);
  await expect(
    page.getByRole("table").getByText("Void", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Client team access", exact: true })
    .click();
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  await page
    .getByLabel("Apply a role template")
    .selectOption({ label: "Read-only Auditor" });
  await page.getByLabel("Role name").fill("Portal client auditor");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "Portal client auditor", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await page.getByLabel("Full name").fill("Portal Employee");
  await page.getByLabel("Email address").fill("portal-employee@example.test");
  await page
    .getByLabel("New password", { exact: true })
    .fill("EmployeePassword123");
  await save(page);
  await page
    .getByRole("link", { name: "Client team access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add / assign member", exact: true })
    .click();
  await page
    .getByLabel("Find user for User", { exact: true })
    .fill("portal-employee");
  await page
    .getByLabel("User", { exact: true })
    .selectOption({ label: "portal-employee@example.test · Portal Employee" });
  await page
    .getByLabel("Client role", { exact: true })
    .selectOption({ label: "Portal client auditor" });
  await page
    .getByLabel("Branch restriction")
    .selectOption({ label: "Main branch" });
  await save(page);
  await expect(
    page.getByText("portal-employee@example.test", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove membership", exact: true })
    .click();
  await save(page);
  await expect(
    page.getByText("portal-employee@example.test", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Platform settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Billing identity", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Plans & features", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Standard", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "An accountable platform." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("cell", { name: "platform.tenant_role_saved", exact: true })
      .first(),
  ).toBeVisible();
});
