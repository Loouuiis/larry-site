# Larry - Backend API

## Overview

Fastify v5 REST API at `apps/api/`. Product routes are registered in `apps/api/src/routes/v1/index.ts`.

## Route Files

| File | Primary Routes |
|------|----------------|
| `auth.ts` | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `GET /v1/auth/me` |
| `projects.ts` | CRUD ` /v1/projects` and project timeline/health utilities |
| `tasks.ts` | CRUD `/v1/tasks` and task status/dependency helpers |
| `ingest.ts` | `POST /v1/ingest/slack`, `/email`, `/calendar`, `/transcript` (transcript shim) |
| `larry.ts` | `POST /v1/larry/chat`, `GET /v1/larry/briefing`, `GET /v1/larry/action-centre`, `POST /v1/larry/events/:id/accept`, `POST /v1/larry/events/:id/dismiss`, `POST /v1/larry/transcript` |
| `meetings.ts` | Meeting read surfaces and meeting data contracts |
| `notifications.ts` | Workspace notification reads/mutations |
| `activity.ts` | `GET /v1/activity` |
| `reporting.ts` | Project reporting routes |
| `orgs.ts` | Organization access request/admin approval routes |
| `connectors-slack.ts` | Slack connector install/status/events |
| `connectors-google-calendar.ts` | Google Calendar connector install/status/watch/webhook |
| `connectors-email.ts` | Email connector status/install/inbound/send |

## Canonical Larry Contracts

- `POST /v1/larry/chat`
- `GET /v1/larry/briefing`
- `GET /v1/larry/action-centre`
- `POST /v1/larry/events/:id/accept`
- `POST /v1/larry/events/:id/dismiss`
- `POST /v1/larry/transcript`
- `POST /v1/larry/transcript` is queue-only: it persists canonical ingest metadata and meeting linkage, returns `202`, and defers intelligence/action execution to worker `canonical_event.created`.

Compatibility and retirement behavior:
- `POST /v1/ingest/transcript` proxies to `/v1/larry/transcript` and returns deprecation metadata.
- `POST /v1/larry/conversations` and `POST /v1/larry/conversations/:id/messages` return `410`.
- `GET /v1/larry/events` returns `410` and points callers to `/v1/larry/action-centre`.

## Non-Negotiables

1. Multi-tenant isolation: use tenant-scoped DB access patterns.
2. Audit coverage: high-value mutations write to `audit_log`.
3. Canonical Larry path: new behavior uses the `/v1/larry/*` runtime contracts.
4. Ledger provenance: requester/source linkage must be preserved for Larry events.

## Key Service Files

- `apps/api/src/services/queue.ts`
- `apps/api/src/services/ingest/pipeline.ts`
- `apps/api/src/lib/larry-ledger.ts`
- `apps/api/src/services/larry-briefing.ts`
