import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const SlackOauthSuccessSchema = z.object({
  ok: z.literal(true),
  app_id: z.string().optional(),
  access_token: z.string(),
  scope: z.string().optional(),
  bot_user_id: z.string().optional(),
  team: z.object({
    id: z.string(),
    name: z.string().optional(),
  }),
  enterprise: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .nullish(),
});

const SlackOauthFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string().optional(),
});

const SlackOauthResponseSchema = z.union([SlackOauthSuccessSchema, SlackOauthFailureSchema]);

export interface BuildSlackInstallUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string;
}

export interface SlackOauthAccessResult {
  appId?: string;
  accessToken: string;
  scope?: string;
  botUserId?: string;
  teamId: string;
  teamName?: string;
  enterpriseId?: string;
}

export function buildSlackInstallUrl(input: BuildSlackInstallUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scopes,
    state: input.state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackOauthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<SlackOauthAccessResult> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack OAuth exchange failed: ${response.status} ${text}`);
  }

  const payload = SlackOauthResponseSchema.parse(await response.json());
  if (!payload.ok) {
    throw new Error(`Slack OAuth exchange failed: ${payload.error ?? "unknown_error"}`);
  }

  return {
    appId: payload.app_id,
    accessToken: payload.access_token,
    scope: payload.scope,
    botUserId: payload.bot_user_id,
    teamId: payload.team.id,
    teamName: payload.team.name,
    enterpriseId: payload.enterprise?.id,
  };
}

export function verifySlackSignature(input: {
  rawBody: string;
  timestampHeader?: string;
  signatureHeader?: string;
  signingSecret: string;
  toleranceSeconds?: number;
  nowUnixSeconds?: number;
}): boolean {
  const timestamp = input.timestampHeader;
  const signature = input.signatureHeader;
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;

  const now = input.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(now - ts) > tolerance) return false;

  const basestring = `v0:${timestamp}:${input.rawBody}`;
  const expected = `v0=${createHmac("sha256", input.signingSecret).update(basestring).digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function parseSlackEventTimestampToIso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function createSignedStateToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds = 600
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySignedStateToken(token: string, secret: string): Record<string, unknown> {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid state format");
  }

  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const expectedBuffer = toBuffer(expected);
  const signatureBuffer = toBuffer(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error("Invalid state signature");
  }

  const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    exp?: number;
  } & Record<string, unknown>;

  if (typeof parsed.exp !== "number" || Math.floor(Date.now() / 1000) > parsed.exp) {
    throw new Error("Expired state token");
  }

  return parsed;
}


/**
 * Post a message to a Slack channel using the bot token.
 */
export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json() as { ok: boolean; error?: string };
  return data;
}
