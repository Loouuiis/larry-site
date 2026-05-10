# Timeline 2 AI

This folder is the internal home for Timeline 2 planning chat routes.

- `register-primary-ai2-routes.ts` is the maintained AI2 planning path.
- `register-legacy-ai-routes.ts` keeps the older AI stream alive for compatibility.
- `register-ai-health-route.ts` owns the health/debug entrypoint.
- `register-ai-routes.ts` is the zone-level composer.

If you are changing planner behavior, fallback planning, SSE events, or AI request tracing, start here.
