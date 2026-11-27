import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { updateExpense } from "@/modules/finance/service";
import { updateExpenseSchema } from "@/modules/finance/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateExpenseSchema);
    const expense = await updateExpense(acting, id, input);
    return NextResponse.json(expense);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
