import { env } from "./context.js";
export function buildWorkerIntelligenceConfig() {
    if (env.MODEL_PROVIDER === "openai") {
        return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL };
    }
    if (env.MODEL_PROVIDER === "anthropic") {
        return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };
    }
    return { provider: "mock", model: "mock" };
}
