import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, test } from "@playwright/test";

test("website visitor and staff exchange messages without exposing internal notes", async ({ page, browser }) => {
  const email = `inbox-${randomUUID()}@test.clientos.invalid`;
  const password = "Local-inbox-test-pass1";
  expect((await page.request.post("/api/v1/auth/register", { data: { name: "Inbox operator", email, password, organisationName: email } })).status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/communications");
  await expect(page.getByRole("heading", { name: "Communication Centre" })).toBeVisible();
  for (const [theme, width] of [["aurora", 1440], ["professional-dark", 768], ["professional-light", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((value) => localStorage.setItem("encifone-theme", value), theme);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Communication Centre" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
  await page.getByRole("link", { name: "Available integrations" }).click();
  await expect(page.getByRole("heading", { name: "Gmail", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Manage EncifOne Website Chat" }).click();
  let snippet = "";
  const websiteServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="en"><title>Local widget test</title><body>${snippet}</body></html>`);
  });
  websiteServer.listen(0, "127.0.0.1");
  await once(websiteServer, "listening");
  const address = websiteServer.address();
  if (!address || typeof address === "string") throw new Error("Widget test site did not start.");
  const website = `http://127.0.0.1:${address.port}`;
  try {
  await page.getByLabel("Brand name").fill("Support team");
  await page.getByLabel("Welcome message").fill("Welcome to chat");
  await page.getByLabel("Allowed website origins").fill(website);
  await page.getByLabel("Privacy notice").fill("Messages are shared with our support staff.");
  await page.getByRole("button", { name: "Save widget" }).click();
  snippet = await page.getByLabel("Installation snippet").inputValue();
  await page.goto("/inbox");
  const customer = await browser.newPage();
  try {
    await customer.goto(website);
    await customer.getByRole("button", { name: "Open chat", exact: true }).click();
    await customer.getByLabel("Name (optional)").fill("A website visitor");
    await customer.getByLabel("Message", { exact: true }).fill("Please help me");
    await customer.getByRole("button", { name: "Send message" }).click();
    await page.getByRole("button", { name: /A website visitor/ }).click();
    await expect(page.getByText("Please help me", { exact: true })).toBeVisible();
    await page.getByLabel("Message type").selectOption("NOTE");
    await page.locator("textarea[name=body]").fill("Private note");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Private note", { exact: true })).toBeVisible();
    await page.getByLabel("Message type").selectOption("OUTBOUND");
    await page.locator("textarea[name=body]").fill("We can help");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(customer.getByText(/We can help/)).toBeVisible();
    await expect(customer.getByText(/Private note/)).toHaveCount(0);
    for (const [theme, width] of [["aurora", 1440], ["professional-dark", 768], ["professional-light", 390]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => localStorage.setItem("encifone-theme", value), theme);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Universal Inbox" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  } finally { await customer.close(); }
  } finally { websiteServer.close(); }
});

test("staff schedule and cancel an appointment without replacing task due dates", async ({ page }) => {
  const email = `calendar-${randomUUID()}@test.clientos.invalid`;
  const password = "Local-inbox-test-pass1";
  expect((await page.request.post("/api/v1/auth/register", { data: {
    name: "Calendar operator", email, password, organisationName: email,
  } })).status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Task due dates" })).toBeVisible();
  await page.getByText("New appointment", { exact: true }).click();
  await page.getByLabel("Appointment title").fill("Calendar consultation");
  await page.getByLabel("Appointment type").fill("Consultation");
  await page.locator('select[name="staffId"]').selectOption({ label: "Calendar operator" });
  const start = new Date(Date.now() + 3_600_000);
  const localStart = new Date(+start - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Start time").fill(localStart);
  await page.getByRole("button", { name: "Save appointment" }).click();
  await expect(page.getByText("Calendar consultation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText("Calendar consultation", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel appointment", exact: true }).click();
  await expect(page.getByText("Calendar consultation", { exact: true })).toHaveCount(0);
});
