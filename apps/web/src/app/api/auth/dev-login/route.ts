import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

function isDevBypassAllowed(): boolean {
  if (process.env.ALLOW_DEV_AUTH_BYPASS === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function POST() {
  if (!isDevBypassAllowed()) {
    return NextResponse.json({ error: "Dev auth bypass is disabled." }, { status: 403 });
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
