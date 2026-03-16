import { z } from "zod";

const GoogleOauthTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const GoogleWatchResponseSchema = z.object({
  kind: z.string().optional(),
  id: z.string(),
  resourceId: z.string(),
  resourceUri: z.string().optional(),
  token: z.string().optional(),
  expiration: z.string().optional(),
});

export interface BuildGoogleInstallUrlInput {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}

export interface GoogleTokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt?: string;
}

export interface GoogleWatchResult {
  channelId: string;
  resourceId: string;
  expiration?: string;
}

export function buildGoogleCalendarInstallUrl(input: BuildGoogleInstallUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function toIsoFromExpiresIn(expiresInSeconds: number | undefined): string | undefined {
  if (!expiresInSeconds) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

export async function exchangeGoogleOauthCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<GoogleTokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth exchange failed: ${response.status} ${text}`);
  }

  const payload = GoogleOauthTokenSchema.parse(await response.json());
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope,
    tokenType: payload.token_type,
    expiresAt: toIsoFromExpiresIn(payload.expires_in),
  };
}

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleTokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth refresh failed: ${response.status} ${text}`);
  }

  const payload = GoogleOauthTokenSchema.parse(await response.json());
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope,
    tokenType: payload.token_type,
    expiresAt: toIsoFromExpiresIn(payload.expires_in),
  };
}

export async function createGoogleCalendarWatch(input: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  channelToken: string;
  webhookUrl: string;
}): Promise<GoogleWatchResult> {
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    input.calendarId
  )}/events/watch`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: input.channelId,
      type: "web_hook",
      address: input.webhookUrl,
      token: input.channelToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google watch create failed: ${response.status} ${text}`);
  }

  const payload = GoogleWatchResponseSchema.parse(await response.json());
  return {
    channelId: payload.id,
    resourceId: payload.resourceId,
    expiration: payload.expiration,
  };
}

export function parseGoogExpiration(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return new Date(numeric).toISOString();
}
