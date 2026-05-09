import { isAi2DebugTraceEnabled, TIMELINE2_AI2_HEALTH_ROUTE } from "../../../../lib/timeline2-ai2-trace.js";
import type { Timeline2RouteContext } from "../shared/route-context.js";

export function registerTimeline2AiHealthRoute(ctx: Timeline2RouteContext) {
  const { fastify, configuredTimeline2ModelConfig, sanitizeBaseUrl } = ctx;

  fastify.get("/ai2/health", async () => {
    let providerConfigured = true;
    let provider: string | null = null;
    let model: string | null = null;
    try {
      const cfg = configuredTimeline2ModelConfig();
      provider = cfg.provider;
      model = cfg.model;
    } catch {
      providerConfigured = false;
    }
    return {
      ok: true,
      route: TIMELINE2_AI2_HEALTH_ROUTE,
      providerConfigured,
      provider: provider ?? "unconfigured",
      model,
      openaiBaseUrlSanitized: sanitizeBaseUrl(process.env.OPENAI_BASE_URL),
      debugTraceEnabled: isAi2DebugTraceEnabled(),
    };
  });
}
