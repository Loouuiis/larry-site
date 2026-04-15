import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { proxyApiRequest, persistSession } from "@/lib/workspace-proxy";

interface UpstreamUser {
  id?: string;
  email?: string | null;
  tenantId?: string | null;
  role?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: string | null;
  verificationGraceDeadline?: string | null;
}

interface UpstreamMeResponse {
  user?: UpstreamUser | null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const sessionOnlyUser = {
    id: session.userId,
    email: session.email ?? null,
    tenantId: session.tenantId ?? null,
    role: session.role ?? null,
    displayName: session.displayName ?? null,
    authMode: session.authMode ?? "unknown",
    avatarUrl: null,
    emailVerifiedAt: null,
    verificationGraceDeadline: null,
  };

  // Dev / legacy sessions never have an upstream access token — skip the proxy
  // and serve the session-only shape so dev logins still render user identity.
  if (!session.apiAccessToken || !session.tenantId) {
    return NextResponse.json({ user: sessionOnlyUser });
  }

  // Proxy through to upstream /v1/auth/me so the caller receives the full user
  // shape (avatarUrl, emailVerifiedAt, verificationGraceDeadline, …) that the
  // JWT-backed session cookie doesn't carry.
  const { status, body, session: refreshed } = await proxyApiRequest(session, "/v1/auth/me");

  if (refreshed && refreshed.apiAccessToken !== session.apiAccessToken) {
    await persistSession(refreshed);
  }

  if (status === 401) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (status < 200 || status >= 300) {
    // Upstream unreachable or returned an error — fall back to session-only so
    // the UI still renders initials and basic identity.
    return NextResponse.json({ user: sessionOnlyUser });
  }

  const payload = (body ?? {}) as UpstreamMeResponse;
  const upstreamUser = payload.user ?? null;

  if (!upstreamUser) {
    return NextResponse.json({ user: sessionOnlyUser });
  }

  return NextResponse.json({
    user: {
      id: upstreamUser.id ?? session.userId,
      email: upstreamUser.email ?? session.email ?? null,
      tenantId: upstreamUser.tenantId ?? session.tenantId ?? null,
      role: upstreamUser.role ?? session.role ?? null,
      displayName: upstreamUser.displayName ?? session.displayName ?? null,
      avatarUrl: upstreamUser.avatarUrl ?? null,
      emailVerifiedAt: upstreamUser.emailVerifiedAt ?? null,
      verificationGraceDeadline: upstreamUser.verificationGraceDeadline ?? null,
      authMode: session.authMode ?? "unknown",
    },
  });
}
