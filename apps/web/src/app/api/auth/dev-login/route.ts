import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  // Hard-block in production — no env var can override this.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = process.env.DEV_BYPASS_USER_ID || "00000000-0000-4000-8000-000000000001";
  const token = await createSessionToken({
    userId,
    tenantId: process.env.LARRY_API_TENANT_ID,
    authMode: "dev",
  });

  const response = NextResponse.json({ success: true, userId });
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
