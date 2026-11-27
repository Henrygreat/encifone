import { describe, expect, it } from "vitest";
import { calculateLeadScore } from "@/modules/intelligence/lead-scoring";

const BASE = {
  email: null,
  phone: null,
  companyName: null,
  source: null,
  priority: "MEDIUM" as const,
  estimatedValueMinor: null,
  nextFollowUpAt: null,
  createdAt: new Date(),
};

describe("calculateLeadScore", () => {
  it("scores a bare-minimum lead low, with no unearned factors", () => {
    const { score, factors } = calculateLeadScore({ ...BASE, priority: "LOW" as never });
    // Only "created within the last 7 days" should fire.
    expect(factors.length).toBe(1);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(20);
  });

  it("scores higher for a well-qualified, high-value-source lead", () => {
    const sparse = calculateLeadScore(BASE);
    const rich = calculateLeadScore({
      ...BASE,
      email: "lead@example.com",
      phone: "+441234567890",
      companyName: "Acme Ltd",
      source: "Referral",
      priority: "HIGH" as never,
      estimatedValueMinor: 500000,
      nextFollowUpAt: new Date(),
    });
    expect(rich.score).toBeGreaterThan(sparse.score);
  });

  it("caps the score at 100 even if every factor fires", () => {
    const { score } = calculateLeadScore({
      email: "a@b.com",
      phone: "123",
      companyName: "Acme",
      source: "Referral",
      priority: "HIGH" as never,
      estimatedValueMinor: 100,
      nextFollowUpAt: new Date(),
      createdAt: new Date(),
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it("never includes a protected characteristic as a factor label", () => {
    const { factors } = calculateLeadScore({
      ...BASE,
      email: "a@b.com",
      companyName: "Acme",
    });
    const joined = factors.map((f) => f.label.toLowerCase()).join(" ");
    expect(joined).not.toMatch(/gender|ethnic|race|religion|age\b/);
  });

  it("is deterministic — same input always produces the same output", () => {
    const input = { ...BASE, email: "a@b.com", source: "Website form" };
    const first = calculateLeadScore(input);
    const second = calculateLeadScore(input);
    expect(first).toEqual(second);
  });
});
