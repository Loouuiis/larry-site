import type { IntelligenceConfig } from "@larry/shared";

/**
 * Groq models that support `response_format: json_schema` (strict structured
 * outputs). Per https://console.groq.com/docs/structured-outputs#supported-models
 * as of 2026-04-13. Models NOT on this list reject json_schema and must
 * downshift to `json_object` (prompt-based JSON, still universally supported).
 */
const GROQ_JSON_SCHEMA_CAPABLE_MODELS: ReadonlySet<string> = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct-0905",
]);

export interface StructuredOutputOptions {
  providerOptions?: {
    groq?: { structuredOutputs: boolean };
  };
}

/**
 * Returns the providerOptions overlay that should be spread into every
 * `generateObject` call so that the request succeeds on the configured
 * provider+model. The AI SDK defaults Groq's adapter to `structuredOutputs:
 * true`, which emits `response_format: json_schema` — unsupported on
 * `llama-3.3-70b-versatile` and most non-OSS Groq models. Downshifting to
 * `structuredOutputs: false` makes the adapter emit `response_format:
 * json_object` (prompt-based JSON); the SDK still parses + validates the
 * result against the Zod schema client-side.
 *
 * Other providers (OpenAI, Anthropic, Gemini) support json_schema on all
 * configured models, so no overlay is needed.
 */
export function getStructuredOutputOptions(
  config: IntelligenceConfig,
): StructuredOutputOptions {
  if (config.provider === "groq" && !GROQ_JSON_SCHEMA_CAPABLE_MODELS.has(config.model)) {
    return { providerOptions: { groq: { structuredOutputs: false } } };
  }
  return {};
}
