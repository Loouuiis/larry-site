# Larry Backend Context (Read Before Work)

Last updated: 2026-03-14

## Current Objective
- Build an enterprise-grade backend, DB, server, and AI-agent workflow stack for Larry.
- Frontend is not the current focus.

## Product Direction (Locked)
- Monorepo structure with explicit apps/packages split:
  - `apps/web`
  - `apps/api`
  - `apps/worker`
  - `packages/db`, `packages/shared`, `packages/ai`, `packages/config`
- AWS-managed infra, EU-first residency, US option later.
- Stage 1 infra simplification:
  - Neon Postgres target
  - BullMQ on Redis for queue
  - Minimal Terraform skeleton only
- Postgres + pgvector direction over time (single DB with tenant-scoped model initially).
- Queue + state-machine workflow orchestration, starting with BullMQ.
- OpenAI-first model provider with abstraction for future providers.
- Approval-gated autonomy first (Action Center), then increase autonomy over time.

## What Exists Today
- Legacy shell app in `apps/web/src/` (Next.js) with lightweight auth/lead capture routes.
- API scaffold in `apps/api/` includes:
  - Fastify server + v1 routes (auth/projects/tasks/ingest/agent/actions/reporting)
  - Postgres schema + migration runner via `packages/db`
  - Tenant/RBAC/audit foundations
  - Ingestion normalization, policy engine, risk scoring
  - Agent run state machine and action approval flow
  - OpenAPI starter contract
  - Unit tests for policy/risk/workflow/normalization
- Worker scaffold in `apps/worker/` for async queue processing.
- Minimal Terraform skeleton in `infrastructure/terraform`.

## Non-Negotiables
- Keep multi-tenant isolation strict (`tenant_id` + RLS path).
- Log important mutations to audit trail.
- High-impact or low-confidence actions require approval.
- Keep implementations explainable and reversible.

## Working Rules For Next Steps
- Prefer extending `apps/api` + `apps/worker` for product backend work.
- Keep `apps/web` as temporary shell until cutover.
- Prioritize reliability/security over UI additions.
- If unsure, preserve approval-gated behavior.

## Immediate Next Priorities
1. Wire more queue handlers in worker for transcript and canonical event flows.
2. Implement second production connector auth flow (Google Calendar).
3. Add integration/E2E tests with Postgres + Redis local stack.
4. Expand Terraform from skeleton to managed AWS services in Stage 2.

## Session Handoff (Extensive)

### User Intent Locked In This Chat
- Move from mixed repo layout to clear monorepo architecture:
  - `apps/web`
  - `apps/api`
  - `apps/worker`
  - `packages/db`, `packages/shared`, `packages/ai`, `packages/config`
  - `infrastructure` (minimal for Stage 1)
- Stage 1 infra must stay simple:
  - Neon Postgres target
  - BullMQ on Redis only (no SQS yet)
  - Minimal Terraform skeleton only (no full AWS provisioning yet)
- Focus only on backend/db/server/agent workflows for now.

### What Was Implemented Today
- Repo was restructured to monorepo:
  - frontend moved to `apps/web`
  - backend API moved/refactored to `apps/api`
  - worker scaffold created at `apps/worker`
  - shared package layer created under `packages/*`
- Shared packages created:
  - `packages/shared`: domain/queue types
  - `packages/config`: env parsing (`getApiEnv`, `getWorkerEnv`)
  - `packages/db`: Postgres client + migration runner + schema
  - `packages/ai`: LLM provider abstraction, policy logic, risk scoring
- API updated to consume shared packages:
  - API uses `@larry/db`, `@larry/config`, `@larry/ai`, `@larry/shared`
  - Queue publisher switched to BullMQ/Redis in API
- Worker scaffold added:
  - BullMQ worker consumes queue (`larry-events`)
  - initial handler for `agent_run.ingested` job added
- Local stack file added:
  - `docker-compose.yml` for Postgres + Redis
- Terraform reduced to Stage 1 skeleton:
  - `infrastructure/terraform/environments/dev` has placeholder provider/layout only
  - prior heavy draft infra moved to archive path:
    - `infrastructure/_archive/terraform-legacy`
- Root scripts updated to monorepo commands:
  - `web:*`, `api:*`, `worker:*`, `db:migrate`

### Verification Results
- Passed:
  - `npm run api:build`
  - `npm run api:test` (8 tests passed)
  - `npm run worker:build`
  - `npm run web:build`
- Worker env loader updated:
  - `apps/worker/src/worker.ts` now loads env from these candidates in order:
    1. `.env` from current working directory
    2. `apps/worker/.env`
    3. `apps/api/.env` (fallback for local convenience)
- Worker env file created for local runtime:
  - `apps/worker/.env` copied from `apps/api/.env` so `DATABASE_URL` and `REDIS_URL` are explicitly available to worker startup.
- Neon connectivity test:
  - Success (`SELECT 1`) using env in `apps/api/.env`
  - `apps/.env` did not exist when tested
- Not verified in this environment:
  - `docker compose up -d` (Docker CLI not installed in runtime environment)
  - live local Postgres/Redis bring-up and end-to-end queue processing

### Important Current Paths
- API entry: `apps/api/src/server.ts`
- API queue publisher: `apps/api/src/services/queue.ts`
- Worker entry: `apps/worker/src/worker.ts`
- DB schema: `packages/db/src/schema.sql`
- DB migrate: `packages/db/src/migrate.ts`
- Shared queue type: `packages/shared/src/index.ts` (`EVENT_QUEUE_NAME`)
- Terraform skeleton: `infrastructure/terraform/environments/dev/main.tf`

### Env/File Conventions (Current)
- `apps/web/.env.local` -> frontend shell
- `apps/api/.env` -> API runtime env
- `apps/worker/.env` -> worker runtime env
- `DATABASE_URL` should point to Neon in API/worker envs for Stage 1
- `REDIS_URL` required by API + worker for BullMQ

### What Is Not Done Yet (Critical Gaps)
- Worker does not yet implement full agent lifecycle jobs (only baseline ingestion handler).
- No Google Calendar OAuth/webhook integration yet.
- No real connector credential vaulting/rotation flow yet.
- No integration/E2E suite that validates API->queue->worker->DB loop yet.
- No production deployment manifests for API/worker runtime yet (by design for Stage 1).

### Recommended Next Build Order
1. Implement connector #2 (Google Calendar):
  - OAuth flow, push notifications/watch renewal, event mapping into `/v1/ingest/calendar`
2. Expand worker handlers:
  - process canonical event jobs
  - process transcript extraction jobs
  - persist transitions, retries, and failure reasons
3. Add integration tests:
  - API publishes queue message
  - worker consumes and updates DB state
  - approval routing and audit logging checks

### Assumptions/Decisions To Preserve
- Keep Stage 1 infra simple even if AWS-ready abstractions exist.
- Use Neon + Redis now; defer RDS/ElastiCache/SQS to Stage 2.
- Preserve approval-gated high-impact actions.
- Prioritize developer velocity and local reproducibility over infrastructure completeness.

## 2026-03-14 Session Update

### User onboarding/auth context
- The API currently has login/refresh/me/logout, but no signup route yet.
- First-time login requires seeded records in `tenants`, `users`, and `memberships`.
- The previous sample tenant ID (`11111111-1111-1111-1111-111111111111`) is rejected by API validation because it is not an RFC variant UUID accepted by `z.string().uuid()`.
- Working dev tenant ID seeded for local testing:
  - `11111111-1111-4111-8111-111111111111`
- Working dev user seeded:
  - email: `dev@larry.local`
  - role: `admin`
  - user id: `22222222-2222-2222-2222-222222222222`

### Auth bug fixed
- File: `apps/api/src/plugins/security.ts`
- Change: removed JWT `namespace` option during `@fastify/jwt` registration.
- Reason: auth code uses `app.jwt.sign(...)`; with namespace enabled, that method was not present and login returned `500` (`app.jwt.sign is not a function`).
- Result: `/v1/auth/login` now returns tokens successfully with seeded credentials.

### Verified state
- Worker starts successfully with env loaded:
  - `[worker] started queue=larry-events concurrency=5`
- Login flow now verified against running local API:
  - `POST /v1/auth/login` -> success (access token returned).
- Agent run smoke test now verified:
  - `POST /v1/agent/runs` with transcript succeeds and returns state `APPROVAL_PENDING`.
  - `GET /v1/agent/runs/{id}` and `GET /v1/agent/actions?state=pending` are now usable after successful run creation.
- Approval flow verified:
  - `POST /v1/actions/{id}/approve` succeeds for pending actions and transitions state to `approved`.

### Agent route SQL fix (2026-03-14)
- File: `apps/api/src/routes/v1/agent.ts`
- Issue seen in user smoke test:
  - Postgres `42P08` "inconsistent types deduced for parameter $10" during action insert.
- Root cause:
  - Query reused `$10` (enum-like `state`) both as inserted state and text comparison in `CASE`.
- Fix:
  - `executed_at` now uses `CASE WHEN $11 = false THEN NOW() ELSE NULL END` (based on `requires_approval` boolean) to avoid mixed parameter typing.

### Slack connector implemented (2026-03-14)
- New route file:
  - `apps/api/src/routes/v1/connectors-slack.ts`
- New service file:
  - `apps/api/src/services/connectors/slack.ts`
- New reusable ingest pipeline service:
  - `apps/api/src/services/ingest/pipeline.ts`
- Ingest route refactor:
  - `apps/api/src/routes/v1/ingest.ts` now delegates to shared ingest pipeline service.
- DB schema additions:
  - `slack_installations` table added in `packages/db/src/schema.sql`
  - Tenant isolation policy + system lookup policy (`app.tenant_id='__system__'`) added for webhook workspace->tenant resolution.
- New endpoints:
  - `GET /v1/connectors/slack/install-url` (auth `admin|pm`)
  - `GET /v1/connectors/slack/callback` (Slack OAuth redirect target)
  - `POST /v1/connectors/slack/events` (signature-verified Slack Events webhook)
  - `GET /v1/connectors/slack/status` (auth)
- Env schema additions in `packages/config/src/index.ts`:
  - `SLACK_CLIENT_ID`
  - `SLACK_CLIENT_SECRET`
  - `SLACK_REDIRECT_URI`
  - `SLACK_SIGNING_SECRET`
  - `SLACK_BOT_SCOPES`
  - `SLACK_SIGNATURE_TOLERANCE_SECONDS`
- Verified:
  - `npm run api:test` now passes with 10 tests (new Slack signature test included).
  - `npm run db:migrate` succeeded after schema updates.
  - `GET /v1/connectors/slack/install-url` route reachable and returns expected configuration error (`424`) when Slack env vars are not yet set.
- Not yet verified end-to-end:
  - Live Slack OAuth callback and live Slack Events webhook delivery (requires real Slack app credentials + public HTTPS callback/events URL such as ngrok/Cloudflare tunnel).
