/**
 * Shared API session utilities: token decoding, expiry checks, and refresh.
 * Used by both the standard proxy (workspace-proxy.ts) and the streaming proxy
 * (larry/chat/stream/route.ts) which cannot use proxyApiRequest because it buffers.
 */

import type { AppSession } from "@/lib/auth";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";
import { cookies } from "next/headers";

interface ApiRefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

export function getApiBaseUrl(): string {
  return (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

// ── JWT decode helpers ──────────────────────────────────────────────────────

const REFRESH_BUFFER_SECS = 120;

function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isTokenExpiredOrExpiringSoon(token: string): boolean {
  const exp = decodeJwtExpiry(token);
  if (!exp) return true;
  return exp - Math.floor(Date.now() / 1000) < REFRESH_BUFFER_SECS;
}

// ── Concurrency guard ───────────────────────────────────────────────────────

let activeRefreshPromise: Promise<AppSession | null> | null = null;

export async function refreshApiSession(
  baseUrl: string,
  session: AppSession
): Promise<AppSession | null> {
  if (!session.apiRefreshToken || !session.tenantId) return null;

  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: session.apiRefreshToken,
          tenantId: session.tenantId,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        console.error("[api-session] Token refresh failed:", response.status);
        return null;
      }

      const payload = (await response.json()) as ApiRefreshResponse;
      if (!payload.accessToken) return null;

      return {
        ...session,
        apiAccessToken: payload.accessToken,
        apiRefreshToken: payload.refreshToken ?? session.apiRefreshToken,
        authMode: "api",
      };
    } catch (err) {
      console.error("[api-session] Token refresh error:", err instanceof Error ? err.message : err);
      return null;
    }
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

// ── Persist updated session cookie ──────────────────────────────────────────

export async function persistRefreshedSession(session: AppSession): Promise<void> {
  const { token, csrfToken } = await createSessionToken(session);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
  store.set(csrfCookieOptions(csrfToken));
}
