# Larry Backend Context (Read Before Work)

Last updated: 2026-03-12

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
2. Implement first production connector auth flow (Slack/Google).
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
- No Slack OAuth/webhook integration yet.
- No Google Calendar OAuth/webhook integration yet.
- No real connector credential vaulting/rotation flow yet.
- No integration/E2E suite that validates API->queue->worker->DB loop yet.
- No production deployment manifests for API/worker runtime yet (by design for Stage 1).

### Recommended Next Build Order
1. Implement connector #1 (Slack):
  - OAuth install flow, token storage, webhook verification, event mapping into `/v1/ingest/slack`
2. Implement connector #2 (Google Calendar):
  - OAuth flow, push notifications/watch renewal, event mapping into `/v1/ingest/calendar`
3. Expand worker handlers:
  - process canonical event jobs
  - process transcript extraction jobs
  - persist transitions, retries, and failure reasons
4. Add integration tests:
  - API publishes queue message
  - worker consumes and updates DB state
  - approval routing and audit logging checks

### Assumptions/Decisions To Preserve
- Keep Stage 1 infra simple even if AWS-ready abstractions exist.
- Use Neon + Redis now; defer RDS/ElastiCache/SQS to Stage 2.
- Preserve approval-gated high-impact actions.
- Prioritize developer velocity and local reproducibility over infrastructure completeness.
