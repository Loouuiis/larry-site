# Larry — Backend API

## Overview

Fastify v5 REST API at `apps/api/`. All product routes live under `/v1/`.
Entry: `apps/api/src/server.ts` | Routes: `apps/api/src/routes/v1/index.ts`

## Route Files

| File | Routes |
|------|--------|
| `auth.ts` | `POST /v1/auth/login`, `/refresh`, `/logout`, `GET /v1/auth/me` |
| `projects.ts` | CRUD `/v1/projects`, `GET /v1/projects/:id/timeline` |
| `tasks.ts` | CRUD `/v1/tasks` |
| `ingest.ts` | `POST /v1/ingest` — delegates to shared ingest pipeline |
| `agent.ts` | `POST /v1/agent/runs`, `GET /v1/agent/runs/:id`, `GET /v1/agent/actions`, `POST /v1/agent/actions/:id/correct` |
| `actions.ts` | `GET /v1/actions`, `POST /v1/actions/:id/approve`, `/reject`, `/override` |
| `larry.ts` | `POST /v1/larry/commands` — command ingress (create_plan, update_scope, request_summary, draft_follow_up, freeform) |
| `reporting.ts` | `GET /v1/projects/:id/health`, `/weekly-summary`, `/outcomes` |
| `activity.ts` | `GET /v1/activity` |
| `orgs.ts` | `POST /v1/orgs/request`, `GET /v1/admin/orgs/requests`, `POST /v1/admin/orgs/:id/approve` |
| `connectors-slack.ts` | `/v1/connectors/slack/install-url`, `/callback`, `/events`, `/status` |
| `connectors-google-calendar.ts` | `/v1/connectors/google-calendar/install-url`, `/callback`, `/status`, `/watch`, `/webhook` |
| `connectors-email.ts` | `/v1/connectors/email/status`, `/install-url`, `/callback`, `/inbound`, `/draft/send` |

## Key Service Files

| File | Purpose |
|------|---------|
| `services/queue.ts` | BullMQ job publisher — publishes to `larry-events` |
| `services/ingest/pipeline.ts` | Shared ingest pipeline (normalise → queue) |
| `services/connectors/slack.ts` | Slack service logic |
| `services/connectors/google-calendar.ts` | Google Calendar service logic |
| `plugins/security.ts` | Fastify JWT plugin registration (no `namespace` option — critical) |

## Non-Negotiables

These must never be violated:

1. **Multi-tenant isolation** — every DB query must include `tenant_id`. Use `fastify.db.queryTenant(tenantId, ...)` not raw queries.
2. **Audit trail** — all high-value mutations (project/task create/update, approvals, state transitions) must write to `audit_log`.
3. **Approval-gated high-impact actions** — any action with confidence < 0.75 or touching deadline/ownership/scope must be `state = 'pending'` until approved.
4. **Explainability** — persist `reasoning` and `interventions` JSON on `extracted_actions`.

## Action Execution Paths (on approval)

When `POST /v1/actions/:id/approve` is called, the API checks `actionType` and executes:

| Action Type | Execution |
|------------|-----------|
| `project_create` | INSERT into `projects` + seed `tasks` from payload |
| `task_update` | UPDATE `tasks` SET status/priority/dueDate |
| `task_create` | INSERT into `tasks` |
| `email_draft` | Send email via email service |
| `follow_up` | Send follow-up to Slack DM or email |

After all pending actions for a run are reviewed: run auto-transitions `APPROVAL_PENDING → EXECUTED → VERIFIED`.

## Approval Loop Auto-Close

`actions.ts` — after approve/reject/override: if no remaining `pending` actions exist for the run, the run transitions:
```
APPROVAL_PENDING -> EXECUTED -> VERIFIED
```
Transition rows are written to `agent_run_transitions`. Audit entry: `agent.run.auto-verify`.

## Reporting Routes — Important Caveat

`GET /projects/:id/health` and `/outcomes` insert snapshot records on read. Dedup logic exists to prevent duplicate snapshots for the same `(tenant_id, project_id, DATE(NOW()))`. Do not remove this dedup guard.

## Working Rules

- Prefer extending `apps/api` + `apps/worker` for product backend work.
- Keep `apps/web` as temporary shell until cutover.
- Prioritise reliability/security over UI additions.
- If unsure about approval behaviour, preserve approval-gated default.
- Read the target file before editing — never edit blind.
