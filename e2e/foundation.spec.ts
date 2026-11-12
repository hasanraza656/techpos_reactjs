import { test, expect } from "@playwright/test";
import { php, backendOrigin } from "./setup";
test("team invitation, invited signup, branch access and session revocation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // This workflow creates its own business so it is independent from subscription tests.
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("Team Owner");
  await page.getByLabel("Business name", { exact: true }).fill("QA Team Store");
  await page.getByLabel("Email address").fill("e2e-team-owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("BrowserOwner123");
  await page.getByLabel("Confirm password").fill("BrowserOwner123");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByRole("button", { name: "Finish later" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Team." }),
  ).toBeVisible();
  php(["tests/e2e/identity.php", "verify-team"]);
  await page.reload();
  await page.getByRole("link", { name: "Team members", exact: true }).click();
  await page.getByRole("button", { name: "Invite teammate" }).click();
  await page.getByLabel("Email address").fill("qa-invited@example.test");
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption({ label: "Cashier" });
  await page.getByLabel("Branch access").selectOption({ label: "Main branch" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByText("qa-invited@example.test", { exact: true }),
  ).toBeVisible();
  const { token } = JSON.parse(php(["tests/e2e/identity.php", "invitation"]));
  const workerContext = await browser.newContext();
  const worker = await workerContext.newPage();
  await worker.goto("/invitations/" + token);
  await worker
    .getByRole("button", { name: "Create an invited account" })
    .click();
  await worker.getByLabel("Your name").fill("QA Worker");
  await worker
    .locator('input[autocomplete="new-password"]')
    .first()
    .fill("WorkerPassword123");
  await worker
    .getByLabel("Confirm password", { exact: true })
    .fill("WorkerPassword123");
  await worker.getByRole("button", { name: "Create account and join" }).click();
  await expect(
    worker.getByRole("heading", { name: "Hello, QA." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "QA Worker qa-invited@example.test" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Account security", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Active sessions", exact: true }),
  ).toBeVisible();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto("/login");
  await second.getByLabel("Email address").fill("e2e-team-owner@example.test");
  await second.getByLabel("Password", { exact: true }).fill("BrowserOwner123");
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    second.getByRole("heading", { name: "Hello, Team." }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Revoke other sessions", exact: true })
    .click();
  await page.getByLabel("Confirm your password").fill("BrowserOwner123");
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Other sessions revoked",
  );
  await second.reload();
  await expect(
    second.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await secondContext.close();
  await workerContext.close();
  await page
    .getByRole("button", { name: "Set up authenticator", exact: true })
    .click();
  await page.getByLabel("Confirm your password").fill("BrowserOwner123");
  await page
    .getByRole("button", { name: "Continue to authenticator setup" })
    .click();
  await expect(page.getByTestId("authenticator-secret")).toBeVisible();
  const { code } = JSON.parse(php(["tests/e2e/identity.php", "otp-team"]));
  await page.getByLabel("Authenticator code", { exact: true }).fill(code);
  await page
    .getByRole("button", {
      name: "Enable two-factor authentication",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  const recovery = await page
    .locator(".recovery-codes code")
    .first()
    .textContent();
  await page
    .getByRole("button", { name: "I’ve saved my recovery codes" })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("e2e-team-owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("BrowserOwner123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check your authenticator." }),
  ).toBeVisible();
  await page.getByLabel("Authentication or recovery code").fill(recovery ?? "");
  await page.getByRole("button", { name: "Complete sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Team." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Account security", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Active sessions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Two-factor authentication",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.tools/account-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.tools/account-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("registration, onboarding, configuration, payment and audited approval", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("QA Owner");
  await page.getByLabel("Business name", { exact: true }).fill("QA Pharmacy");
  await page.getByLabel("Email address").fill("e2e-owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("BrowserOwner123");
  await page.getByLabel("Confirm password").fill("BrowserOwner123");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "What kind of business do you run?" }),
  ).toBeVisible();
  php(["tests/e2e/identity.php", "verify"]);
  await page.reload();
  await page.getByRole("button", { name: /Pharmacy/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How does your business work?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel(/^Phone/).fill("03001234567");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Hello, QA." })).toBeVisible();
  await page
    .getByRole("link", { name: "Language & labels", exact: true })
    .click();
  await page.getByLabel("Wording for Product").fill("Medicine item");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Labels saved." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Roles & permissions", exact: true })
    .click();
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  await page.getByLabel("Role name").fill("QA Sales");
  await page.getByLabel("Start from a template").selectOption("Cashier");
  await page.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "QA Sales", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Subscription", exact: true }).click();
  await page.getByRole("button", { name: "Choose Standard" }).click();
  await page
    .getByRole("button", { name: "Continue to payment instructions" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bank Transfer" }),
  ).toBeVisible();
  await page.getByLabel("Transaction reference").fill("BROWSER-TX-001");
  const png = await page.screenshot({ type: "png" });
  await page
    .getByLabel("Payment screenshot", { exact: true })
    .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/payment is under review/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "../.tools/workspace-desktop.png",
    fullPage: true,
  });
  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email address").fill("e2e-admin@example.test");
  await admin.getByLabel("Password", { exact: true }).fill("BrowserAdmin123");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "A clear view of the platform." }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Review", exact: true }).click();
  await admin.getByLabel("Confirm your password").fill("BrowserAdmin123");
  await admin.getByRole("button", { name: "Save review" }).click();
  await expect(admin.getByRole("dialog")).toHaveCount(0);
  await admin
    .getByRole("link", { name: "Payments & approvals", exact: true })
    .click();
  await expect(
    admin.getByRole("table").getByText("Approved", { exact: true }),
  ).toBeVisible();
  await context.close();
  await page.reload();
  await expect(page.getByText(/You’re on Standard/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello, QA." })).toBeVisible();
  await page.screenshot({
    path: "../.tools/workspace-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("Blade public pages and responsive lead capture", async ({ page }) => {
  await page.goto(backendOrigin);
  await expect(
    page.getByRole("heading", { name: "Less busywork. More possibility." }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.tools/marketing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Resources", exact: true }),
  ).toBeVisible();
  await page.goto(`${backendOrigin}/contact?utm_source=browser`);
  await page.getByLabel("Your name").fill("Browser Lead");
  await page.getByLabel("Email address").fill("lead@example.test");
  await page
    .getByLabel("How can we help?")
    .fill("Please tell me about business setup.");
  await page.getByRole("button", { name: "Send your request" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your request has been received",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.tools/marketing-mobile.png",
    fullPage: true,
  });
});
test("CSRF is required and local business stores are isolated and cleared", async ({
  page,
}) => {
  await page.goto("/login");
  await page.request.get("/sanctum/csrf-cookie");
  const denied = await page.request.post("/api/v1/auth/login", {
    data: { email: "e2e-owner@example.test", password: "BrowserOwner123" },
    headers: { Accept: "application/json" },
  });
  expect(denied.status()).toBe(419);
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/offline.ts";
    const m = await import(modulePath);
    const a = m.businessStore("business-a", "qa-user");
    const b = m.businessStore("business-b", "qa-user");
    await a.metadata.put({ key: "scope", value: "A" });
    await b.metadata.put({ key: "scope", value: "B" });
    const isolated =
      (await a.metadata.get("scope"))?.value === "A" &&
      (await b.metadata.get("scope"))?.value === "B";
    a.close();
    b.close();
    await m.clearBusinessData("qa-user");
    const fresh = m.businessStore("business-a", "qa-user");
    const empty = (await fresh.metadata.count()) === 0;
    fresh.close();
    return isolated && empty;
  });
  expect(result).toBeTruthy();
});
