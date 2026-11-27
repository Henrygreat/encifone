import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { ForbiddenError } from "@/core/permissions";
import { NoActiveOrganisationError, UnauthenticatedError } from "@/core/tenancy";
import { RateLimitError } from "@/lib/rate-limit";

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}

/** Same validation contract as `parseJsonBody`, for GET list/search endpoints
 * whose input is query-string parameters rather than a JSON body. */
export function parseQuery<T>(request: Request, schema: ZodSchema<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}

export class ValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super("Invalid request body.");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** Shared "record not found (or not visible to this tenant)" error — a module
 * never needs its own copy; using one class keeps the 404 mapping in one place. */
export class NotFoundError extends Error {
  constructor(message = "The requested record was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Maps known domain errors to the right HTTP status instead of a blanket 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError || error instanceof NoActiveOrganisationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
    );
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 400 });
}
