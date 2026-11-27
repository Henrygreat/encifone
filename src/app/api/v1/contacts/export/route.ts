import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { exportContactsCsv } from "@/modules/crm/service";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const csv = await exportContactsCsv(acting);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-export.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
