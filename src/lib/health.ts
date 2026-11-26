import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS)
    ),
  ]);
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<"database" | "redis", "ok" | "error">;
}

/**
 * Bounded dependency checks for readiness — never hangs indefinitely on a
 * stalled connection, and never leaks connection strings/credentials in its
 * result (callers must only ever return this shape, not raw error objects,
 * from a public route).
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = { database: "error", redis: "error" };

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, "database");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await withTimeout(redis.ping(), "redis");
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  return { ready: Object.values(checks).every((status) => status === "ok"), checks };
}
