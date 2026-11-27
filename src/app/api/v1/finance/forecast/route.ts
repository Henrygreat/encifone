import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseQuery } from "@/lib/api";
import { getFinancialForecast } from "@/modules/finance/service";
import { financeForecastQuerySchema } from "@/modules/finance/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, financeForecastQuerySchema);
    const forecast = await getFinancialForecast(acting, query);
    return NextResponse.json(forecast);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
