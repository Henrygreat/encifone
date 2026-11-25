import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { ForbiddenError } from "@/core/permissions";
import { NoActiveOrganisationError, UnauthenticatedError } from "@/core/tenancy";

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  const result = schema.safeParse(body);
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
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 400 });
}
