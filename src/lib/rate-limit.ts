import { redis } from "@/lib/redis";

/**
 * A Redis fixed-window counter — docs/SECURITY.md's committed "Redis
 * token bucket" approach for auth/public-form/API throttling, built here
 * for the first time against the endpoints that actually need it this
 * session: the unauthenticated public contract/proposal sign endpoints
 * (abuse/availability risk — no session to already gate them) and the
 * AI-powered endpoints (each call costs real provider spend).
 *
 * Fails OPEN, not closed: if Redis itself is unreachable, the request is
 * allowed through rather than the app returning 500s for every request
 * because a non-critical dependency hiccupped — logged, not thrown.
 */
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number, message = "Too many requests. Please try again shortly.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    if (count > limit) {
      const ttl = await redis.ttl(redisKey);
      throw new RateLimitError(ttl > 0 ? ttl : windowSeconds);
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    // Redis unreachable or another transient error — never let a
    // rate-limiter outage take down an otherwise-healthy endpoint.
    console.error("Rate limit check failed open:", error instanceof Error ? error.message : error);
  }
}

/** The caller's best available identity for rate-limiting purposes —
 * prefer the authenticated user/org, fall back to IP for unauthenticated
 * public endpoints. Never the request body (which is untrusted input). */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
