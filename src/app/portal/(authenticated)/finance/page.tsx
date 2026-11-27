import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatFinanceMoney } from "@/lib/finance-money";
import { getPortalRetainers, getPortalSubscriptions, listPortalEstimates, listPortalInvoices } from "@/modules/finance/service";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { EstimateAcceptance } from "./estimate-acceptance";

export default async function PortalFinancePage() {
  const { organisationId, clientId } = await requireActivePortalSession();
  const [invoices, estimates, subscriptions, retainers] = await Promise.all([
    listPortalInvoices(organisationId, clientId),
    listPortalEstimates(organisationId, clientId),
    getPortalSubscriptions(organisationId, clientId),
    getPortalRetainers(organisationId, clientId),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Finance</h1>
      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!invoices.length && <p className="text-sm text-muted-foreground">No issued invoices.</p>}
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p>Invoice {invoice.invoiceNumber} · {invoice.status.replaceAll("_", " ").toLowerCase()}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFinanceMoney(invoice.totalMinor, invoice.currency)} total · {formatFinanceMoney(invoice.balanceDueMinor, invoice.currency)} due
                </p>
              </div>
              <Button asChild variant="outline"><a href={`/api/portal/finance/invoices/${invoice.id}/pdf`}>Download PDF</a></Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Estimates</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!estimates.length && <p className="text-sm text-muted-foreground">No shared estimates.</p>}
          {estimates.map((estimate) => (
            <div key={estimate.id} className="space-y-2">
              <p className="break-words">{estimate.title} · {estimate.status.toLowerCase()}</p>
              <p className="text-sm text-muted-foreground">{formatFinanceMoney(estimate.versions[0]?.totalMinor, estimate.currency)}</p>
              {estimate.versions[0]?.lines.map((line, index) => (
                <p key={index} className="break-words text-sm">{line.quantity} × {line.description} · {formatFinanceMoney(line.lineTotalMinor, estimate.currency)}</p>
              ))}
              {estimate.status === "SENT" && [estimate.validUntil, estimate.expiresAt].every((date) => !date || date >= new Date()) && (
                <EstimateAcceptance id={estimate.id} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Subscriptions and retainers</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!subscriptions.length && !retainers.length && <p className="text-muted-foreground">No subscriptions or retainers.</p>}
          {subscriptions.map((item) => (
            <p key={item.id} className="break-words">{item.title} · {formatFinanceMoney(item.amountMinor, item.currency)} · {item.billingInterval.toLowerCase()} × {item.intervalCount} · {item.status.toLowerCase()}</p>
          ))}
          {retainers.map((item) => (
            <p key={item.id} className="break-words">{item.title} · {item.usedMinutes} minutes used · {item.status.toLowerCase()}</p>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
