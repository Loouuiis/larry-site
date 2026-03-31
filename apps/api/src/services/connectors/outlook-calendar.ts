import { z } from "zod";

const OutlookTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const OutlookEventSchema = z.object({
  id: z.string(),
  webLink: z.string().optional(),
});

export interface BuildOutlookInstallUrlInput {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}

export interface OutlookTokenResult {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt?: string;
}

export interface OutlookCalendarEventCreateInput {
  accessToken: string;
  calendarId: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
  description?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  timeZone?: string | null;
}

export interface OutlookCalendarEventUpdateInput {
  accessToken: string;
  calendarId: string;
  eventId: string;
  summary?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  description?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  timeZone?: string | null;
}

export interface OutlookCalendarEventWriteResult {
  id: string;
  htmlLink?: string;
}

function toIsoFromExpiresIn(expiresInSeconds: number | undefined): string | undefined {
  if (!expiresInSeconds) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function getOutlookTokenEndpoint(): string {
  return "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}

function getOutlookAuthorizeEndpoint(): string {
  return "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
}

export function buildOutlookCalendarInstallUrl(input: BuildOutlookInstallUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    response_mode: "query",
    scope: input.scopes,
    state: input.state,
    prompt: "select_account",
  });
  return `${getOutlookAuthorizeEndpoint()}?${params.toString()}`;
}

export async function exchangeOutlookOauthCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OutlookTokenResult> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code: input.code,
  });

  const response = await fetch(getOutlookTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outlook OAuth exchange failed: ${response.status} ${text}`);
  }

  const payload = OutlookTokenSchema.parse(await response.json());
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope,
    tokenType: payload.token_type,
    expiresAt: toIsoFromExpiresIn(payload.expires_in),
  };
}

export async function refreshOutlookAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string;
}): Promise<OutlookTokenResult> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    scope: input.scopes,
    grant_type: "refresh_token",
  });

  const response = await fetch(getOutlookTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outlook OAuth refresh failed: ${response.status} ${text}`);
  }

  const payload = OutlookTokenSchema.parse(await response.json());
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope,
    tokenType: payload.token_type,
    expiresAt: toIsoFromExpiresIn(payload.expires_in),
  };
}

function buildOutlookEventBody(input: {
  summary?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  description?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  timeZone?: string | null;
}): Record<string, unknown> {
  const timeZone = input.timeZone ?? "UTC";
  const body: Record<string, unknown> = {};

  if (input.summary !== undefined) {
    body.subject = input.summary;
  }
  if (input.description !== undefined) {
    body.body = {
      contentType: "Text",
      content: input.description ?? "",
    };
  }
  if (input.location !== undefined) {
    body.location = { displayName: input.location ?? "" };
  }
  if (input.attendees !== undefined) {
    body.attendees =
      input.attendees
        ?.filter((email) => email.trim().length > 0)
        .map((email) => ({
          emailAddress: { address: email },
          type: "required",
        })) ?? [];
  }
  if (input.startDateTime !== undefined) {
    body.start = {
      dateTime: input.startDateTime,
      timeZone,
    };
  }
  if (input.endDateTime !== undefined) {
    body.end = {
      dateTime: input.endDateTime,
      timeZone,
    };
  }

  return body;
}

function buildOutlookEventsEndpoint(calendarId: string): string {
  if (calendarId === "primary") {
    return "https://graph.microsoft.com/v1.0/me/events";
  }
  return `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`;
}

export async function createOutlookCalendarEvent(
  input: OutlookCalendarEventCreateInput
): Promise<OutlookCalendarEventWriteResult> {
  const response = await fetch(buildOutlookEventsEndpoint(input.calendarId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOutlookEventBody({
        summary: input.summary,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        description: input.description ?? null,
        location: input.location ?? null,
        attendees: input.attendees ?? null,
        timeZone: input.timeZone ?? null,
      })
    ),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outlook event create failed: ${response.status} ${text}`);
  }

  const payload = OutlookEventSchema.parse(await response.json());
  return {
    id: payload.id,
    htmlLink: payload.webLink,
  };
}

export async function updateOutlookCalendarEvent(
  input: OutlookCalendarEventUpdateInput
): Promise<OutlookCalendarEventWriteResult> {
  const endpoint = `${buildOutlookEventsEndpoint(input.calendarId)}/${encodeURIComponent(input.eventId)}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOutlookEventBody({
        summary: input.summary,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        description: input.description,
        location: input.location,
        attendees: input.attendees,
        timeZone: input.timeZone,
      })
    ),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outlook event update failed: ${response.status} ${text}`);
  }

  const payload = OutlookEventSchema.parse(await response.json());
  return {
    id: payload.id,
    htmlLink: payload.webLink,
  };
}
