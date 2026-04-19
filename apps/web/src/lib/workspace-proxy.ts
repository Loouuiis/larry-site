import type { AppSession } from "@/lib/auth";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";
import { cookies } from "next/headers";
import {
  getApiBaseUrl,
  isTokenExpiredOrExpiringSoon,
  refreshApiSession,
} from "@/lib/api-session";

interface ProxyApiRequestOptions {
  timeoutMs?: number;
}

async function parseApiBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { error: "Invalid JSON response from API." };
    }
    // Fastify error responses look like:
    //   { statusCode, error: "Forbidden", message: "You don't have permission ..." }
    // Historically most UI call sites read `error` verbatim and display it, so
    // they would surface the bare HTTP reason phrase ("Forbidden", "Not Found")
    // instead of the human sentence. Swap in the message so every existing
    // caller renders readable text without having to update 29 call sites.
    if (!response.ok && json && typeof json === "object") {
      const j = json as { error?: unknown; message?: unknown };
      if (typeof j.message === "string" && j.message.trim().length > 0) {
        return { ...json, error: j.message };
      }
    }
    return json;
  }
  // Non-JSON response (e.g. Railway HTML error page). Return a generic message
  // instead of leaking raw infrastructure text into the UI.
  return response.ok ? {} : { error: "Service temporarily unavailable. Please try again." };
}

// ── Session helpers ─────────────────────────────────────────────────────────

export async function ensureApiSession(session: AppSession): Promise<AppSession | null> {
  if (session.apiAccessToken && session.tenantId) {
    return session;
  }
  return null;
}

export async function persistSession(session: AppSession): Promise<void> {
  // Rotate CSRF on every persist — refresh / switch-tenant / profile
  // update paths should all mint a fresh token. createSessionToken
  // defaults to a new randomUUID when csrfToken is undefined.
  const { csrfToken: _oldCsrf, ...rest } = session;
  const { token, csrfToken } = await createSessionToken(rest);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
  // Keep larry_csrf in sync with the rotated session csrfToken, else
  // the client's next mutating /api/** call will 403.
  store.set(csrfCookieOptions(csrfToken));
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
