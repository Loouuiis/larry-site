# Larry — Claude Code Instructions

## Quick Orientation

Larry is an AI-powered project management platform. Monorepo with three apps and four shared packages.

```
apps/api/       Fastify v5 REST API (port 8080) — deployed on Railway
apps/web/       Next.js 16 App Router frontend  — deployed on Vercel (larry-pm.com)
apps/worker/    BullMQ job consumer             — deployed on Railway
packages/ai/    Intelligence engine (Vercel AI SDK v6, Gemini)
packages/db/    Postgres schema, migrations, seed, client
packages/shared/ Shared TypeScript types and queue contracts
packages/config/ Zod-validated env schemas
```

**Start here:** `docs/OVERVIEW.md` has the full product context, team, and links to every other doc.

---

## Context Routing — What to Read

Read **only** what's relevant to the current task. Don't read everything.

| If the task involves... | Read these files |
|---|---|
| **API routes, backend logic** | `docs/BACKEND-API.md`, then the route file in `apps/api/src/routes/v1/` |
| **Frontend / UI / workspace** | `docs/FRONTEND.md`, then the page in `apps/web/src/app/` |
| **AI agent, intelligence, prompts** | `docs/AI-AGENT.md`, `packages/ai/src/intelligence.ts`, `packages/ai/knowledge/` |
| **Worker, background jobs, queues** | `docs/BACKEND-WORKER.md`, `apps/worker/src/` |
| **Slack, Calendar, Email connectors** | `docs/CONNECTORS.md` |
| **Auth, sessions, JWT, RBAC** | `docs/AUTH-SECURITY.md` |
| **Database schema, migrations** | `docs/DATABASE.md`, `packages/db/src/schema.sql` |
| **Deployment, env vars, infra** | `DEPLOYMENT.md` |
| **Running locally** | `running_locally.md` |
| **What's in/out of v1 scope** | `docs/V1-SCOPE.md` |
| **Product vision, team, ICP** | `docs/OVERVIEW.md` |
| **Codebase knowledge graph** | `graphify-out/GRAPH_REPORT.md` (communities, god nodes, connections) |
| **Active implementation plans** | `plans/` directory |

---

## Production-First Workflow

**Fergus tests on production, not locally.** This is the most important thing to know.

- Frontend: Vercel (auto-deploys from `master` on GitHub `Loouuiis/larry-site`)
- API + Worker: Railway (auto-deploys from `master`)
- Database + Redis: Railway managed

### What this means for you:

1. **Push before testing.** Changes must be committed and pushed to `master` for them to be testable.
2. **Wait for deploy.** After pushing, Railway takes 2-3 minutes to rebuild. Vercel is faster (~1 min). Check with `gh run list` for CI status.
3. **Don't say "restart locally."** Fergus doesn't run services locally. Railway auto-deploys on push.
4. **Debug production, not local.** When investigating issues, think about Railway logs and the deployed environment, not localhost.
5. **Worker runs compiled JS.** Changes to worker/api TypeScript require a full rebuild on Railway — the worker doesn't hot-reload.

### Smoke-testing the deployed API

The smoke test script works against any URL:

```bash
# Against production
API_URL=https://larry-site-production.up.railway.app bash scripts/demo-smoke-test.sh

# Against local (if running)
bash scripts/demo-smoke-test.sh
```

This validates: auth -> project create -> transcript ingest -> action-centre suggestions -> accept -> activity feed.

---

## Key Commands

```bash
# --- Local Development (requires Docker for Postgres + Redis) ---
docker compose up -d                # Start Postgres + Redis
npm run api:dev                     # Fastify API on :8080
npm run worker:dev                  # BullMQ worker
npm run web:dev                     # Next.js on :3000

# --- Build ---
npm run api:build                   # Build API + all package deps
npm run worker:build                # Build worker + all package deps
npm run web:build                   # Build frontend (also: vercel-build)

# --- Database ---
npm run db:migrate                  # Run migrations
npm run db:seed                     # Seed demo data
npm run db:reset                    # Nuke and recreate (Docker)

# --- Tests ---
npm run api:test                    # Vitest — 36 API integration tests
npm run worker:test                 # Vitest — 2 worker tests
# No frontend tests exist yet

# --- Type checking ---
npx tsc --noEmit -p apps/web/tsconfig.json    # Frontend types
npx tsc --noEmit -p apps/api/tsconfig.json    # API types
```

---

## Architecture Invariants

These are things that must stay true. Violating them causes production bugs.

- **API and Worker must share the same `DATABASE_URL`** or action-centre data drifts.
- **`@fastify/jwt` has no namespace option** — removing namespace was a critical fix. Adding it back causes 500 on login.
- **Transcript processing happens in the worker**, not the API. The API route just enqueues a `canonical_event.created` job.
- **Session cookie (`larry_session`)** contains the API access token inside it. The web proxy (`apps/web/src/lib/workspace-proxy.ts`) handles proactive JWT refresh.
- **All AI calls go through `packages/ai`** — never call model APIs directly from apps.
- **Canonical events are the single ingest path.** All external signals (Slack, Calendar, Email, Transcript) normalize to `canonical_events` before reaching the intelligence engine.

---

## Test Accounts

| Field    | Value |
|----------|-------|
| Email    | `sarah@larry.local` (or `dev@larry.local`) |
| Password | `DevPass123!` |
| Tenant   | `11111111-1111-4111-8111-111111111111` |

The login page has a **Dev Login** bypass button for local development.

---

## Git & CI

- Main branch: `master`
- Remote: `Loouuiis/larry-site` on GitHub
- CI: GitHub Actions — "Backend CI" runs vitest on push
- Vercel auto-deploys frontend from `master`
- Railway auto-deploys API + Worker from `master`

---

## Don't

- Don't add `namespace` to the `@fastify/jwt` plugin registration.
- Don't put `output: "standalone"` in `next.config.ts` — breaks Vercel deployment.
- Don't call AI model APIs directly — always go through `packages/ai`.
- Don't assume local testing is possible — verify against production.
- Don't read every doc at session start — use the routing table above.
