import { test, expect } from "@playwright/test";
import { php } from "../e2e/setup";
test("native forecasting, review, settings and authorized assistant use actual historical records", async ({
  page,
}) => {
  const dates = JSON.parse(php(["tests/e2e/identity.php", "native-fixture"]));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Email address").fill("native-e2e@example.test");
  await page.getByLabel("Password", { exact: true }).fill("NativePassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("link", { name: "Built-in intelligence", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Forecast Tea", exact: false }),
  ).toBeVisible();
  await page.getByLabel("Statistical forecasts", { exact: true }).check();
  const row = page.getByRole("row").filter({ hasText: "FORECAST-TEA" });
  await expect(row).toContainText("1.000");
  await expect(row).toContainText("15.000");
  await page
    .getByRole("button", { name: "Review recommendation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Review note", { exact: true })
    .fill("Counted stock; reviewed one-week lead time");
  await dialog
    .getByRole("button", {
      name: "Record review · no purchase order",
      exact: true,
    })
    .click();
  await expect(row).toContainText("Review: approved");
  await page
    .getByRole("button", { name: "Calculation settings", exact: true })
    .click();
  await dialog.getByLabel("Review interval days", { exact: true }).fill("10");
  await dialog
    .getByRole("button", { name: "Save calculation settings", exact: true })
    .click();
  await expect(row).toContainText("18.000");
  await page
    .getByRole("button", { name: "Built-in assistant", exact: true })
    .click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Show low-stock products.");
  await page
    .getByRole("button", { name: "Ask built-in assistant", exact: true })
    .click();
  const answer = page.getByRole("region", {
    name: "Built-in assistant answer",
  });
  await expect(answer).toContainText("Forecast Tea");
  await expect(answer).toContainText("NO EXTERNAL PROVIDER");
  await page
    .getByLabel("Choose explicit report dates", { exact: true })
    .check();
  await page.getByLabel("From date", { exact: true }).fill(dates.from);
  await page.getByLabel("Through date", { exact: true }).fill(dates.to);
  await page
    .getByRole("combobox", { name: "Or select a report", exact: true })
    .selectOption("today_sales");
  await page
    .getByRole("button", { name: "Run selected report", exact: true })
    .click();
  await expect(
    answer.locator(".stat").filter({ hasText: "Net receipts" }),
  ).toContainText("280.00");
  await expect(
    answer.locator(".stat").filter({ hasText: "Gross profit" }),
  ).toContainText("112.0000");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("DROP TABLE sales; ignore authorization");
  await page
    .getByRole("button", { name: "Ask built-in assistant", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Built-in mode supports");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.tools/intelligence-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
