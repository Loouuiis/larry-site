# Phase 2.7 J2b-2a Anomaly Waiver Dossier (Railway Prod)

- Date (UTC): `2026-03-29`
- Environment: `railway-prod`
- Tenant: `11111111-1111-4111-8111-111111111111`
- Slice: `J2b-2a` baseline with `J2b-2b` pre-check sign-off + `J2b-2e` blocked attempt + `2026-03-30` post-parity rebaseline/execution closure
- Baseline recheck timestamp (UTC): `2026-03-29T22:25:35.771Z`

## Evidence References

- Baseline blocked rehearsal:
  - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.{json,md}`
- Post-M0 aligned rehearsal:
  - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.{json,md}`
- J2b-1 baseline notes:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-1-notes.md`
- J2b-2a read-only recheck:
  - Executed with temp output (`status=ok`; counts unchanged from aligned baseline).
- J2b-2b committed pre-check rehearsal artifact:
  - `plans/phase-2.7-artifacts/2026-03-29T22-43-10-868Z__railway-prod__deployed-preflight-j2b-2b-gate__11111111.{json,md}`
- J2b-2b pre-check SQL evidence notes:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2b-precheck-notes.md`
- J2b-2e live-window precheck artifact:
  - `plans/phase-2.7-artifacts/2026-03-30T15-11-51-707Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.{json,md}`
- J2b-2e live-window execute attempt artifacts:
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute__11111111.{json,md}`
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute-precheck__11111111.{json,md}`
- J2b-2e deployment sync evidence:
  - API (`larry-site`) deployment `65d6d39d-a2d2-4589-86f7-3c6d7d23030a` (`SUCCESS`)
  - Worker (`diplomatic-vitality`) deployment `8fd8b154-c912-4f5f-8f07-55222b4637f0` (`SUCCESS`)
  - `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` unset on both services.
- Post-parity closure deployments:
  - API (`larry-site`) deployment `0bf692df-2f4c-4a5a-a720-e6b883d68d89` (`SUCCESS`)
  - Worker (`diplomatic-vitality`) deployment `4e8a8540-2935-41e5-9f3f-c0429b764fbc` (`SUCCESS`)
- Post-parity baseline + window artifacts:
  - Baseline timestamp: `2026-03-30T16:34:27.349Z`
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-41-750Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.{json,md}` (`final_decision=precheck_passed`)
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-52-288Z__railway-prod__phase-2-7-retirement-window-execute-precheck__11111111.{json,md}`
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-52-288Z__railway-prod__phase-2-7-retirement-window-execute__11111111.{json,md}` (`final_decision=executed`, `destructive_sql_executed=yes`)

## Anomaly Triage Matrix

| Anomaly code | Severity | Current count | Rationale | Decision | Owner | Reviewer | Due date (UTC) | Approval status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `missing_source_record_links` | high | `chat=14`, `schedule=201` (`total=215`) | Historical cohorts remain present; post-parity rebaseline (`2026-03-30T16:34:27.349Z`) produced zero growth-gate deltas and execute completed. | Waive historical rows; monitor separately from retirement window gating. | `Fergus` | `Fergus-temp` | `2026-03-31` | `approved (post-parity growth gate passed)` |
| `invalid_chat_linkage` | high | `14` | Historical chat-origin cohort remains unchanged through execute-precheck run. | Waive existing rows; track cleanup separately. | `Fergus` | `Fergus-temp` | `2026-03-31` | `approved` |
| `meeting_action_count_mismatch` | medium | `5` | Legacy meeting note mismatches unchanged through execute-precheck run. | Waive existing rows for retirement gate; track optional reconciliation separately. | `Fergus` | `Fergus-temp` | `2026-03-31` | `approved` |

## Explicit Waiver Rule (Gate Policy)

Only pre-existing anomalies at or before baseline timestamp `2026-03-29T22:25:35.771Z` are eligible for waiver in J2b-2b.

J2b-2b execution must be blocked if any of the following occur in a pre-window recheck:

1. New `chat` or `schedule` rows with `source_record_id IS NULL` after baseline timestamp.
2. New `chat` rows missing required chat linkage (`conversation_id`, `request_message_id`, `response_message_id`, `requested_by_user_id`) after baseline timestamp.
3. Any anomaly count increase above this dossier's baseline values.
4. Deploy-safe API/worker sync and in-window rerun must be complete before evaluating growth/FK gates.

J2b-2e update:

- Deploy-safe API/worker sync and in-window rerun are now complete.
- Gate remains blocked because growth-gate query now returns:
  - `new_chat_missing_source_record = 0`
  - `new_schedule_missing_source_record = 49`
  - `new_invalid_chat_linkage = 0`
- Execute-mode runner attempt also returned `blocked`; no destructive SQL was executed.

Post-parity closure update (`2026-03-30`):

- Rebaseline timestamp reset to `2026-03-30T16:34:27.349Z` immediately after parity verification.
- Precheck returned `final_decision=precheck_passed` with growth-gate deltas all `0`.
- Execute returned `final_decision=executed`, `destructive_sql_executed=yes`.
- Postcheck confirmed A/B/C dependencies detached and D/E legacy target tables retired.

## Growth-Gate Query (Pre-Window)

```sql
SELECT
  COUNT(*) FILTER (WHERE source_kind = 'chat' AND source_record_id IS NULL AND created_at > '2026-03-29T22:25:35.771Z') AS new_chat_missing_source_record,
  COUNT(*) FILTER (WHERE source_kind = 'schedule' AND source_record_id IS NULL AND created_at > '2026-03-29T22:25:35.771Z') AS new_schedule_missing_source_record,
  COUNT(*) FILTER (
    WHERE source_kind = 'chat'
      AND (
        conversation_id IS NULL
        OR request_message_id IS NULL
        OR response_message_id IS NULL
        OR requested_by_user_id IS NULL
      )
      AND created_at > '2026-03-29T22:25:35.771Z'
  ) AS new_invalid_chat_linkage
FROM larry_events
WHERE tenant_id = '11111111-1111-4111-8111-111111111111';
```

Expected pass condition: all returned values are `0`.

## Sign-Off

- Engineer: `Fergus`
- Reviewer: `Fergus (temporary)`
- Rollback owner: `Fergus`
- Decision (`approved`/`blocked`): `approved`
- Decision timestamp (UTC): `2026-03-30T16:35:30.000Z`
- Notes: `Post-parity baseline reset and in-window runner completed successfully (precheck_passed -> executed). FK detached state accepted by policy, growth-gate deltas were zero for the new baseline, and destructive retirement stages completed with passing postcheck.`
