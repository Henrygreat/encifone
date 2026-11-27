import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { errorResponse } from "@/lib/api";

export function financeErrorResponse(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return NextResponse.json({ error: "Finance record not found." }, { status: 404 });
    if (error.code === "P2002") return NextResponse.json({ error: "A finance record already uses this reference." }, { status: 409 });
    return NextResponse.json({ error: "The finance operation could not be completed." }, { status: 500 });
  }
  if (error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      error instanceof Prisma.PrismaClientValidationError ||
      error instanceof Prisma.PrismaClientRustPanicError) {
    return NextResponse.json({ error: "The finance operation could not be completed." }, { status: 500 });
  }
  return errorResponse(error);
}
