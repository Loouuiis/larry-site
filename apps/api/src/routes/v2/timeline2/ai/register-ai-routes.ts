import type { Timeline2RouteContext } from "../shared/route-context.js";
import { registerTimeline2AiHealthRoute } from "./register-ai-health-route.js";
import { registerTimeline2LegacyAiRoutes } from "./register-legacy-ai-routes.js";
import { registerTimeline2PrimaryAi2Routes } from "./register-primary-ai2-routes.js";

export function registerTimeline2AiRoutes(ctx: Timeline2RouteContext) {
  registerTimeline2AiHealthRoute(ctx);
  registerTimeline2LegacyAiRoutes(ctx);
  registerTimeline2PrimaryAi2Routes(ctx);
}
