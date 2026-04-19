import { createHash } from "node:crypto";
import { getApiEnv } from "@larry/config";
import { getRedis } from "./redis.js";

export type EmailKind =
  | "password_reset"
  | "verification"
  | "email_change_confirm"
  | "email_change_notify"
  | "new_device_alert"
  | "refresh_reuse_alert"
  | "member_invite"
  | "briefing_digest"
  | "generic";

export interface EmailQuotaContext {
  kind: EmailKind;
  recipient: string;
  userId?: string;
  tenantId?: string;
}

export interface EmailQuotaDetail {
  scope: string;
  limit: number;
  window: "1h" | "1d";
}

export class EmailQuotaError extends Error {
  readonly detail: EmailQuotaDetail;
  constructor(detail: EmailQuotaDetail) {
    super(`email quota exceeded: ${detail.scope} (limit=${detail.limit}, window=${detail.window})`);
    this.name = "EmailQuotaError";
    this.detail = detail;
  }
}

export class EmailSuppressedError extends Error {
  readonly recipientHash: string;
  constructor(recipientHash: string) {
    super("recipient is on the suppression list");
    this.name = "EmailSuppressedError";
    this.recipientHash = recipientHash;
  }
}

// Per-recipient and per-user windowed caps. Member invites live on the tenant
// bucket (see TENANT_INVITE_HOUR_LIMIT) — personal caps make no sense there.
const LIMITS: Record<EmailKind, { hour: number; day: number }> = {
  password_reset:       { hour: 3,  day: 10 },
  verification:         { hour: 5,  day: 15 },
  email_change_confirm: { hour: 3,  day: 10 },
  email_change_notify:  { hour: 5,  day: 15 },
  new_device_alert:     { hour: 10, day: 30 },
  refresh_reuse_alert:  { hour: 3,  day: 6  },
  member_invite:        { hour: 0,  day: 0 },
  briefing_digest:      { hour: 5,  day: 10 },
  generic:              { hour: 10, day: 30 },
};

const TENANT_INVITE_HOUR_LIMIT = 20;
const TENANT_DAILY_LIMIT = 200;
const GLOBAL_DAILY_LIMIT = 500;

const SUPPRESSION_PREFIX = "email:suppressed:";
const QUOTA_PREFIX = "email:q:";
const HOUR_TTL_SEC = 60 * 60 + 60;       // 1h + small slop
const DAY_TTL_SEC = 24 * 60 * 60 + 60;   // 24h + small slop

function hashRecipient(recipient: string): string {
  return createHash("sha256").update(recipient.toLowerCase().trim()).digest("hex").slice(0, 16);
}

function hourKey(d: Date): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function isSuppressed(recipient: string): Promise<boolean> {
  const redis = getRedis();
  const res = await redis.exists(`${SUPPRESSION_PREFIX}${hashRecipient(recipient)}`);
  return Boolean(res);
}

export async function addSuppression(
  recipient: string,
  reason: "bounce" | "complaint",
): Promise<void> {
  const redis = getRedis();
  const key = `${SUPPRESSION_PREFIX}${hashRecipient(recipient)}`;
  // No TTL — suppression is permanent until manually cleared (by design).
  await redis.set(key, reason);
}

interface QuotaCheck {
  key: string;
  ttl: number;
  limit: number;
  scope: string;
  window: "1h" | "1d";
}

function buildChecks(ctx: EmailQuotaContext): QuotaCheck[] {
  const now = new Date();
  const h = hourKey(now);
  const d = dayKey(now);
  const recipHash = hashRecipient(ctx.recipient);
  const kindLimits = LIMITS[ctx.kind];
  const checks: QuotaCheck[] = [];

  // Per-recipient (hashed) caps — primary defence against one address being
  // flooded regardless of which user or tenant triggered it.
  if (kindLimits.hour > 0) {
    checks.push({
      key: `${QUOTA_PREFIX}${ctx.kind}:r:${recipHash}:${h}`,
      ttl: HOUR_TTL_SEC,
      limit: kindLimits.hour,
      scope: `${ctx.kind}/hour/recipient`,
      window: "1h",
    });
  }
  if (kindLimits.day > 0) {
    checks.push({
      key: `${QUOTA_PREFIX}${ctx.kind}:r:${recipHash}:${d}`,
      ttl: DAY_TTL_SEC,
      limit: kindLimits.day,
      scope: `${ctx.kind}/day/recipient`,
      window: "1d",
    });
  }

  // Per-user (if authenticated) — catches a single attacker account hammering
  // many distinct recipients.
  if (ctx.userId && kindLimits.hour > 0) {
    checks.push({
      key: `${QUOTA_PREFIX}${ctx.kind}:u:${ctx.userId}:${h}`,
      ttl: HOUR_TTL_SEC,
      limit: kindLimits.hour,
      scope: `${ctx.kind}/hour/user`,
      window: "1h",
    });
  }

  // Member invites are a tenant-level action, not a per-user one.
  if (ctx.tenantId && ctx.kind === "member_invite") {
    checks.push({
      key: `${QUOTA_PREFIX}invite:t:${ctx.tenantId}:${h}`,
      ttl: HOUR_TTL_SEC,
      limit: TENANT_INVITE_HOUR_LIMIT,
      scope: "member_invite/hour/tenant",
      window: "1h",
    });
  }

  // Per-tenant daily total across all kinds — catches a compromised admin.
  if (ctx.tenantId) {
    checks.push({
      key: `${QUOTA_PREFIX}any:t:${ctx.tenantId}:${d}`,
      ttl: DAY_TTL_SEC,
      limit: TENANT_DAILY_LIMIT,
      scope: "any/day/tenant",
      window: "1d",
    });
  }

  // Global circuit breaker across all tenants — final backstop for Resend
  // quota / domain reputation.
  checks.push({
    key: `${QUOTA_PREFIX}any:global:${d}`,
    ttl: DAY_TTL_SEC,
    limit: GLOBAL_DAILY_LIMIT,
    scope: "any/day/global",
    window: "1d",
  });

  return checks;
}

/**
 * Atomically increment every applicable quota counter, then check each
 * against its limit. If any is over, rolls back all counters and throws.
 *
 * Increment-then-check avoids the check-then-increment race that would let
 * two concurrent callers both pass a cap boundary.
 */
export async function checkEmailQuota(ctx: EmailQuotaContext): Promise<void> {
  const env = getApiEnv();
  if (env.EMAIL_QUOTA_ENABLED === false) return;

  const redis = getRedis();
  const checks = buildChecks(ctx);
  if (checks.length === 0) return;

  const incr = redis.pipeline();
  for (const c of checks) {
    incr.incr(c.key);
    incr.expire(c.key, c.ttl);
  }
  const res = await incr.exec();
  if (!res) throw new Error("redis pipeline failed (null result)");

  // Results are interleaved: [incr, expire, incr, expire, ...]
  const counts: number[] = [];
  for (let i = 0; i < checks.length; i++) {
    const [err, val] = res[i * 2];
    if (err) throw err;
    counts.push(Number(val));
  }

  const breaches = checks
    .map((c, i) => ({ check: c, count: counts[i] }))
    .filter(({ check, count }) => count > check.limit);

  if (breaches.length > 0) {
    // Roll back every key we touched so a rejected call doesn't permanently
    // consume budget.
    const rollback = redis.pipeline();
    for (const c of checks) rollback.decr(c.key);
    await rollback.exec();

    const first = breaches[0];
    throw new EmailQuotaError({
      scope: first.check.scope,
      limit: first.check.limit,
      window: first.check.window,
    });
  }
}
