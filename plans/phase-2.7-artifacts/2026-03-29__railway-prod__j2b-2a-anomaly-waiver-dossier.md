# Phase 2.7 J2b-2a Anomaly Waiver Dossier (Railway Prod)

- Date (UTC): `2026-03-29`
- Environment: `railway-prod`
- Tenant: `11111111-1111-4111-8111-111111111111`
- Slice: `J2b-2a` baseline with `J2b-2b` pre-check sign-off update (no destructive migration execution)
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

## Anomaly Triage Matrix

| Anomaly code | Severity | Current count | Rationale | Decision | Owner | Reviewer | Due date (UTC) | Approval status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `missing_source_record_links` | high | `chat=14`, `schedule=145` (`total=159`) | Historical rows generated before full source linkage enforcement reached deployed target. No increase on J2b-2b pre-check. | Waive existing rows; block on any post-baseline growth. | `Fergus` | `[pending-reviewer]` | `2026-03-31` | `blocked (reviewer pending)` |
| `invalid_chat_linkage` | high | `14` | Same historical chat-origin cohort as missing source-record links; all rows are pre-baseline and unchanged at pre-check. | Waive existing rows; block on any post-baseline growth. | `Fergus` | `[pending-reviewer]` | `2026-03-31` | `blocked (reviewer pending)` |
| `meeting_action_count_mismatch` | medium | `5` | Legacy meeting notes with non-zero `action_count` and zero canonical meeting-linked events; unchanged at pre-check. | Waive existing rows for retirement gate; track optional reconciliation separately. | `Fergus` | `[pending-reviewer]` | `2026-03-31` | `blocked (reviewer pending)` |

## Explicit Waiver Rule (Gate Policy)

Only pre-existing anomalies at or before baseline timestamp `2026-03-29T22:25:35.771Z` are eligible for waiver in J2b-2b.

J2b-2b execution must be blocked if any of the following occur in a pre-window recheck:

1. New `chat` or `schedule` rows with `source_record_id IS NULL` after baseline timestamp.
2. New `chat` rows missing required chat linkage (`conversation_id`, `request_message_id`, `response_message_id`, `requested_by_user_id`) after baseline timestamp.
3. Any anomaly count increase above this dossier's baseline values.
4. Owner/reviewer approval fields remain pending.

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
- Reviewer: `[pending-reviewer]`
- Rollback owner: `Fergus`
- Decision (`approved`/`blocked`): `blocked`
- Decision timestamp (UTC): `2026-03-29T22:43:10.868Z`
- Notes: `J2b-2b pre-checks passed (rehearsal ok, growth gate zero, FK/table baseline confirmed), but destructive A/B/C/D/E execution remains blocked until reviewer assignment/sign-off is completed.`
