/**
 * Smoke test for Slack webhook signature validation.
 * Run with: node scripts/test-slack-webhook.mjs
 * Requires the API to be running on port 8080.
 */

import { createHmac } from "node:crypto";

const API_URL = "http://localhost:8080/v1/connectors/slack/events";
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "b1c6302650705ec5d566b91b79b85a09";

function sign(body) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = `v0=${createHmac("sha256", SIGNING_SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;
  return { "x-slack-request-timestamp": ts, "x-slack-signature": sig };
}

async function post(body, extraHeaders = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log("\nSlack webhook security tests\n");

// 1. url_verification with NO signature → must be 401
{
  const body = JSON.stringify({ type: "url_verification", challenge: "test-challenge" });
  const { status } = await post(body);
  assert("url_verification without signature → 401", status, 401);
}

// 2. url_verification with VALID signature → must be 200 + echo challenge
{
  const body = JSON.stringify({ type: "url_verification", challenge: "test-challenge" });
  const { status, body: resBody } = await post(body, sign(body));
  assert("url_verification with valid signature → 200", status, 200);
  assert("url_verification returns challenge", JSON.parse(resBody).challenge, "test-challenge");
}

// 3. event_callback with TAMPERED body (signature won't match) → must be 401
{
  const body = JSON.stringify({ type: "event_callback", team_id: "T123", event: { type: "message" } });
  const headers = sign(body);
  const tamperedBody = body + " ";           // body differs from what was signed
  const { status } = await post(tamperedBody, headers);
  assert("tampered body → 401", status, 401);
}

// 4. Valid signature but timestamp >5 min old → must be 401 (replay attack)
{
  const body = JSON.stringify({ type: "url_verification", challenge: "replay" });
  const staleTs = (Math.floor(Date.now() / 1000) - 400).toString();
  const sig = `v0=${createHmac("sha256", SIGNING_SECRET).update(`v0:${staleTs}:${body}`).digest("hex")}`;
  const { status } = await post(body, {
    "x-slack-request-timestamp": staleTs,
    "x-slack-signature": sig,
  });
  assert("stale timestamp (replay attack) → 401", status, 401);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
