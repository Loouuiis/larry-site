# Phase 2.7 Retirement Window Artifact

## Metadata

| key | value |
| --- | --- |
| Generated At (UTC) | 2026-03-30T15:11:51.707Z |
| Environment | railway-prod |
| Tenant | 11111111-1111-4111-8111-111111111111 |
| Mode | precheck |
| Baseline Timestamp | 2026-03-29T22:25:35.771Z |
| Final Decision | precheck_blocked |
| Destructive SQL Executed | no |

## Operator Metadata

| key | value |
| --- | --- |
| Engineer | Fergus |
| Reviewer | Fergus (temporary) |
| Rollback owner | Fergus |
| Window start |  |
| Window end |  |

## Safeguards

- LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT: [unset]
- Environment gate enabled: no
- Execute requested: no
- Confirm token provided: no

## Precheck

- Rehearsal status: ok
- Rehearsal artifacts: /app/plans/phase-2.7-artifacts/2026-03-30T15-11-51-707Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.json, /app/plans/phase-2.7-artifacts/2026-03-30T15-11-51-707Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.md
- Rehearsal anomaly codes: missing_source_record_links, invalid_chat_linkage, meeting_action_count_mismatch
- Precheck passed: no

### Growth Gate

| newChatMissingSourceRecord | newScheduleMissingSourceRecord | newInvalidChatLinkage |
| --- | --- | --- |
| 0 | 49 | 0 |

### FK Baseline

- No FK rows returned.

### Legacy Table Baseline

| tableName | tableExists | rowCount |
| --- | --- | --- |
| approval_decisions | true | 13 |
| interventions | true | 55 |
| agent_run_transitions | true | 360 |
| extracted_actions | true | 14 |
| agent_runs | true | 19 |

### Blocking Reasons

- growth-gate counts are non-zero
- required FK dependencies are missing: correction_feedback.action_id -> extracted_actions, email_outbound_drafts.action_id -> extracted_actions, meeting_notes.agent_run_id -> agent_runs

## Execution

- Destructive SQL executed: no
| name | status | statementCount |
| --- | --- | --- |
| migration_a_b_c_fk_detach | not_run | 3 |
| migration_d_child_table_retirement | not_run | 3 |
| migration_e_parent_table_retirement | not_run | 2 |

## Postcheck

- Postcheck executed: no
- Postcheck passed: no

### FK Verification

- No residual FK rows.

### Table Verification

- Not run.

## Final Decision

- precheck_blocked

