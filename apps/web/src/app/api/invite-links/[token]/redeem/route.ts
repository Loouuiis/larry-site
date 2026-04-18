import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

interface ApiRedeemResponse {
  userId: string;
  tenantId: string;
  accessToken: string;
  refreshToken?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_BASE}/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}/redeem`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body || "{}",
      },
    );
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  const responseBody = (await upstream.json().catch(() => ({}))) as
    | ApiRedeemResponse
    | { error?: string; message?: string };

  if (!upstream.ok) {
    return NextResponse.json(responseBody, { status: upstream.status });
  }

  const payload = responseBody as ApiRedeemResponse;
  if (!payload.userId || !payload.tenantId || !payload.accessToken) {
    return NextResponse.json(
      { error: "Invalid response from invite-link service." },
      { status: 502 },
    );
  }

  // Parse the email out of the original request body so we can seed the
  // session with a friendly label; fallback to undefined if absent.
  let email: string | undefined;
  try {
    const parsed = JSON.parse(body || "{}") as { email?: string };
    email = typeof parsed.email === "string" ? parsed.email : undefined;
  } catch {
    email = undefined;
  }

  const sessionToken = await createSessionToken({
    userId: payload.userId,
    email,
    tenantId: payload.tenantId,
    apiAccessToken: payload.accessToken,
    apiRefreshToken: payload.refreshToken,
    authMode: "api",
  });

  const res = NextResponse.json({
    ok: true,
    userId: payload.userId,
    tenantId: payload.tenantId,
  });
  res.cookies.set(sessionCookieOptions(sessionToken));
  return res;
}
