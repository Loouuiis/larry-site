import { AppSession, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { cookies } from "next/headers";

interface ApiLoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    role: string;
  };
}

interface ApiRefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

interface ProxyApiRequestOptions {
  timeoutMs?: number;
}

interface UpstreamErrorResult {
  status: number;
  body: unknown;
}

interface ServiceLoginResult {
  session: AppSession | null;
  error?: UpstreamErrorResult;
}

function getApiBaseUrl(): string {
  return (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

function getServiceCredentials():
  | { tenantId: string; email: string; password: string }
  | null {
  const tenantId = process.env.LARRY_API_TENANT_ID;
  const email = process.env.LARRY_API_EMAIL;
  const password = process.env.LARRY_API_PASSWORD;
  if (!tenantId || !email || !password) return null;
  return { tenantId, email, password };
}

async function parseApiBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text.length > 0 ? { message: text } : {};
}

function fallbackError(message: string): UpstreamErrorResult {
  return {
    status: 503,
    body: { error: message },
  };
}

function transportError(message: string): UpstreamErrorResult {
  return {
    status: 504,
    body: { error: message },
  };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const maybeError = (payload as Record<string, unknown>).error;
  if (typeof maybeError === "string" && maybeError.length > 0) return maybeError;
  const maybeMessage = (payload as Record<string, unknown>).message;
  if (typeof maybeMessage === "string" && maybeMessage.length > 0) return maybeMessage;
  return fallback;
}

async function loginWithServiceCredentials(baseUrl: string): Promise<ServiceLoginResult> {
  const creds = getServiceCredentials();
  if (!creds) {
    return {
      session: null,
      error: fallbackError(
        "Service credentials are missing. Set LARRY_API_TENANT_ID, LARRY_API_EMAIL, and LARRY_API_PASSWORD."
      ),
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: creds.tenantId,
        email: creds.email,
        password: creds.password,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      let body: unknown = {};
      try {
        body = await parseApiBody(response);
      } catch {
        body = {};
      }
      return {
        session: null,
        error: {
          status: response.status,
          body: {
            error: extractErrorMessage(body, "Service login failed."),
            upstream: body,
          },
        },
      };
    }

    const payload = (await response.json()) as ApiLoginResponse;
    if (!payload.accessToken || !payload.user?.id) {
      return {
        session: null,
        error: fallbackError("Service login succeeded but returned an invalid payload."),
      };
    }

    return {
      session: {
        userId: payload.user.id,
        email: payload.user.email,
        tenantId: payload.user.tenantId,
        role: payload.user.role,
        apiAccessToken: payload.accessToken,
        apiRefreshToken: payload.refreshToken,
        authMode: "api",
      },
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Service login request failed.";
    const message = rawMessage.includes("aborted due to timeout")
      ? "API login timed out. Check API database connectivity (DATABASE_URL/Neon) and try again."
      : rawMessage;
    return {
      session: null,
      error: transportError(message),
    };
  }
}

async function refreshApiSession(
  baseUrl: string,
  session: AppSession
): Promise<AppSession | null> {
  if (!session.apiRefreshToken || !session.tenantId) return null;

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
    if (!response.ok) return null;

    const payload = (await response.json()) as ApiRefreshResponse;
    if (!payload.accessToken) return null;

    return {
      ...session,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken ?? session.apiRefreshToken,
      authMode: "api",
    };
  } catch {
    return null;
  }
}

export async function ensureApiSession(session: AppSession): Promise<AppSession | null> {
  if (session.apiAccessToken && session.tenantId) {
    return session;
  }
  const result = await loginWithServiceCredentials(getApiBaseUrl());
  return result.session;
}

export async function persistSession(session: AppSession): Promise<void> {
  const token = await createSessionToken(session);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
}

export async function proxyApiRequest(
  session: AppSession,
  path: string,
  init: RequestInit = {},
  options: ProxyApiRequestOptions = {}
): Promise<{
  status: number;
  body: unknown;
  session: AppSession | null;
}> {
  const baseUrl = getApiBaseUrl();
  let activeSession: AppSession | null = null;
  let fallbackErrorResult: UpstreamErrorResult | undefined;

  if (session.apiAccessToken && session.tenantId) {
    activeSession = session;
  } else {
    const serviceLogin = await loginWithServiceCredentials(baseUrl);
    activeSession = serviceLogin.session;
    fallbackErrorResult = serviceLogin.error;
  }

  if (!activeSession?.apiAccessToken) {
    return {
      status: fallbackErrorResult?.status ?? 401,
      body: fallbackErrorResult?.body ?? { error: "No API session available. Please log in again." },
      session: activeSession,
    };
  }

  const timeoutMs = options.timeoutMs ?? 12_000;
  const perform = async (accessToken: string): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });

  let response: Response;
  try {
    response = await perform(activeSession.apiAccessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream API request failed.";
    return {
      status: 504,
      body: { error: message },
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
        const message = error instanceof Error ? error.message : "Upstream API request failed.";
        return {
          status: 504,
          body: { error: message },
          session: activeSession,
        };
      }
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
