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

async function loginWithServiceCredentials(baseUrl: string): Promise<AppSession | null> {
  const creds = getServiceCredentials();
  if (!creds) return null;

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
    if (!response.ok) return null;

    const payload = (await response.json()) as ApiLoginResponse;
    if (!payload.accessToken || !payload.user?.id) return null;

    return {
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
    };
  } catch {
    return null;
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
  return loginWithServiceCredentials(getApiBaseUrl());
}

export async function persistSession(session: AppSession): Promise<void> {
  const token = await createSessionToken(session);
  const store = await cookies();
  store.set(sessionCookieOptions(token));
}

export async function proxyApiRequest(
  session: AppSession,
  path: string,
  init: RequestInit = {}
): Promise<{
  status: number;
  body: unknown;
  session: AppSession | null;
}> {
  const baseUrl = getApiBaseUrl();
  let activeSession = await ensureApiSession(session);

  if (!activeSession?.apiAccessToken) {
    return {
      status: 401,
      body: { error: "No API session available. Please log in again." },
      session: activeSession,
    };
  }

  const perform = async (accessToken: string): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

  let response = await perform(activeSession.apiAccessToken);

  if (response.status === 401) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed?.apiAccessToken) {
      activeSession = refreshed;
      response = await perform(refreshed.apiAccessToken);
    }
  }

  const body = await parseApiBody(response);
  return {
    status: response.status,
    body,
    session: activeSession,
  };
}
