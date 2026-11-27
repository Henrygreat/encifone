import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { createExpense, listExpenses } from "@/modules/finance/service";
import { createExpenseSchema, listExpensesQuerySchema } from "@/modules/finance/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listExpensesQuerySchema);
    const result = await listExpenses(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createExpenseSchema);
    const expense = await createExpense(acting, input);
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
