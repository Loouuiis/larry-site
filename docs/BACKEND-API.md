# Larry - Backend API

## Overview

Fastify v5 REST API at `apps/api/`. Product routes are registered in `apps/api/src/routes/v1/index.ts`.

## Route Files

| File | Primary Routes |
|------|----------------|
| `auth.ts` | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `GET /v1/auth/me` |
| `projects.ts` | CRUD ` /v1/projects` and project timeline/health utilities |
| `project-intake.ts` | `POST /v1/projects/intake/drafts`, `POST /v1/projects/intake/drafts/:id/bootstrap`, `POST /v1/projects/intake/drafts/:id/finalize` |
| `tasks.ts` | CRUD `/v1/tasks` and task status/dependency helpers |
| `ingest.ts` | `POST /v1/ingest/slack`, `/email`, `/calendar`, `/transcript` (transcript shim) |
| `larry.ts` | `POST /v1/larry/chat`, `GET /v1/larry/briefing`, `GET /v1/larry/action-centre`, `GET /v1/larry/memory`, `POST /v1/larry/events/:id/accept`, `POST /v1/larry/events/:id/dismiss`, `POST /v1/larry/transcript` |
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
- `GET /v1/larry/memory?projectId=&sourceKind=&limit=`
- `POST /v1/larry/events/:id/accept`
- `POST /v1/larry/events/:id/dismiss`
- `POST /v1/larry/transcript`
- `POST /v1/larry/transcript` is queue-only: it persists canonical ingest metadata and meeting linkage, returns `202`, and defers intelligence/action execution to worker `canonical_event.created`.
- `POST /v1/larry/chat` and `POST /v1/larry/events/:id/accept` write durable rows into `project_memory_entries` for project timeline context.
- `POST /v1/larry/chat` applies a clarification-first gate for ambiguous mutation requests and returns a clarification reply without executing/storing actions when task target/details are under-specified.
- `POST /v1/larry/chat` response `suggestionCount` includes both:
  - actions produced directly as suggestions by intelligence, and
  - actions originally classified as auto but policy-routed to approval.
- Worker-driven `canonical_event.created` handling for transcript/email/slack/calendar now also writes `project_memory_entries` rows when project scope resolves.
- Project memory writes with non-null `source_record_id` are replay-safe via `(tenant_id, project_id, source_kind, source_record_id, content_hash)` dedup semantics.

Compatibility and retirement behavior:
- `POST /v1/ingest/transcript` proxies to `/v1/larry/transcript` and returns deprecation metadata.
- `POST /v1/larry/conversations` and `POST /v1/larry/conversations/:id/messages` return `410`.
- `GET /v1/larry/events` returns `410` and points callers to `/v1/larry/action-centre`.

## Unified Project Intake Contracts

- `POST /v1/projects/intake/drafts`
  - Create or update a durable intake draft for `manual`, `chat`, or `meeting` mode.
- `POST /v1/projects/intake/drafts/:id/bootstrap`
  - Generates chat bootstrap preview (`summary`, `tasks`, `actions`, `seedMessage`) without requiring an existing project.
- `POST /v1/projects/intake/drafts/:id/finalize`
  - `manual` / `chat`: create project, create starter tasks, write project memory entry, and persist non-task suggestions to Action Centre.
  - `meeting` + create-new: create project and enqueue canonical transcript ingest.
  - `meeting` + attach-existing: enqueue canonical transcript ingest directly to selected project without project insert.
- Intake responses return a canonical draft shape:
  - `draft.id`, `draft.mode`, `draft.status`
  - `draft.project` (`name`, `description`, `startDate`, `targetDate`, `attachToProjectId`)
  - `draft.chat.answers`
  - `draft.meeting` (`meetingTitle`, `transcriptPresent`)
  - `draft.bootstrap` (`summary`, `tasks`, `actions`, `seedMessage`)
  - `draft.finalized` (`projectId`, `meetingNoteId`, `canonicalEventId`, `finalizedAt`)
- Existing contracts remain unchanged:
  - `POST /v1/projects`
  - `POST /v1/larry/chat`
  - `POST /v1/larry/transcript`

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
