import { createHmac, timingSafeEqual } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { addSuppression } from "../../lib/email-quota.js";

/**
 * Resend webhook receiver.
 *
 * Resend signs webhook requests using Svix's signature scheme:
 *   signed_content = `${svix-id}.${svix-timestamp}.${raw-body}`
 *   signature      = HMAC-SHA256(base64-decoded-secret, signed_content)
 *   header value   = `v1,<base64(signature)>` (whitespace-separated if multiple)
 *
 * The secret stored in Resend → Webhooks looks like `whsec_<base64>`. We strip
 * the prefix, base64-decode, and use the resulting bytes as the HMAC key.
 *
 * For v1 we log events to the Fastify logger (Railway picks them up). Future
 * extensions: persist to an `email_events` table, auto-suppress hard-bounced
 * and complained addresses, expose a dashboard.
 */
export const resendWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Scoped raw-body parser — only affects routes registered inside this plugin.
  // We need the unmodified UTF-8 bytes for Svix signature verification;
  // JSON.stringify of a reparsed object would not match the signature.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post("/resend", async (request, reply) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      request.log.error("[webhook-resend] RESEND_WEBHOOK_SECRET not configured");
      return reply.code(503).send({ error: "Webhook secret not configured" });
    }

    const svixId = firstHeader(request.headers["svix-id"]);
    const svixTs = firstHeader(request.headers["svix-timestamp"]);
    const svixSigHeader = firstHeader(request.headers["svix-signature"]);

    if (!svixId || !svixTs || !svixSigHeader) {
      return reply.code(400).send({ error: "Missing Svix headers" });
    }

    // Timestamp check — reject requests older than 5 minutes (replay defence).
    const tsNum = Number(svixTs);
    if (!Number.isFinite(tsNum)) {
      return reply.code(400).send({ error: "Invalid svix-timestamp" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > 5 * 60) {
      return reply.code(400).send({ error: "svix-timestamp outside tolerance" });
    }

    const rawBody = typeof request.body === "string" ? request.body : "";
    if (!rawBody) {
      return reply.code(400).send({ error: "Empty body" });
    }

    if (!verifySvixSignature(secret, svixId, svixTs, rawBody, svixSigHeader)) {
      request.log.warn({ svixId }, "[webhook-resend] signature mismatch");
      return reply.code(401).send({ error: "Invalid signature" });
    }

    let event: ResendEvent;
    try {
      event = JSON.parse(rawBody) as ResendEvent;
    } catch {
      return reply.code(400).send({ error: "Invalid JSON" });
    }

    // Log interesting events and auto-suppress on hard bounces and complaints
    // so we stop burning Resend quota / domain reputation on known-bad recipients.
    const to = extractTo(event);
    const type = event.type ?? "unknown";
    switch (type) {
      case "email.bounced": {
        const bounceType = extractBounceType(event);
        request.log.warn({ svixId, type, to, bounceType, data: event.data }, "[webhook-resend] bounce");
        // Only suppress hard bounces — soft bounces (mailbox full, temporary
        // outage) are transient and the address may recover.
        if (to && bounceType === "hard") {
          try {
            await addSuppression(to, "bounce");
          } catch (err) {
            request.log.error({ err, to }, "[webhook-resend] failed to add bounce suppression");
          }
        }
        break;
      }
      case "email.complained":
        request.log.warn({ svixId, type, to, data: event.data }, "[webhook-resend] complaint");
        if (to) {
          try {
            await addSuppression(to, "complaint");
          } catch (err) {
            request.log.error({ err, to }, "[webhook-resend] failed to add complaint suppression");
          }
        }
        break;
      case "email.delivery_delayed":
        request.log.info({ svixId, type, to }, "[webhook-resend] delivery delayed");
        break;
      case "email.delivered":
      case "email.sent":
      case "email.opened":
      case "email.clicked":
        // Low-signal events — log at debug only.
        request.log.debug({ svixId, type, to }, "[webhook-resend] event");
        break;
      default:
        request.log.info({ svixId, type, to }, "[webhook-resend] unknown event type");
    }

    return reply.code(200).send({ ok: true });
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function firstHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function extractTo(event: ResendEvent): string | undefined {
  const to = event.data?.to;
  if (Array.isArray(to)) return to[0];
  if (typeof to === "string") return to;
  return undefined;
}

function extractBounceType(event: ResendEvent): "hard" | "soft" | undefined {
  // Resend shapes the bounce payload as either a `bounce` object with a
  // `type` field, or the type is nested under `bounce_type`. Be defensive.
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return undefined;
  const direct = data["bounce_type"];
  if (direct === "hard" || direct === "soft") return direct;
  const nested = data["bounce"] as { type?: unknown } | undefined;
  if (nested && typeof nested === "object") {
    const t = nested.type;
    if (t === "hard" || t === "soft") return t;
  }
  return undefined;
}

/**
 * Verify a Svix-format signature header.
 *
 * `svixSigHeader` is one or more space-separated `v1,<base64>` pairs.
 * Returns true if ANY of them match the expected signature computed from the
 * provided secret / id / timestamp / body.
 */
export function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTs: string,
  rawBody: string,
  svixSigHeader: string,
): boolean {
  const secretBytes = decodeSecret(secret);
  if (!secretBytes) return false;

  const signedContent = `${svixId}.${svixTs}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  for (const part of svixSigHeader.split(/\s+/)) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (provided.length !== expected.length) continue;
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

function decodeSecret(secret: string): Buffer | null {
  // Resend secrets come as `whsec_<base64>`. Strip the prefix if present.
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}
