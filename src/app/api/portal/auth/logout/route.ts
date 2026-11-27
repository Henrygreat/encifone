import { NextResponse } from "next/server";
import { destroyPortalSession } from "@/modules/portal/auth";
import { errorResponse } from "@/lib/api";

export async function POST() {
  try {
    await destroyPortalSession();
    return NextResponse.json({ loggedOut: true });
  } catch (error) {
    return errorResponse(error);
  }
}
