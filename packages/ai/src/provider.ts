import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type { IntelligenceConfig } from "@larry/shared";

/**
 * Create a Vercel AI SDK model instance from Larry's IntelligenceConfig.
 * Returns a LanguageModel that can be passed to generateObject() or generateText().
 */
export function createModel(config: IntelligenceConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
    case "groq":
      return createGroq({ apiKey: config.apiKey })(config.model);
    default:
      throw new Error(`createModel called with unsupported provider: ${config.provider}`);
  }
}
