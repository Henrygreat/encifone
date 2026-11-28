import { describe, expect, it } from "vitest";
import { documentTemplates, renderFinancialDocument } from "@/modules/finance/document-renderer";

describe("financial document layouts", () => {
  it.each(documentTemplates)("renders selectable text, embedded fonts and multiple pages in %s", async (template) => {
    const pdf = await renderFinancialDocument({
      title: "Invoice", seller: ["Example business"], customer: ["Example customer"],
      template, currency: "GBP", details: [],
      onlineUrl: "https://example.test/online-invoice/token",
      payOnline: true, paymentQr: true,
      lines: Array.from({ length: 85 }, (_, index) => ({
        description: `Consulting line ${index + 1} with a detailed description that needs to wrap`,
        quantity: 1, unitPriceMinor: 1000, discountMinor: 0, taxRateBps: 0, lineTotalMinor: 1000,
      })),
      summary: [{ label: "Total", minor: 85_000 }],
    });
    const content = pdf.toString("latin1");
    expect(content).toMatch(/^%PDF-/);
    expect(content).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(content).toMatch(/\/FontFile[23]/);
    expect(content.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
    expect(content).toContain("/Subtype /Link");
    expect(content).toContain("/Subtype /Image");
  });
});
