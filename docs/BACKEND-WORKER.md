# Larry - Worker Runtime

## Overview

BullMQ worker at `apps/worker/src/worker.ts`. Queue name: `larry-events`.

## Active Job Types

| Job Name | Description |
|----------|-------------|
| `canonical_event.created` | Handles canonical event-driven Larry processing by source type |
| `larry.scan` | Scheduled scan across active projects |
| `escalation.scan` | Periodic escalation notifications |
| `calendar.webhook.renew` | Google Calendar watch renewal |

## Canonical Event Processing

`POST /v1/larry/transcript` is queue-only on the API path; transcript intelligence and Larry event writes execute only in worker `canonical_event.created`.

For each `canonical_event.created` job in `apps/worker/src/canonical-event.ts`:
1. Load canonical event row.
2. Resolve project scope from payload/mappings.
3. Skip when scope is missing or invalid.
4. Build a source-aware prompt.
5. Run `runIntelligence()`.
6. Persist governed Larry actions through `runAutoActions()` and `storeSuggestions()`:
   - `runAutoActions()` now enforces tenant policy + authority checks and policy-routes disallowed auto actions into approval suggestions.
   - This keeps chat, login briefing, connector signals, and scheduled scans on one execution-policy path.
7. Persist one `project_memory_entries` row for transcript/email/slack/calendar with canonical source labels when scope resolves.
8. Enforce replay safety by source linkage checks before writing duplicate actions; memory writes are additionally deduped on `(tenant_id, project_id, source_kind, source_record_id, content_hash)`.

Supported source handlers:
- Transcript
- Email
- Calendar
- Slack

## Scheduler Notes

- `larry.scan` repeats every 4 hours.
- `escalation.scan` repeats hourly.
- `calendar.webhook.renew` repeats every 5 days.

Stable `jobId` values are used for repeatable jobs to avoid duplicate schedule registration after restarts.

## Operational Invariants

- API and Worker must use the same `DATABASE_URL`.
- Build and restart worker after runtime changes.
- Keep queue contracts aligned with `@larry/shared` message types.
