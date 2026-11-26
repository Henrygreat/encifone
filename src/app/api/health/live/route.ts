import { NextResponse } from "next/server";

/**
 * Liveness: is the Node process itself up and able to handle a request at
 * all? No dependency checks — a slow/unreachable database must never make
 * the orchestrator think the process itself is dead and kill it. Use
 * /api/health/ready for dependency checks.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
