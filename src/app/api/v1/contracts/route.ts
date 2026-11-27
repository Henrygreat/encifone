import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createContract, listContracts } from "@/modules/contracts/service";
import { createContractSchema, listContractsQuerySchema } from "@/modules/contracts/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listContractsQuerySchema);
    const result = await listContracts(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createContractSchema);
    const contract = await createContract(acting, input);
    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
