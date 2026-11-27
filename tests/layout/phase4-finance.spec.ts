import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function signInOwner(page: Page) {
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
  return key;
}

test("a finance owner drafts, issues, and reconciles an invoice across desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const key = await signInOwner(page);
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

test("a portal client accepts a shared estimate and downloads only its own issued invoice", async ({ page, browser }) => {
  const key = await signInOwner(page);
  const createClient = async (name: string) => {
    const response = await page.request.post("/api/v1/clients", { data: { name } });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const clientId = await createClient("Portal finance customer");
  const otherClientId = await createClient("Different customer");
  const invite = await page.request.post(`/api/v1/clients/${clientId}/portal-users`, {
    data: { email: `portal-${key}@test.clientos.invalid` },
  });
  expect(invite.status()).toBe(201);
  const inviteUrl = new URL((await invite.json()).inviteUrl);
  const lines = [{ description: "Consultation", unitPriceMinor: 2900 }];
  const quote = await page.request.post("/api/v1/estimates", { data: { title: "Shared consultation", clientId, lines } });
  expect(quote.status()).toBe(201);
  const { id: quoteId } = await quote.json();
  expect((await page.request.patch(`/api/v1/estimates/${quoteId}`, { data: { status: "SENT" } })).ok()).toBe(true);
  const privateInvoice = await page.request.post("/api/v1/invoices", {
    data: { creationKey: randomUUID(), clientId: otherClientId, lines },
  });
  expect(privateInvoice.status()).toBe(201);
  const { id: privateInvoiceId } = await privateInvoice.json();
  expect((await page.request.post(`/api/v1/invoices/${privateInvoiceId}/finalise`)).ok()).toBe(true);

  const portal = await browser.newContext({ baseURL: inviteUrl.origin, viewport: { width: 390, height: 844 } });
  try {
    const acceptInvite = await portal.request.post("/api/portal/auth/accept-invite", {
      data: { token: inviteUrl.searchParams.get("token"), password: `Portal-${key}` },
    });
    expect(acceptInvite.ok()).toBe(true);
    const clientPage = await portal.newPage();
    await clientPage.goto("/portal/dashboard");
    await clientPage.getByRole("link", { name: "Invoices and estimates" }).click();
    await expect(clientPage.getByText("No issued invoices.")).toBeVisible();
    await expect(clientPage.getByText("Shared consultation", { exact: false })).toBeVisible();
    await clientPage.getByRole("button", { name: "Accept estimate", exact: true }).click();
    await expect(clientPage.getByText("Shared consultation · accepted")).toBeVisible();

    const accepted = await page.request.get(`/api/v1/estimates/${quoteId}`);
    const { acceptedInvoiceId } = await accepted.json();
    expect(acceptedInvoiceId).toBeTruthy();
    await expect(clientPage.getByText("No issued invoices.")).toBeVisible();
    expect((await page.request.post(`/api/v1/invoices/${acceptedInvoiceId}/finalise`)).ok()).toBe(true);
    await clientPage.reload();
    await expect(clientPage.getByRole("link", { name: "Download PDF" })).toHaveCount(1);
    const pdf = await portal.request.get(`/api/portal/finance/invoices/${acceptedInvoiceId}/pdf`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await portal.request.get(`/api/portal/finance/invoices/${privateInvoiceId}/pdf`)).status()).toBe(404);
  } finally {
    await portal.close();
  }
});
