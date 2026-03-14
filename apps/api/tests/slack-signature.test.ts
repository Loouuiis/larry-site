import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySlackSignature } from "../src/services/connectors/slack.js";

describe("verifySlackSignature", () => {
  it("accepts a valid signature", () => {
    const signingSecret = "test_signing_secret";
    const timestamp = "1710000000";
    const rawBody = JSON.stringify({ type: "url_verification", challenge: "abc123" });
    const base = `v0:${timestamp}:${rawBody}`;
    const signature = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

    const valid = verifySlackSignature({
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: signature,
      signingSecret,
      nowUnixSeconds: 1710000000,
      toleranceSeconds: 300,
    });

    expect(valid).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const valid = verifySlackSignature({
      rawBody: "{}",
      timestampHeader: "1710000000",
      signatureHeader: "v0=deadbeef",
      signingSecret: "wrong",
      nowUnixSeconds: 1710000000,
      toleranceSeconds: 300,
    });

    expect(valid).toBe(false);
  });
});
