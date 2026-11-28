import Link from "next/link";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatFinanceMoney } from "@/lib/finance-money";
import { listFinancePayments } from "@/modules/finance/service";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.FINANCE_VIEW)) {
    return <div className="p-6"><PageHeader title="Payments" description="Finance access is required to view payments." /></div>;
  }
  const requested = Number((await searchParams).page);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 10_000 ? requested : 1;
  const { items, totalPages } = await listFinancePayments(acting, page);
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Payments" description="Review recorded payments, invoice allocations and CRM deposits." />
      <Button asChild variant="outline" className="self-start"><Link href="/invoices">Open invoices to reconcile payments</Link></Button>
      {!items.length && <p className="text-sm text-muted-foreground">No payments on this page.</p>}
      <div className="grid gap-3">
        {items.map((payment) => (
          <Card key={payment.id}>
            <CardHeader><CardTitle>{formatFinanceMoney(payment.amountMinor, payment.currency)}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{payment.status.toLowerCase()} · {payment.method.replaceAll("_", " ").toLowerCase()} · {(payment.receivedAt ?? payment.createdAt).toISOString().slice(0, 10)}</p>
              {payment.externalReference && <p className="break-all">Reference {payment.externalReference}</p>}
              {payment.refundedMinor > 0 && <p>{formatFinanceMoney(payment.refundedMinor, payment.currency)} refunded</p>}
              {payment.opportunity && <p className="break-words">CRM deposit · {payment.opportunity.name}</p>}
              {payment.allocations.map(({ id, invoice, amountMinor }) => (
                <p key={id}>Invoice {invoice.invoiceNumber} · {formatFinanceMoney(amountMinor, payment.currency)} allocated</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {page > 1 && <Button asChild variant="outline"><Link href={`/payments?page=${page - 1}`}>Previous</Link></Button>}
        {page < totalPages && <Button asChild variant="outline"><Link href={`/payments?page=${page + 1}`}>Next</Link></Button>}
      </div>
    </div>
  );
}
