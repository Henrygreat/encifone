"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { FinanceAction, FinanceDocumentForm, InvoicePaymentForm } from "@/components/finance/document-actions";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InvoiceRow {
  id: string;
  invoiceNumber: number | null;
  status: string;
  currency: string;
  totalMinor: number;
  balanceDueMinor: number;
}

export function FinanceList({ canManage }: { canManage: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<{ items: InvoiceRow[] }> => {
      const res = await fetch("/api/v1/invoices");
      if (!res.ok) throw new Error("Could not load invoices.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Invoices" description="Track issued invoices, balances, overdue status, and payment allocations." />
      {canManage && <FinanceDocumentForm kind="invoices" />}
      {isPending && <p role="status">Loading invoices?</p>}
      {isError && <p role="alert">Could not load invoices.</p>}
      {data?.items.length === 0 && <p className="text-muted-foreground">No invoices yet.</p>}
      <div className="grid gap-3">
        {(data?.items ?? []).map((invoice) => (
          <Card key={invoice.id}>
            <CardHeader>
              <CardTitle>Invoice {invoice.invoiceNumber ?? "DRAFT"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {invoice.status.replaceAll("_", " ")} • Total {money(invoice.totalMinor, invoice.currency)} • Balance {money(invoice.balanceDueMinor, invoice.currency)}
              <div className="mt-3 flex flex-wrap gap-2">
                {canManage && invoice.status === "DRAFT" && <>
                  <FinanceAction endpoint={`/api/v1/invoices/${invoice.id}/finalise`} label="Finalise" queryKey="invoices" />
                  <FinanceAction endpoint={`/api/v1/invoices/${invoice.id}`} method="DELETE" label="Archive" queryKey="invoices" />
                </>}
                <a className="text-foreground underline" href={`/api/v1/invoices/${invoice.id}/pdf`}>Download PDF</a>
              </div>
              {canManage && ["FINALISED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) && invoice.balanceDueMinor > 0 && (
                <InvoicePaymentForm id={invoice.id} currency={invoice.currency} balance={invoice.balanceDueMinor} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
