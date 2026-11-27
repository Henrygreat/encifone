import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a finance owner drafts, issues, and reconciles an invoice across desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const key = randomUUID();
  const email = `finance-browser-${key}@test.clientos.invalid`;
  const password = `Test-${key}`;
  const signup = await page.request.post("/api/v1/auth/register", {
    data: { name: "Finance Tester", email, password, organisationName: `Finance ${key}` },
  });
  expect(signup.status()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Monthly recurring revenue", { exact: false })).toBeVisible();
  for (const theme of ["aurora", "professional-dark", "professional-light"]) {
    await page.evaluate((value) => localStorage.setItem("encifone-theme", value), theme);
    await page.reload();
    await expect(page.getByText("Monthly recurring revenue", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1441);
  }
  await page.getByRole("link", { name: "Invoices", exact: true }).last().click();
  await page.getByText("New invoice", { exact: true }).click();
  await page.getByLabel("Description").fill("Finance workflow");
  await page.getByLabel("Unit price (minor units)").fill("5000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Invoice DRAFT")).toBeVisible();
  await page.getByRole("button", { name: "Finalise", exact: true }).click();
  await expect(page.getByText("Invoice 1", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("summary").filter({ hasText: "Record payment" }).click();
  await page.getByLabel("Amount (GBP minor units)").fill("5000");
  await page.getByLabel("External reference").fill(`browser-${key}`);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByText(/PAID.*Balance/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
