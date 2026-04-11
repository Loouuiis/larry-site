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

For each `canonical_event.created` job:
1. `apps/worker/src/handlers.ts` starts a runtime-attempt row in `canonical_event_processing_attempts` with status `running` (`attempt_number = attemptsMade + 1` and queue metadata).
2. `apps/worker/src/canonical-event.ts` loads canonical event row.
3. Resolve project scope from payload/mappings.
   - Calendar source uses payload `projectId` first, then installation channel mapping fallback (`google_calendar_installations.webhook_channel_id -> project_id`).
   - Slack source uses payload/event `projectId` first, then channel mapping fallback (`slack_channel_project_mappings`). On successful resolution from a hint, upserts the channel-to-project mapping for future lookups.
4. Skip when scope is missing or invalid. Skip writes for archived projects.
5. Build a source-aware prompt (email, calendar, slack) or extract tasks directly (transcript).
6. For email/calendar/slack: run `runIntelligence()`. For transcript: run `generateBootstrapFromTranscript()` (lightweight extraction, no full intelligence prompt).
7. Persist governed Larry actions:
   - Email/calendar/slack: `runAutoActions()` + `storeSuggestions()`. `runAutoActions()` enforces tenant policy + authority checks and policy-routes disallowed auto actions into approval suggestions.
   - Transcript: only `storeSuggestions()` (extracted tasks are stored as suggestions, no auto-actions).
   - This keeps chat, login briefing, connector signals, and scheduled scans on one execution-policy path.
8. Persist one `project_memory_entries` row for transcript/email/slack/calendar with canonical source labels when scope resolves.
9. Finalize runtime-attempt status in `handlers.ts`:
   - `succeeded` on successful completion
   - `retryable_failed` when the job throws and retries remain
   - `dead_lettered` when the throwing attempt reaches BullMQ max attempts
   - the worker rethrows to preserve native BullMQ retry/dead-letter behavior
10. Enforce replay safety by source linkage checks before writing duplicate actions; memory writes are additionally deduped on `(tenant_id, project_id, source_kind, source_record_id, content_hash)`.

Supported source handlers:
- Transcript
- Email
- Calendar
- Slack

## Scheduler Notes

- `larry.scan` repeats every 30 minutes.
- `escalation.scan` repeats hourly.
- `calendar.webhook.renew` repeats every 5 days.

Stable `jobId` values are used for repeatable jobs to avoid duplicate schedule registration after restarts.

## Operational Invariants

- API and Worker must use the same `DATABASE_URL`.
- Build and restart worker after runtime changes.
- Keep queue contracts aligned with `@larry/shared` message types.
