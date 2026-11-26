import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health";

/**
 * Kept for backward compatibility (same response shape as before
 * /api/health/live and /api/health/ready existed) — equivalent to
 * /api/health/ready. Prefer the split endpoints for new integrations.
 */
export async function GET() {
  const { ready, checks } = await checkReadiness();
  return NextResponse.json({ status: ready ? "ok" : "degraded", checks }, { status: ready ? 200 : 503 });
}
