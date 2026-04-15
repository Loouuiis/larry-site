import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
  // jti enables single-use enforcement at the callback. Random 128-bit id
  // is collision-free in practice and base-10-safe for easy Redis keys.
  const jti = randomBytes(16).toString("hex");
  const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp, jti })).toString("base64url");
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
 * Optionally reply to a thread by passing threadTs.
 */
export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const body: Record<string, unknown> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; ts?: string; error?: string };
  return data;
}

/**
 * Open a DM channel with a Slack user and return the channel ID.
 */
export async function openSlackDmChannel(
  botToken: string,
  slackUserId: string
): Promise<string | null> {
  const res = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: slackUserId }),
  });
  const data = await res.json() as { ok: boolean; channel?: { id: string }; error?: string };
  return data.ok ? (data.channel?.id ?? null) : null;
}

/**
 * Fetch a list of public channels the bot has access to.
 */
export async function listSlackChannels(
  botToken: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=true",
    {
      headers: { "Authorization": `Bearer ${botToken}` },
    }
  );
  const data = await res.json() as {
    ok: boolean;
    channels?: Array<{ id: string; name: string; is_archived?: boolean }>;
    error?: string;
  };
  if (!data.ok) return [];
  return (data.channels ?? [])
    .filter((c) => !c.is_archived)
    .map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Look up a Slack user's display name and email.
 */
export async function lookupSlackUser(
  botToken: string,
  slackUserId: string
): Promise<{ name: string; email: string | null } | null> {
  const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
    headers: { "Authorization": `Bearer ${botToken}` },
  });
  const data = await res.json() as {
    ok: boolean;
    user?: { real_name?: string; name?: string; profile?: { email?: string } };
    error?: string;
  };
  if (!data.ok || !data.user) return null;
  return {
    name: data.user.real_name ?? data.user.name ?? slackUserId,
    email: data.user.profile?.email ?? null,
  };
}
