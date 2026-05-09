import type { AppSession } from "@/lib/auth";
import {
  apiTokensCookieOptions,
  clearWebSessionCookies,
  createSessionToken,
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
    if (!response.ok && json && typeof json === "object") {
      const j = json as { error?: unknown; message?: unknown };
      if (typeof j.message === "string" && j.message.trim().length > 0) {
        return { ...json, error: j.message };
      }
    }
    return json;
  }
  return response.ok ? {} : { error: "Service temporarily unavailable. Please try again." };
}

export async function ensureApiSession(session: AppSession): Promise<AppSession | null> {
  if (session.apiAccessToken && session.tenantId) {
    return session;
  }
  return null;
}

export async function persistSession(session: AppSession): Promise<void> {
  const { token } = await createSessionToken(session);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
  store.set(await apiTokensCookieOptions(session));
}

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

  if (isTokenExpiredOrExpiringSoon(activeSession.apiAccessToken!)) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed) {
      activeSession = refreshed;
    }
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

    if (response.status === 401) {
      await clearWebSessionCookies();
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
