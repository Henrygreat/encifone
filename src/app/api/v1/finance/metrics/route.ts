import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getFinancialMetrics, listFinancialAudit } from "@/modules/finance/service";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const [metrics, audit] = await Promise.all([getFinancialMetrics(acting), listFinancialAudit(acting)]);
    return NextResponse.json({ ...metrics, audit });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
