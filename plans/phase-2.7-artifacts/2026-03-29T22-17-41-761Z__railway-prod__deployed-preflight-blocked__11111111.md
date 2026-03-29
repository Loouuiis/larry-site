# Phase 2.7 Extraction Rehearsal Artifact

## Metadata

| key | value |
| --- | --- |
| Status | blocked |
| Generated At (UTC) | 2026-03-29T22:17:41.761Z |
| Environment | railway-prod |
| Dataset | deployed-preflight-blocked |
| Tenant | 11111111-1111-4111-8111-111111111111 |

## Canonical Preflight

- Passed: no
- Missing columns:
- `larry_events.source_kind`
- `larry_events.source_record_id`
- `larry_events.conversation_id`
- `larry_events.request_message_id`
- `larry_events.response_message_id`
- `larry_events.requested_by_user_id`

## Blocked Reason

- Canonical preflight failed. Required larry_events/larry_messages columns are missing in this environment.

## Row Count Inventory

| tableName | tableStatus | rowCount |
| --- | --- | --- |
| larry_events | present | 160 |
| larry_messages | present | 90 |
| agent_runs | present | 19 |
| extracted_actions | present | 14 |
| approval_decisions | present | 13 |
| interventions | present | 55 |

## Linkage Completeness

- Skipped due canonical preflight failure.

## Meeting Reconciliation

- Skipped due canonical preflight failure.

## Replay / Idempotency

- Skipped due canonical preflight failure.

## Anomalies

- [blocked] preflight_missing_columns: Required canonical schema columns are missing.

## Follow-Up Actions

- Apply canonical larry_events schema migrations in the target environment, then rerun rehearsal.
- Do not start extraction-table deprecation migrations until preflight passes.

## Sign-Off

- Engineer: [pending]
- Reviewer: [pending]
- Status: pending
- Notes: 

