import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { cookies } from "next/headers";

const SALT_ROUNDS = 12;
const SESSION_COOKIE = "larry_session";
const SESSION_DURATION_SECS = 7 * 24 * 60 * 60; // 7 days
const DEV_SESSION_SECRET = "larry-dev-session-secret-change-me-before-production-32+";

export type SessionAuthMode = "api" | "legacy" | "dev";

export interface AppSession {
  userId: string;
  email?: string;
  tenantId?: string;
  role?: string;
  apiAccessToken?: string;
  apiRefreshToken?: string;
  authMode?: SessionAuthMode;
}

interface SessionJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
  tenantId?: string;
  role?: string;
  apiAccessToken?: string;
  apiRefreshToken?: string;
  authMode?: SessionAuthMode;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_SESSION_SECRET);
  }

  throw new Error("SESSION_SECRET env var must be set and at least 32 characters.");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(session: AppSession): Promise<string> {
  const payload: SessionJwtPayload = {
    sub: session.userId,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
    apiAccessToken: session.apiAccessToken,
    apiRefreshToken: session.apiRefreshToken,
    authMode: session.authMode,
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
      apiAccessToken: typeof payload.apiAccessToken === "string" ? payload.apiAccessToken : undefined,
      apiRefreshToken: typeof payload.apiRefreshToken === "string" ? payload.apiRefreshToken : undefined,
      authMode:
        payload.authMode === "api" || payload.authMode === "legacy" || payload.authMode === "dev"
          ? payload.authMode
          : undefined,
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
