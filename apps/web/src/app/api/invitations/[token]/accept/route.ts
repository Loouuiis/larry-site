import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

interface ApiAcceptResponse {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  displayName?: string | null;
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
      `${API_BASE}/v1/orgs/invitations/${encodeURIComponent(token)}/accept`,
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
    | ApiAcceptResponse
    | { error?: string; message?: string };

  // Non-200: pass through untouched — the accept form surfaces the message.
  if (!upstream.ok) {
    return NextResponse.json(responseBody, { status: upstream.status });
  }

  const payload = responseBody as ApiAcceptResponse;
  if (!payload.userId || !payload.tenantId || !payload.accessToken) {
    return NextResponse.json(
      { error: "Invalid response from invitation service." },
      { status: 502 },
    );
  }

  // Mint the iron-session cookie so the invitee lands logged in on /workspace.
  // Mirrors apps/web/src/app/api/auth/login/route.ts:104-115.
  const { token: sessionToken, csrfToken } = await createSessionToken({
    userId: payload.userId,
    email: payload.email,
    tenantId: payload.tenantId,
    role: payload.role,
    displayName: payload.displayName ?? null,
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
  res.cookies.set(csrfCookieOptions(csrfToken));
  return res;
}
