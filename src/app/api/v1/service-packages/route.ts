import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createServicePackage, listServicePackages } from "@/modules/catalogue/service";
import { createServicePackageSchema, listServicePackagesQuerySchema } from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listServicePackagesQuerySchema);
    const packages = await listServicePackages(acting, query);
    return NextResponse.json(packages);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createServicePackageSchema);
    const pkg = await createServicePackage(acting, input);
    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
