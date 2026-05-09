# Running Timeline 2 AI 2 locally

This note is the canonical checklist for **Timeline 2 AI 2** development. Docker runs infrastructure and optional proxy services; the API and web app usually run on the host.

## Local AI 2 architecture

```txt
Browser
→ Next.js web dev server
→ Fastify API dev server
→ Postgres / Redis / optional Codex proxy in Docker
→ model provider
```

## Canonical commands

```bash
docker compose up -d postgres redis codex-proxy
npm run api:dev
npm run web:dev
curl http://localhost:8080/v1/timeline2/ai2/health
docker compose logs -f codex-proxy
```

Use your repo root `DATABASE_URL`, `REDIS_URL`, and provider settings (for example `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `MODEL_PROVIDER`) in the environment for the API process. If you point OpenAI-compatible traffic at the Codex proxy, `OPENAI_BASE_URL` is commonly `http://localhost:3011/v1`.

## Restart rules

```txt
API code changes require restarting npm run api:dev if the dev process does not hot reload.
Web code changes require restarting npm run web:dev if Next does not pick them up.
Codex proxy code changes require restarting or recreating the codex-proxy container.
Database schema changes require running migrations.
Environment variable changes require restarting the affected process.
```

## Common failure checks

- **API not running** — health check fails or connection refused on the API port (default **8080** from `PORT`).
- **Web proxy cannot reach API** — verify `getApiBaseUrl()` / env for the Next app matches where the API listens.
- **Codex proxy not running** — `curl -s http://localhost:3011/health` should return JSON with `"ok": true`.
- **`OPENAI_BASE_URL` wrong** — using `localhost` from inside a container usually needs `host.docker.internal` (or the host IP), not `127.0.0.1` inside the container.
- **Missing provider API key** — `GET /v1/timeline2/ai2/health` reports `providerConfigured: false`.
- **Migrations not run** — API errors on Timeline 2 tables; run `npm run db:migrate` (or `npm run db:setup`) from the repo root.
- **Stale generated types or builds** — after shared/config/db/ai changes, rebuild dependents (`npm run build -w @larry/shared`, etc.).

## Health endpoint

```http
GET /v1/timeline2/ai2/health
```

Returns safe metadata only (no secrets), for example:

```json
{
  "ok": true,
  "route": "timeline2.ai2.health",
  "providerConfigured": true,
  "provider": "openai",
  "model": "gpt-4o-mini",
  "openaiBaseUrlSanitized": "http://localhost:3011/v1",
  "debugTraceEnabled": true
}
```

(`debugTraceEnabled` is `true` in local/dev when `TIMELINE2_AI2_DEBUG_TRACE` is unset; it is `false` in `production` and during `NODE_ENV=test` unless you set the env var to `true`.)

## Request tracing and debug artifacts

- Each AI 2 stream is correlated with **`reqId`** (from `x-request-id` or a new UUID). The same id appears in proxy logs, API logs, SSE payloads, and on-disk traces when debug traces are enabled.
- **By default**, JSON trace files are written under **`.ai2-debug/`** (relative to the API process working directory, typically `apps/api`) whenever the API runs in a non-production, non-test environment and you have not turned tracing off.
- To **disable** locally (or in any environment):

```bash
export TIMELINE2_AI2_DEBUG_TRACE=false
```

- To **force enable** in production or tests:

```bash
export TIMELINE2_AI2_DEBUG_TRACE=true
```

Trace files are named like `timeline2-ai2-{conversationId}-{reqId}.json`.
