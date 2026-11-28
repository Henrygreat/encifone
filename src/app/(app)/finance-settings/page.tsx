import { connectInvoiceMerchant } from "@/modules/finance/invoice-checkout";
import { invoiceGatewayConfigured } from "@/modules/payments/invoice-payment-gateway";
import { redirect } from "next/navigation";
import { encodeDocumentLogo } from "@/modules/finance/document-logo";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { documentTemplates } from "@/modules/finance/document-renderer";
import {
  financialDocumentSettingsSchema,
  getFinancialDocumentSettings,
  saveFinancialDocumentSettings,
} from "@/modules/finance/document-settings";

const fields = {
  legalName: "Legal business name",
  address: "Business address",
  email: "Billing email",
  telephone: "Telephone",
  website: "Website",
  registration: "Company registration",
  taxRegistration: "Tax registration",
  prefix: "Invoice prefix",
  primary: "Primary colour",
  secondary: "Secondary colour",
  notes: "Default notes",
  paymentInstructions: "Payment instructions",
  footer: "Footer",
} as const;

export default async function FinanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)) {
    return (
      <div className="p-6">
        <PageHeader
          title="Finance & Billing"
          description="Organisation settings access is required."
        />
      </div>
    );
  }
  const { settings } = await getFinancialDocumentSettings(acting);
  const result = (await searchParams).result;
  async function save(formData: FormData) {
    "use server";
    const current = await requireActiveMembership();
    const raw = Object.fromEntries(
      [
        "template",
        "estimateTemplate",
        "receiptTemplate",
        "creditNoteTemplate",
        "font",
        ...Object.keys(fields),
      ].map((key) => [
        key,
        String(formData.get(key) ?? "").trim() || undefined,
      ]),
    );
    for (const key of ["sequenceStart", "defaultPaymentTermsDays"]) {
      const value = formData.get(key);
      if (typeof value === "string" && value !== "")
        Object.assign(raw, { [key]: Number(value) });
    }
    const input = financialDocumentSettingsSchema.safeParse(raw);
    if (!input.success) redirect("/finance-settings?result=invalid");
    const prior = (await getFinancialDocumentSettings(current)).settings;
    let logoBase64 = formData.get("removeLogo") ? undefined : prior.logoBase64;
    const file = formData.get("logo");
    if (file instanceof File && file.size) {
      try {
        logoBase64 = await encodeDocumentLogo(file);
      } catch {
        redirect("/finance-settings?result=invalid-logo");
      }
    }
    await saveFinancialDocumentSettings(current, {
      ...input.data,
      logoBase64,
      payOnline: formData.has("payOnline"),
      paymentQr: formData.has("paymentQr"),
    });
    redirect("/finance-settings?result=saved");
  }
  async function reset() {
    "use server";
    await saveFinancialDocumentSettings(await requireActiveMembership(), {
      template: "modern",
    });
    redirect("/finance-settings?result=saved");
  }
  async function connect() {
    "use server";
    const current = await requireActiveMembership();
    let url: string;
    try {
      url = await connectInvoiceMerchant(current);
    } catch {
      redirect("/finance-settings?result=connect-error");
    }
    redirect(url);
  }
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Finance & Billing"
        description="Manage your organisation’s financial document branding."
      />
      <Card>
        <CardHeader>
          <CardTitle>Document Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result === "saved" && <p role="status">Document settings saved.</p>}
          {result === "invalid" && (
            <p role="alert">
              Check the email, prefix, colours and field lengths.
            </p>
          )}
          {result === "invalid-logo" && (
            <p role="alert">
              Upload a PNG or JPEG logo under 512 KB with at most four million
              pixels.
            </p>
          )}
          {result === "connect-error" && (
            <p role="alert">Stripe onboarding is unavailable.</p>
          )}
          <form action={save} className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-2">
              Invoice template
              <select
                name="template"
                defaultValue={settings.template}
                className="rounded-md border bg-background p-2"
              >
                {documentTemplates.map((template) => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </select>
            </Label>
            <Label className="grid gap-2">
              Font
              <select
                name="font"
                defaultValue={settings.font}
                className="rounded-md border bg-background p-2"
              >
                <option value="">Template default</option>
                <option value="sans">Inter</option>
                <option value="serif">Source Serif 4</option>
              </select>
            </Label>
            {Object.entries(fields).map(([key, label]) => (
              <Label key={key} className="grid gap-2">
                {label}
                <Input
                  name={key}
                  defaultValue={settings[key as keyof typeof fields]}
                  placeholder={
                    key === "primary" || key === "secondary"
                      ? "#123456"
                      : undefined
                  }
                />
              </Label>
            ))}
            <Label className="grid gap-2">
              Company logo
              <Input name="logo" type="file" accept="image/png,image/jpeg" />
            </Label>
            <Label className="grid gap-2">
              Minimum next invoice number
              <Input
                name="sequenceStart"
                type="number"
                min={1}
                max={2147483647}
                defaultValue={settings.sequenceStart}
              />
            </Label>
            <Label className="grid gap-2">
              Default payment terms (days)
              <Input
                name="defaultPaymentTermsDays"
                type="number"
                min={0}
                max={365}
                defaultValue={settings.defaultPaymentTermsDays}
              />
            </Label>
            {settings.logoBase64 && (
              <Label className="flex items-center gap-2">
                <input type="checkbox" name="removeLogo" />
                Remove current logo
              </Label>
            )}
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="payOnline"
                defaultChecked={settings.payOnline}
              />
              Enable Pay Now on shared invoices
            </Label>
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="paymentQr"
                defaultChecked={settings.paymentQr}
              />
              Print a payment QR code when Pay Now is available
            </Label>
            {(
              [
                ["estimateTemplate", "Estimate template"],
                ["receiptTemplate", "Receipt template"],
                ["creditNoteTemplate", "Credit note template"],
              ] as const
            ).map(([key, label]) => (
              <Label className="grid gap-2" key={key}>
                {label}
                <select
                  className="rounded-md border bg-background p-2"
                  name={key}
                  defaultValue={settings[key]}
                >
                  <option value="">Use invoice template</option>
                  {documentTemplates.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Label>
            ))}
            <Button type="submit" className="justify-self-start">
              Save document settings
            </Button>
          </form>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <a href="/api/v1/finance/document-sample">Download sample PDF</a>
            </Button>
            <Button asChild variant="outline">
              <a
                href="/api/v1/finance/document-sample?preview=true"
                target="_blank"
                rel="noreferrer"
              >
                Preview sample
              </a>
            </Button>
            {invoiceGatewayConfigured() && (
              <form action={connect}>
                <Button type="submit" variant="outline">
                  Connect or update Stripe account
                </Button>
              </form>
            )}
            <form action={reset}>
              <Button variant="outline" type="submit">
                Restore defaults
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
