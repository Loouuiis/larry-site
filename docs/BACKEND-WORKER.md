# Larry — Worker & Agent Lifecycle

## Overview

BullMQ worker at `apps/worker/src/worker.ts`. Consumes jobs from the `larry-events` Redis queue. Processes async tasks including the full agent lifecycle.

## Job Types

| Job Name | Description |
|----------|-------------|
| `agent_run.ingested` | Full lifecycle processing: normalise → extract → propose → gate → persist |
| `canonical_event.created` | Triggered when a new canonical event is created; creates/resumes agent runs |

## Agent Run State Machine

```
INGESTED
  → NORMALIZED    (event payload normalised to canonical form)
  → EXTRACTED     (actionable text extracted)
  → PROPOSED      (actions proposed by LLM)
  → APPROVAL_PENDING  (actions gated for human review)
     or
  → EXECUTED      (auto-executed low-confidence actions)
  → VERIFIED      (all actions resolved)
```

State transitions are persisted to `agent_run_transitions`. Failures capture reason + retry count.

## Worker Logic (worker.ts)

For each `canonical_event.created` job:
1. Fetch canonical event from DB
2. Filter noise events (Slack subtypes: `bot_message`, `channel_join`, `channel_leave`, `message_changed`, `message_deleted` — skip these)
3. `extractActionableText(event)` — source-aware parsing (Slack/email/calendar/transcript)
4. If no actionable text → skip run creation
5. Create/resume `agent_runs` row with `source_ref_id = canonical_event.id`
6. Call `packages/ai` `extractActions()` → list of proposed `ExtractedAction`
7. For each action: call `evaluateActionPolicy()` → `requires_approval` boolean
8. Persist to `extracted_actions` with `state = 'pending'` or `'executed'`
9. Persist `reasoning` and `interventions` JSON per action
10. Transition run to `APPROVAL_PENDING` or `EXECUTED`

## Background Jobs

| File | Purpose |
|------|---------|
| `apps/worker/src/calendar-renewal.ts` | Renews Google Calendar push watch channels before expiry. Must include `token` field in renewal request to match initial registration — missing token causes webhook auth failures after 7 days. |
| `apps/worker/src/escalation.ts` | Periodic escalation notifications. Uses `ON CONFLICT ON CONSTRAINT uq_notifications_dedup DO NOTHING` to prevent duplicate escalation spam. |

## Queue Config

- Queue name: `larry-events` (from `packages/shared` `EVENT_QUEUE_NAME`)
- Published by: `apps/api/src/services/queue.ts`
- Concurrency: 5 workers
- Worker env loads `.env` from: `apps/worker/.env` → fallback `apps/api/.env`

## Key Invariants

- Worker must share the same `DATABASE_URL` as the API. Mismatched DBs cause actions to be invisible in the Action Centre.
- Restart worker after code changes: `npm run worker:dev`
- Build before deploying: `npm run worker:build`
