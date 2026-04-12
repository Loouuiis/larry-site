import { describe, expect, it } from "vitest";
import { sanitizeErrorMessageForUser } from "../src/error-sanitizer.js";

// QA-2026-04-12 C-2: the Gemini spend-cap message, including
// https://ai.studio/spend, was rendered verbatim to the user during the
// outage. The sanitized message must never leak provider URLs, quota text,
// or HTTP status codes to end users.
describe("sanitizeErrorMessageForUser", () => {
  it("neutralises the Gemini spend-cap error from the QA outage", () => {
    const raw =
      "Failed after 3 attempts. Last error: Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.";
    const out = sanitizeErrorMessageForUser(raw);
    expect(out).not.toContain("ai.studio");
    expect(out).not.toContain("spending cap");
    expect(out).toMatch(/temporarily unavailable/i);
  });

  it("neutralises provider host mentions (generativelanguage, openai, anthropic)", () => {
    for (const host of [
      "generativelanguage.googleapis.com",
      "api.openai.com",
      "api.anthropic.com",
    ]) {
      const out = sanitizeErrorMessageForUser(`fetch ${host} failed: ENOTFOUND`);
      expect(out).not.toContain(host);
    }
  });

  it("neutralises rate-limit and quota language", () => {
    expect(sanitizeErrorMessageForUser("429 rate limit exceeded")).toMatch(/temporarily unavailable/i);
    expect(sanitizeErrorMessageForUser("API quota exhausted for this project")).toMatch(/temporarily unavailable/i);
    expect(sanitizeErrorMessageForUser("401 from upstream provider")).toMatch(/temporarily unavailable/i);
  });

  it("returns a neutral string for null/empty input", () => {
    expect(sanitizeErrorMessageForUser(null)).toMatch(/temporarily unavailable/i);
    expect(sanitizeErrorMessageForUser("")).toMatch(/temporarily unavailable/i);
  });

  it("passes through safe errors verbatim, truncated", () => {
    const safe = "Transcript is shorter than the minimum 20 characters.";
    expect(sanitizeErrorMessageForUser(safe)).toBe(safe);
  });
});
