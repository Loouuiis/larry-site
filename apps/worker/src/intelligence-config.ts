import type { IntelligenceConfig } from "@larry/shared";
import { env } from "./context.js";

export function buildWorkerIntelligenceConfig(): IntelligenceConfig {
  if (env.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL };
  }
  if (env.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };
  }
  if (env.MODEL_PROVIDER === "gemini") {
    return { provider: "gemini", apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  }
  if (env.MODEL_PROVIDER === "groq") {
    return { provider: "groq", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

export function buildWorkerFallbackIntelligenceConfig(): IntelligenceConfig | undefined {
  if (env.MODEL_PROVIDER === "gemini" && env.GROQ_API_KEY) {
    return { provider: "groq", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL };
  }
  if (env.MODEL_PROVIDER === "groq" && env.GEMINI_API_KEY) {
    return { provider: "gemini", apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  }
  return undefined;
}
