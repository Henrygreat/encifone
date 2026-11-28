import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("product identity follows the build configuration across sign-in and navigation", async ({ page }) => {
  const product = process.env.BRAND_TEST_NAME ?? "EncifOne";
  await page.goto("/login");
  await expect(page).toHaveTitle(product);
  await expect(page.getByText(`Welcome back to ${product}.`)).toBeVisible();
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  if (!favicon) throw new Error("Missing application favicon");
  expect((await page.request.get(favicon)).ok()).toBe(true);

  if (product === "Kora") {
    await expect(page.getByText("Your intelligent business companion.")).toBeVisible();
    await expect(page.getByText("A product by ENCIF")).toBeVisible();
    for (const [theme, width, variant] of [
      ["aurora", 1440, "dark"], ["professional-dark", 768, "dark"], ["professional-light", 390, "light"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => localStorage.setItem("encifone-theme", value), theme);
      await page.reload();
      await expect(page.locator(`img[src*="wordmark-${variant}.svg"]`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  }

  const email = `brand-${randomUUID()}@test.clientos.invalid`;
  const password = "Local-brand-test-pass1";
  expect((await page.request.post("/api/v1/auth/register", { data: {
    name: "Brand reviewer", email, password, organisationName: "Brand test organisation",
  } })).status()).toBe(201);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("link", { name: product, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("link", { name: product, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: product, exact: true })).toBeVisible();
});
