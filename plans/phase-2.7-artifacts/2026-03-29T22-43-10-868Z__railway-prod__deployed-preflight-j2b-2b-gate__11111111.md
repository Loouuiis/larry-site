# Phase 2.7 Extraction Rehearsal Artifact

## Metadata

| key | value |
| --- | --- |
| Status | ok |
| Generated At (UTC) | 2026-03-29T22:43:10.868Z |
| Environment | railway-prod |
| Dataset | deployed-preflight-j2b-2b-gate |
| Tenant | 11111111-1111-4111-8111-111111111111 |

## Canonical Preflight

- Passed: yes
- Missing columns:
- None

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

### Missing Source Record IDs

| sourceKind | missingSourceRecord |
| --- | --- |
| chat | 14 |
| schedule | 145 |

- Invalid chat linkage count: 14
- Orphaned message link count: 0

## Meeting Reconciliation

| meetingNoteId | meetingActionCount | ledgerEventCount |
| --- | --- | --- |
| c5fec76b-59ee-4163-a379-16bb553abe88 | 1 | 0 |
| 74a08f3e-ddf4-49a6-a54d-ff3fdef7431a | 1 | 0 |
| 8e399a3c-487a-4d89-a846-9c6fc5b5ace2 | 8 | 0 |
| e0000002-0000-4000-8000-000000000002 | 2 | 0 |
| e0000001-0000-4000-8000-000000000001 | 3 | 0 |

## Replay / Idempotency

### Duplicate Groups

- No duplicate groups.

### Source Coverage

| sourceKind | totalEvents | distinctSourceRecords |
| --- | --- | --- |

## Anomalies

- [high] missing_source_record_links: Canonical source linkage is missing for one or more source kinds.
- [high] invalid_chat_linkage: Chat-origin events are missing required chat linkage fields.
- [medium] meeting_action_count_mismatch: Meeting note action counts differ from canonical ledger counts.

## Follow-Up Actions

- Triage anomaly list with owner assignments before scheduling any destructive schema steps.
- Capture remediation status and rerun rehearsal to confirm anomaly closure.

## Sign-Off

- Engineer: [pending]
- Reviewer: [pending]
- Status: pending
- Notes: 

