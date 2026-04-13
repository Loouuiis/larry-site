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

  it("keeps json_schema mode on Groq meta-llama/llama-4-scout-17b-16e-instruct", () => {
    const opts = getStructuredOutputOptions({
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      apiKey: "test-key",
    });

    expect(opts.providerOptions).toBeUndefined();
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
