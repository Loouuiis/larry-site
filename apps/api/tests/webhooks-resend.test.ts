import { createHmac } from "node:crypto";
import Fastify, { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resendWebhookRoutes, verifySvixSignature } from "../src/routes/v1/webhooks-resend.js";

/**
 * Tests cover both the unit of the signature verifier (pure function)
 * and the full Fastify route wiring (bad-signature → 401, good → 200,
 * malformed bodies / headers / timestamps → 400s, missing secret → 503).
 *
 * Secret format mirrors Resend's production format: `whsec_<base64>`.
 * We encode the raw bytes "test-secret-32-bytes-long-here!!" as base64.
 */

const RAW_SECRET = Buffer.from("test-secret-32-bytes-long-here!!");
const FULL_SECRET = `whsec_${RAW_SECRET.toString("base64")}`;

function signSvix(svixId: string, svixTs: string, body: string): string {
  const signed = `${svixId}.${svixTs}.${body}`;
  const sig = createHmac("sha256", RAW_SECRET).update(signed).digest("base64");
  return `v1,${sig}`;
}

describe("verifySvixSignature (pure)", () => {
  const svixId = "msg_test_123";
  const svixTs = "1700000000";
  const body = '{"type":"email.delivered","data":{"to":["x@example.com"]}}';

  it("accepts a correct signature", () => {
    const header = signSvix(svixId, svixTs, body);
    expect(verifySvixSignature(FULL_SECRET, svixId, svixTs, body, header)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const header = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(verifySvixSignature(FULL_SECRET, svixId, svixTs, body, header)).toBe(false);
  });

  it("rejects when the body changed after signing", () => {
    const header = signSvix(svixId, svixTs, body);
    const tamperedBody = body.replace("delivered", "bounced");
    expect(verifySvixSignature(FULL_SECRET, svixId, svixTs, tamperedBody, header)).toBe(false);
  });

  it("accepts if at least one signature in a space-separated list is valid", () => {
    const good = signSvix(svixId, svixTs, body);
    const bad = "v1,AAAA=";
    const header = `${bad} ${good}`;
    expect(verifySvixSignature(FULL_SECRET, svixId, svixTs, body, header)).toBe(true);
  });

  it("ignores non-v1 signature versions", () => {
    const good = signSvix(svixId, svixTs, body);
    const v2 = good.replace("v1,", "v2,");
    expect(verifySvixSignature(FULL_SECRET, svixId, svixTs, body, v2)).toBe(false);
  });

  it("accepts secret without the whsec_ prefix", () => {
    const bareSecret = RAW_SECRET.toString("base64");
    const header = signSvix(svixId, svixTs, body);
    expect(verifySvixSignature(bareSecret, svixId, svixTs, body, header)).toBe(true);
  });
});

describe("POST /webhooks/resend", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.RESEND_WEBHOOK_SECRET = FULL_SECRET;
    app = Fastify({ logger: false });
    await app.register(resendWebhookRoutes, { prefix: "/webhooks" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  function freshTs(): string {
    return String(Math.floor(Date.now() / 1000));
  }

  it("returns 200 on a valid bounce event", async () => {
    const svixId = "msg_abc";
    const svixTs = freshTs();
    const body = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: "eid_1",
        to: ["bounce@example.com"],
        from: "Larry <noreply@larry-pm.com>",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": signSvix(svixId, svixTs, body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("returns 401 on signature mismatch", async () => {
    const svixId = "msg_bad";
    const svixTs = freshTs();
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when svix-timestamp is outside 5-minute tolerance", async () => {
    const svixId = "msg_old";
    const svixTs = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": signSvix(svixId, svixTs, body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when Svix headers are missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 503 when RESEND_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const svixId = "msg_nosec";
    const svixTs = freshTs();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": "v1,AAAA=",
      },
      payload: "{}",
    });
    expect(res.statusCode).toBe(503);
  });

  it("returns 400 on invalid JSON body (but valid signature)", async () => {
    const svixId = "msg_junk";
    const svixTs = freshTs();
    const body = "{not-json}";
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": signSvix(svixId, svixTs, body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});
