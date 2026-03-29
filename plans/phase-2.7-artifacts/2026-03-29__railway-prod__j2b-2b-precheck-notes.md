# Phase 2.7 J2b-2b Pre-Check Notes (Railway Prod)

- Date (UTC): `2026-03-29`
- Environment: `railway-prod`
- Tenant: `11111111-1111-4111-8111-111111111111`
- Gate checkpoint: `2026-03-29T22:43:10.868Z`

## Rehearsal Artifact

- `plans/phase-2.7-artifacts/2026-03-29T22-43-10-868Z__railway-prod__deployed-preflight-j2b-2b-gate__11111111.{json,md}`
- Status: `ok`
- Canonical preflight: `passed`
- Anomaly counts unchanged from J2b-2a baseline:
  - `missing_source_record_links`: `chat=14`, `schedule=145`
  - `invalid_chat_linkage`: `14`
  - `meeting_action_count_mismatch`: `5`

## Growth-Gate Query Result

Baseline timestamp: `2026-03-29T22:25:35.771Z`

```json
{
  "new_chat_missing_source_record": "0",
  "new_schedule_missing_source_record": "0",
  "new_invalid_chat_linkage": "0"
}
```

## FK Baseline Result (A/B/C)

```json
[
  {
    "table_name": "correction_feedback",
    "column_name": "action_id",
    "references_table": "extracted_actions",
    "constraint_name": "correction_feedback_action_id_fkey"
  },
  {
    "table_name": "email_outbound_drafts",
    "column_name": "action_id",
    "references_table": "extracted_actions",
    "constraint_name": "email_outbound_drafts_action_id_fkey"
  },
  {
    "table_name": "meeting_notes",
    "column_name": "agent_run_id",
    "references_table": "agent_runs",
    "constraint_name": "meeting_notes_agent_run_id_fkey"
  }
]
```

## Legacy Table Baseline Result (D/E Targets)

```json
[
  {
    "table_name": "approval_decisions",
    "table_exists": true,
    "row_count": "13"
  },
  {
    "table_name": "interventions",
    "table_exists": true,
    "row_count": "55"
  },
  {
    "table_name": "agent_run_transitions",
    "table_exists": true,
    "row_count": "360"
  },
  {
    "table_name": "extracted_actions",
    "table_exists": true,
    "row_count": "14"
  },
  {
    "table_name": "agent_runs",
    "table_exists": true,
    "row_count": "19"
  }
]
```

## Gate Decision

- Engineer: `Fergus`
- Reviewer: `[pending-reviewer]`
- Rollback owner: `Fergus`
- Decision: `blocked`
- Reason: reviewer sign-off is required before destructive A/B/C/D/E SQL execution.
- Destructive SQL executed in this slice: `no`
