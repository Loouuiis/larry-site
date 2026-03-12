# Larry Backend Context (Read Before Work)

Last updated: 2026-03-12

## Current Objective
- Build an enterprise-grade backend, DB, server, and AI-agent workflow stack for Larry.
- Frontend is not the current focus.

## Product Direction (Locked)
- Dedicated backend service (not Next.js API-first) in `backend/`.
- AWS-managed infra, EU-first residency, US option later.
- Postgres + pgvector direction (single DB with tenant-scoped model initially).
- Queue + state-machine workflow orchestration.
- OpenAI-first model provider with abstraction for future providers.
- Approval-gated autonomy first (Action Center), then increase autonomy over time.

## What Exists Today
- Legacy shell app in `frontend/src/` (Next.js) with lightweight auth/lead capture routes.
- New backend scaffold in `backend/` includes:
  - Fastify server + v1 routes (auth/projects/tasks/ingest/agent/actions/reporting)
  - Postgres schema + migration runner
  - Tenant/RBAC/audit foundations
  - Ingestion normalization, policy engine, risk scoring
  - Agent run state machine and action approval flow
  - OpenAPI starter contract and Terraform scaffolding
  - Unit tests for policy/risk/workflow/normalization

## Non-Negotiables
- Keep multi-tenant isolation strict (`tenant_id` + RLS path).
- Log important mutations to audit trail.
- High-impact or low-confidence actions require approval.
- Keep implementations explainable and reversible.

## Working Rules For Next Steps
- Prefer extending `backend/` for product backend work.
- Keep `frontend/` as temporary shell until cutover.
- Prioritize reliability/security over UI additions.
- If unsure, preserve approval-gated behavior.

## Immediate Next Priorities
1. Add async worker process for queue consumption and retries.
2. Implement first production connector auth flow (Slack/Google).
3. Add integration/E2E tests with Postgres test environment.
4. Harden IaC and deployment/secrets strategy for staging/prod.
