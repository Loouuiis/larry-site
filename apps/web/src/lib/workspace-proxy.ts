import { AppSession, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { cookies } from "next/headers";

interface ApiRefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

interface ProxyApiRequestOptions {
  timeoutMs?: number;
}

function getApiBaseUrl(): string {
  return (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

async function parseApiBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return { error: "Invalid JSON response from API." };
    }
  }
  const text = await response.text();
  return text.length > 0 ? { message: text } : {};
}

// ── Proactive token refresh ─────────────────────────────────────────────────
// Decode the JWT payload (without verification — the API will verify) to check
// expiration. If the token expires within REFRESH_BUFFER_SECS, refresh it
// BEFORE sending the request, so we never hit a 401 on the first try.

const REFRESH_BUFFER_SECS = 120; // refresh if token expires within 2 minutes

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

function isTokenExpiredOrExpiringSoon(token: string): boolean {
  const exp = decodeJwtExpiry(token);
  if (!exp) return true; // can't determine — treat as expired to be safe
  return exp - Math.floor(Date.now() / 1000) < REFRESH_BUFFER_SECS;
}

// ── Refresh with concurrency guard ──────────────────────────────────────────
// Prevents multiple concurrent requests from all trying to refresh the token
// at the same time (which would revoke each other's refresh tokens).

let activeRefreshPromise: Promise<AppSession | null> | null = null;

async function refreshApiSession(
  baseUrl: string,
  session: AppSession,
): Promise<AppSession | null> {
  if (!session.apiRefreshToken || !session.tenantId) return null;

  // If a refresh is already in progress, wait for it instead of starting another
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
        console.error("[proxy] Token refresh failed:", response.status);
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
      console.error("[proxy] Token refresh error:", err instanceof Error ? err.message : err);
      return null;
    }
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

// ── Session helpers ─────────────────────────────────────────────────────────

export async function ensureApiSession(session: AppSession): Promise<AppSession | null> {
  if (session.apiAccessToken && session.tenantId) {
    return session;
  }
  return null;
}

export async function persistSession(session: AppSession): Promise<void> {
  const token = await createSessionToken(session);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
}

// ── Main proxy function ─────────────────────────────────────────────────────

export async function proxyApiRequest(
  session: AppSession,
  path: string,
  init: RequestInit = {},
  options: ProxyApiRequestOptions = {},
): Promise<{
  status: number;
  body: unknown;
  session: AppSession | null;
}> {
  const baseUrl = getApiBaseUrl();
  let activeSession: AppSession | null = session;

  if (!activeSession?.apiAccessToken || !activeSession?.tenantId) {
    return {
      status: 401,
      body: { error: "Not authenticated. Please log in." },
      session: null,
    };
  }

  // ── Proactive refresh: if the token is expired or about to expire, refresh
  //    BEFORE making the request so we don't waste time on a guaranteed 401.
  if (isTokenExpiredOrExpiringSoon(activeSession.apiAccessToken!)) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed) {
      activeSession = refreshed;
    }
    // If refresh fails, still try the request — maybe the token isn't actually expired
  }

  const timeoutMs = options.timeoutMs ?? 12_000;
  const perform = async (accessToken: string): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });

  let response: Response;
  try {
    response = await perform(activeSession.apiAccessToken!);
  } catch (error) {
    const message = error instanceof Error ? error.message : "API request failed.";
    return {
      status: 504,
      body: { error: message.includes("abort") ? "Request timed out. Please try again." : message },
      session: activeSession,
    };
  }

  // ── Reactive refresh: if we still got a 401 (token expired between our check
  //    and the request, or proactive refresh failed), try one more refresh + retry.
  if (response.status === 401) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed?.apiAccessToken) {
      activeSession = refreshed;
      try {
        response = await perform(refreshed.apiAccessToken);
      } catch (error) {
        const message = error instanceof Error ? error.message : "API request failed.";
        return {
          status: 504,
          body: { error: message },
          session: activeSession,
        };
      }
    }

    // If still 401 after refresh, the session is truly dead
    if (response.status === 401) {
      return {
        status: 401,
        body: { error: "Your session has expired. Please log in again." },
        session: null,
      };
    }
  }

  let body: unknown;
  try {
    body = await parseApiBody(response);
  } catch {
    body = { error: "Failed to parse API response." };
  }

  return {
    status: response.status,
    body,
    session: activeSession,
  };
}
