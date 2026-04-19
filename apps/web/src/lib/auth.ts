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

export const CSRF_COOKIE = "larry_csrf";

export async function createSessionToken(
  session: AppSession,
): Promise<{ token: string; csrfToken: string }> {
  const csrfToken = session.csrfToken ?? randomUUID();
  const payload: SessionJwtPayload = {
    sub: session.userId,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
    displayName: session.displayName ?? null,
    apiAccessToken: session.apiAccessToken,
    apiRefreshToken: session.apiRefreshToken,
    authMode: session.authMode,
    csrfToken,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECS}s`)
    .sign(getSecret());

  return { token, csrfToken };
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

// Readable (non-httpOnly) CSRF double-submit cookie. Paired with the
// session cookie wherever a session is minted/rotated so the client
// window.fetch patch can echo it back as X-CSRF-Token on mutating
// /api/** requests (validated by middleware apiMiddleware).
export function csrfCookieOptions(csrfToken: string) {
  return {
    name: CSRF_COOKIE,
    value: csrfToken,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_DURATION_SECS,
    path: "/",
  };
}

// P2-3: persistent device identifier. The browser never reads or writes
// this — it's httpOnly so an XSS on a legitimate session can't lift it,
// and the server uses it as a hint for new-device email alerts rather
// than an auth credential. 30 days matches our "recent session" window
// on the API side. Rotates on the server side only if the user clears
// cookies; legitimate OS / UA upgrades don't churn it.
export const DEVICE_COOKIE = "larry_device_id";
const DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function deviceCookieOptions(deviceId: string) {
  return {
    name: DEVICE_COOKIE,
    value: deviceId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: DEVICE_COOKIE_MAX_AGE,
    path: "/",
  };
}
