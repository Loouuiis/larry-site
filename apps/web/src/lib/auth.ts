import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getSessionSecret } from "./session-secret";

const SESSION_COOKIE = "larry_session";
const SESSION_DURATION_SECS = 24 * 60 * 60; // 24 hours — sliding refresh handled in middleware

export type SessionAuthMode = "api" | "legacy" | "dev";

export interface AppSession {
  userId: string;
  email?: string;
  tenantId?: string;
  role?: string;
  // U-2: stashed at login so the workspace layout can render correct
  // avatar initials without waiting on /v1/auth/me — the 5s-timeout
  // fetch there raced and produced "LA" (email prefix) on slow loads.
  displayName?: string | null;
  apiAccessToken?: string;
  apiRefreshToken?: string;
  authMode?: SessionAuthMode;
  csrfToken?: string;
}

interface SessionJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
  tenantId?: string;
  role?: string;
  displayName?: string | null;
  apiAccessToken?: string;
  apiRefreshToken?: string;
  authMode?: SessionAuthMode;
  csrfToken?: string;
}

const getSecret = getSessionSecret;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createSessionToken(session: AppSession): Promise<string> {
  const payload: SessionJwtPayload = {
    sub: session.userId,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
    displayName: session.displayName ?? null,
    apiAccessToken: session.apiAccessToken,
    apiRefreshToken: session.apiRefreshToken,
    authMode: session.authMode,
    csrfToken: session.csrfToken ?? randomUUID(),
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<AppSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      userId: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      displayName:
        typeof payload.displayName === "string"
          ? payload.displayName
          : payload.displayName === null
            ? null
            : undefined,
      apiAccessToken: typeof payload.apiAccessToken === "string" ? payload.apiAccessToken : undefined,
      apiRefreshToken: typeof payload.apiRefreshToken === "string" ? payload.apiRefreshToken : undefined,
      authMode:
        payload.authMode === "api" || payload.authMode === "legacy" || payload.authMode === "dev"
          ? payload.authMode
          : undefined,
      csrfToken: typeof payload.csrfToken === "string" ? payload.csrfToken : undefined,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_DURATION_SECS,
    path: "/",
  };
}

export function clearSessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}
