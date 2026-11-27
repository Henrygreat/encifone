"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { FinanceAction } from "@/components/finance/document-actions";
import { FinanceFields } from "@/components/finance/finance-fields";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExpenseRow {
  id: string;
  category: string;
  supplierName: string | null;
  status: string;
  amountMinor: number;
  currency: string;
}

export function FinanceList({ canManage }: { canManage: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<{ items: ExpenseRow[] }> => {
      const res = await fetch("/api/v1/expenses");
      if (!res.ok) throw new Error("Could not load expenses.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Expenses" description="Capture supplier costs with approval and reimbursement tracking." />
      {canManage && <FinanceFields label="New expense" endpoint="/api/v1/expenses" queryKey="expenses" fields={[{ name: "category", label: "Category" }, { name: "supplierName", label: "Supplier", optional: true }, { name: "amountMinor", label: "Amount (minor units)", type: "number" }, { name: "currency", label: "Currency", optional: true }, { name: "expenseDate", label: "Expense date", type: "date" }]} />}
      {isPending && <p role="status">Loading expenses?</p>}
      {isError && <p role="alert">Could not load expenses.</p>}
      {data?.items.length === 0 && <p className="text-muted-foreground">No expenses yet.</p>}
      <div className="grid gap-3">
        {(data?.items ?? []).map((expense) => (
          <Card key={expense.id}>
            <CardHeader>
              <CardTitle>{expense.category}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {expense.supplierName ?? "Unknown supplier"} • {expense.status} • {money(expense.amountMinor, expense.currency)}
              {canManage && <div className="mt-3 flex flex-wrap gap-2">
                 {expense.status === "SUBMITTED" && <>
                   <FinanceAction endpoint={`/api/v1/expenses/${expense.id}`} method="PATCH" label="Approve" queryKey="expenses" payload={{ status: "APPROVED" }} />
                   <FinanceAction endpoint={`/api/v1/expenses/${expense.id}`} method="PATCH" label="Reject" queryKey="expenses" payload={{ status: "REJECTED" }} />
                 </>}
                 {expense.status === "APPROVED" && <FinanceAction endpoint={`/api/v1/expenses/${expense.id}`} method="PATCH" label="Mark reimbursed" queryKey="expenses" payload={{ status: "REIMBURSED" }} />}
               </div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
