import { invoiceCheckoutAvailable } from "@/modules/finance/invoice-checkout";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFinanceMoney } from "@/lib/finance-money";
import { NotFoundError } from "@/lib/api";
import { invoiceDocumentData } from "@/modules/finance/document-settings";
import { getPublicInvoice } from "@/modules/finance/invoice-sharing";

export const metadata: Metadata = {
  title: "Online invoice",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function OnlineInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const data = await invoiceDocumentData(invoice, invoice);
  const payOnline =
    invoice.balanceDueMinor > 0 &&
    (await invoiceCheckoutAvailable(invoice.organisationId));
  const checkoutError = (await searchParams).checkout === "unavailable";
  const money = (minor: number) => formatFinanceMoney(minor, data.currency);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Invoice {data.reference}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              {data.logoBase64 && (
                <Image
                  alt=""
                  src={`data:image/${data.logoBase64.startsWith("/9j/") ? "jpeg" : "png"};base64,${data.logoBase64}`}
                  width={180}
                  height={72}
                  className="mb-3 object-contain object-left"
                  unoptimized
                />
              )}
              {data.seller.filter(Boolean).map((line, index) => (
                <p className="whitespace-pre-wrap break-words" key={index}>
                  {line}
                </p>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              <p>{data.status.toLowerCase()}</p>
              {data.details.map(({ label, value }) => (
                <p key={label}>
                  {label} · {value}
                </p>
              ))}
            </div>
          </div>
          <div className="divide-y border-y">
            {data.lines.map((line, index) => (
              <div
                key={index}
                className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="break-words">{line.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {line.quantity} × {money(line.unitPriceMinor)} ·{" "}
                    {line.taxRateBps / 100}% tax
                    {line.discountMinor
                      ? ` · ${money(line.discountMinor)} discount`
                      : ""}
                  </p>
                </div>
                <p className="font-medium">{money(line.lineTotalMinor)}</p>
              </div>
            ))}
          </div>
          <dl className="space-y-1 sm:ml-auto sm:max-w-xs">
            {data.summary.map(({ label, minor }) => (
              <div key={label} className="flex justify-between gap-3">
                <dt>{label}</dt>
                <dd className="shrink-0 font-medium">{money(minor)}</dd>
              </div>
            ))}
          </dl>
          {data.notes.filter(Boolean).map((line, index) => (
            <p className="whitespace-pre-wrap break-words text-sm" key={index}>
              {line}
            </p>
          ))}
          <Button asChild variant="outline">
            <a href={`/online-invoice/${token}/pdf`}>Download PDF</a>
          </Button>
          {payOnline && (
            <form method="post" action={`/online-invoice/${token}/checkout`}>
              <Button type="submit">Pay Now with card</Button>
            </form>
          )}
          {checkoutError && (
            <p role="alert" className="text-sm text-destructive">
              Checkout is unavailable. Try again or contact the business.
            </p>
          )}
          {data.footer && (
            <p className="border-t pt-3 text-sm text-muted-foreground">
              {data.footer}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
