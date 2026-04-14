import type { IntelligenceConfig } from "@larry/shared";

/**
 * Groq models that support `response_format: json_schema` **AND** accept the
 * non-strict JSON Schema shape emitted by the AI SDK's Zod-to-JSON-Schema
 * converter. Per https://console.groq.com/docs/structured-outputs#supported-models
 * as of 2026-04-14.
 *
 * 2026-04-14 discovery: `meta-llama/llama-4-scout-17b-16e-instruct` nominally
 * supports json_schema but enforces OpenAI strict-mode rules — every
 * `properties` key must appear in `required`, no `anyOf` without all branches
 * being strict, etc. Our IntelligenceResultSchema uses `.optional()` on
 * fields like `executionOutput.emailRecipient` which emit properties absent
 * from `required`. llama-4 rejects with "400 invalid JSON schema". Opting
 * llama-4 OUT of json_schema mode here makes the AI SDK fall back to
 * `json_object` (prompt-based JSON) + client-side Zod parse — the same
 * path that already works on llama-3.3-70b. Models NOT on this list
 * downshift automatically.
 */
const GROQ_JSON_SCHEMA_CAPABLE_MODELS: ReadonlySet<string> = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k2-instruct-0905",
  // meta-llama/llama-4-* intentionally omitted: strict-mode JSON schema
  // validation rejects our .optional()-heavy Zod shapes. Revisit if we
  // refactor the schema to be strict-mode-compliant.
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
