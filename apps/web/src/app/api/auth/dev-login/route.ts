import { NextResponse } from "next/server";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
  AppSession,
} from "@/lib/auth";

const allowed = process.env.ALLOW_DEV_AUTH_BYPASS === "true";

if (allowed) {
  console.warn("⚠️ Dev auth bypass is ENABLED — do not run this in production.");
}


// Attempt a real API login so the session carries a valid access token.
// This prevents workspace-proxy from hammering /v1/auth/login on every request.
async function tryApiLogin(): Promise<AppSession | null> {
  const baseUrl = process.env.LARRY_API_BASE_URL?.replace(/\/+$/, "");
  const tenantId = process.env.LARRY_API_TENANT_ID;
  const email = process.env.LARRY_API_EMAIL;
  const password = process.env.LARRY_API_PASSWORD;

  if (!baseUrl || !tenantId || !email || !password) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const payload = await res.json() as {
      accessToken: string;
      refreshToken?: string;
      user: { id: string; email: string; tenantId: string; role: string };
    };
    if (!payload?.accessToken || !payload?.user?.id) return null;

    return {
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
    };
  } catch {
    return null;
  }
}

export async function POST() {

  if (!allowed) {        
    return new NextResponse(null, { status: 404 });
  }

  // Try a real API login first so workspace routes have a valid token.
  // Falls back to a bare dev session if the API isn't reachable or not seeded yet.
  const apiSession = await tryApiLogin();

  const session: AppSession = apiSession ?? {
    userId: process.env.DEV_BYPASS_USER_ID || "00000000-0000-4000-8000-000000000001",
    tenantId: process.env.LARRY_API_TENANT_ID,
    authMode: "dev",
  };

  const { token, csrfToken } = await createSessionToken(session);
  const response = NextResponse.json({ success: true, userId: session.userId });
  response.cookies.set(sessionCookieOptions(token));
  response.cookies.set(csrfCookieOptions(csrfToken));
  return response;
}
