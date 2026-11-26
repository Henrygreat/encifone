import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health";

/**
 * Readiness: can this instance actually serve real requests right now?
 * Checks Postgres and Redis with a bounded timeout (src/lib/health.ts).
 * Used by Docker's own HEALTHCHECK (Dockerfile) and should be what
 * Coolify/Traefik treat as "this container may receive traffic."
 */
export async function GET() {
  const { ready, checks } = await checkReadiness();
  return NextResponse.json({ status: ready ? "ok" : "degraded", checks }, { status: ready ? 200 : 503 });
}
