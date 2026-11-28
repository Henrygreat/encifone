import { requireActiveMembership } from "@/core/tenancy";
import { financeErrorResponse } from "@/modules/finance/http";
import { getFinancialDocumentSettings } from "@/modules/finance/document-settings";
import { renderFinancialDocument } from "@/modules/finance/document-renderer";

export async function GET(request: Request) {
  try {
    const { organisationName, settings } = await getFinancialDocumentSettings(await requireActiveMembership());
    const pdf = await renderFinancialDocument({
      ...settings,
      notes: settings.notes ? [settings.notes] : undefined,
      logo: settings.logoBase64 ? Buffer.from(settings.logoBase64, "base64") : undefined,
      title: "Sample invoice",
      sample: true,
      reference: "PREVIEW",
      seller: [settings.legalName || organisationName, settings.address ?? "", settings.email ?? ""],
      customer: ["Example customer"],
      currency: "GBP",
      details: [{ label: "Purpose", value: "Template preview only" }],
      lines: [{ description: "Example consulting service", quantity: 2, unitPriceMinor: 7500, discountMinor: 0, taxRateBps: 0, lineTotalMinor: 15000 }],
      summary: [{ label: "Sample total", minor: 15000 }],
    });
    const disposition = new URL(request.url).searchParams.get("preview") === "true" ? "inline" : "attachment";
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename=sample-invoice.pdf`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
