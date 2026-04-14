import { describe, expect, it } from "vitest";
import { getStructuredOutputOptions } from "@larry/ai";

describe("getStructuredOutputOptions — provider capability switch (N-8)", () => {
  it("downshifts Groq llama-3.3-70b-versatile to json_object (structuredOutputs: false)", () => {
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toEqual({ groq: { structuredOutputs: false } });
  });

  it("downshifts unknown Groq models (conservative default)", () => {
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "some-future-groq-model-id",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toEqual({ groq: { structuredOutputs: false } });
  });

  it("keeps json_schema mode on Groq openai/gpt-oss-120b (json_schema supported)", () => {
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toBeUndefined();
  });

  it("downshifts moonshotai/kimi-k2-instruct-0905 to json_object (strict-mode rejection, 2026-04-14)", () => {
    // Kimi-k2 nominally supports json_schema but enforces the same
    // OpenAI strict-mode rules as llama-4 — rejected our Zod schema
    // with "invalid JSON schema for response_format" live.
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "moonshotai/kimi-k2-instruct-0905",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toEqual({ groq: { structuredOutputs: false } });
  });

  it("downshifts meta-llama/llama-4-scout-17b-16e-instruct to json_object (strict-mode rejection, 2026-04-14)", () => {
    // llama-4-scout nominally supports json_schema but enforces OpenAI
    // strict-mode rules the AI SDK's Zod-to-JSON-Schema converter does
    // not satisfy (optional fields like executionOutput.emailRecipient
    // aren't listed in `required`). Live prod returned 400 "invalid
    // JSON schema" on 2026-04-14. Downshifting to structuredOutputs:
    // false uses prompt-based JSON + client-side Zod parse, the same
    // path that already works on llama-3.3-70b.
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toEqual({ groq: { structuredOutputs: false } });
  });

  it("returns no overrides for OpenAI (json_schema universally supported)", () => {
    const opts = getStructuredOutputOptions({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    expect(opts).toEqual({});
  });

  it("returns no overrides for Anthropic", () => {
    const opts = getStructuredOutputOptions({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      apiKey: "test-key",
    });

    expect(opts).toEqual({});
  });

  it("returns no overrides for Gemini", () => {
    const opts = getStructuredOutputOptions({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "test-key",
    });

    expect(opts).toEqual({});
  });

  it("returns no overrides for mock provider", () => {
    const opts = getStructuredOutputOptions({
      provider: "mock",
      model: "mock",
    });

    expect(opts).toEqual({});
  });
});
