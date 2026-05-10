import { EncryptJWT, SignJWT, jwtDecrypt, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getSessionSecret } from "./session-secret";
import {
  API_TOKENS_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearApiTokensCookieOptions,
  clearLarryCsrfCookieLegacyOptions,
  clearSessionCookieOptions,
} from "./session-cookie-flags";

const SESSION_DURATION_SECS = 24 * 60 * 60; // 24 hours — sliding refresh handled in middleware
export const API_TOKENS_COOKIE = API_TOKENS_COOKIE_NAME;
const API_TOKENS_COOKIE_DURATION_SECS = 30 * 24 * 60 * 60; // 30 days, bounded by the signed session cookie

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
}

interface SessionJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
  tenantId?: string;
  role?: string;
  displayName?: string | null;
  authMode?: SessionAuthMode;
}

interface ApiTokensPayload extends JWTPayload {
  accessToken?: string;
  refreshToken?: string;
  tenantId?: string;
}

const getSecret = getSessionSecret;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getApiTokenEncryptionKey(): Uint8Array {
  return new Uint8Array(createHash("sha256").update(getSecret()).digest());
}

export async function createSessionToken(session: AppSession): Promise<{ token: string }> {
  const payload: SessionJwtPayload = {
    sub: session.userId,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
    displayName: session.displayName ?? null,
    authMode: session.authMode,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECS}s`)
    .sign(getSecret());

  return { token };
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
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
      authMode:
        payload.authMode === "api" || payload.authMode === "legacy" || payload.authMode === "dev"
          ? payload.authMode
          : undefined,
    };
  } catch {
    return null;
  }
}

async function decryptApiTokensCookie(value: string): Promise<Partial<AppSession> | null> {
  try {
    const { payload } = await jwtDecrypt(value, getApiTokenEncryptionKey());
    const tokenPayload = payload as ApiTokensPayload;
    return {
      userId: typeof tokenPayload.sub === "string" ? tokenPayload.sub : undefined,
      tenantId: typeof tokenPayload.tenantId === "string" ? tokenPayload.tenantId : undefined,
      apiAccessToken:
        typeof tokenPayload.accessToken === "string" ? tokenPayload.accessToken : undefined,
      apiRefreshToken:
        typeof tokenPayload.refreshToken === "string" ? tokenPayload.refreshToken : undefined,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const apiTokensCookie = cookieStore.get(API_TOKENS_COOKIE_NAME)?.value;
  if (!apiTokensCookie) return session;

  const apiTokens = await decryptApiTokensCookie(apiTokensCookie);
  if (!apiTokens) return session;
  if (apiTokens.userId && apiTokens.userId !== session.userId) return session;
  if (apiTokens.tenantId && session.tenantId && apiTokens.tenantId !== session.tenantId) {
    return session;
  }

  return {
    ...session,
    tenantId: session.tenantId ?? apiTokens.tenantId,
    apiAccessToken: apiTokens.apiAccessToken,
    apiRefreshToken: apiTokens.apiRefreshToken,
  };
}

/** Clears web session cookies when upstream API credentials are invalid (mirror of logout clearing). */
export async function clearWebSessionCookies(): Promise<void> {
  const store = await cookies();
  store.set(clearSessionCookieOptions());
  store.set(clearApiTokensCookieOptions());
  store.set(clearLarryCsrfCookieLegacyOptions());
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_DURATION_SECS,
    path: "/",
  };
}

/** Re-export for route handlers — definitions live in session-cookie-flags (Edge-safe). */
export {
  clearApiTokensCookieOptions,
  clearLarryCsrfCookieLegacyOptions,
  clearSessionCookieOptions,
} from "./session-cookie-flags";

export async function apiTokensCookieOptions(session: AppSession) {
  const value = await new EncryptJWT({
    accessToken: session.apiAccessToken,
    refreshToken: session.apiRefreshToken,
    tenantId: session.tenantId,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${API_TOKENS_COOKIE_DURATION_SECS}s`)
    .encrypt(getApiTokenEncryptionKey());

  return {
    name: API_TOKENS_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: API_TOKENS_COOKIE_DURATION_SECS,
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
