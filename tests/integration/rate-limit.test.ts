import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

const createdKeys: string[] = [];

function uniqueKey(prefix: string) {
  const key = `${prefix}-${randomUUID()}`;
  createdKeys.push(`ratelimit:${key}`);
  return key;
}

afterAll(async () => {
  if (createdKeys.length > 0) {
    await redis.del(...createdKeys);
  }
});

describe("checkRateLimit", () => {
  it("allows up to the configured limit, then rejects the next request", async () => {
    const key = uniqueKey("boundary");
    for (let i = 0; i < 5; i++) {
      await expect(checkRateLimit(key, 5, 60)).resolves.toBeUndefined();
    }
    await expect(checkRateLimit(key, 5, 60)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("isolates independent keys from each other", async () => {
    const keyA = uniqueKey("isolation-a");
    const keyB = uniqueKey("isolation-b");
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(keyA, 3, 60);
    }
    await expect(checkRateLimit(keyA, 3, 60)).rejects.toBeInstanceOf(RateLimitError);
    // A different key's budget is untouched by keyA's exhaustion.
    await expect(checkRateLimit(keyB, 3, 60)).resolves.toBeUndefined();
  });

  it("resets after the window expires", async () => {
    const key = uniqueKey("window-reset");
    await checkRateLimit(key, 1, 1); // 1-second window
    await expect(checkRateLimit(key, 1, 1)).rejects.toBeInstanceOf(RateLimitError);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(checkRateLimit(key, 1, 1)).resolves.toBeUndefined();
  });

  it("reports a positive retryAfterSeconds on rejection", async () => {
    const key = uniqueKey("retry-after");
    await checkRateLimit(key, 1, 30);
    try {
      await checkRateLimit(key, 1, 30);
      expect.unreachable("Expected checkRateLimit to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
