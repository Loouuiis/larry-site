# Phase 2.7 Retirement Window Artifact

## Metadata

| key | value |
| --- | --- |
| Generated At (UTC) | 2026-03-30T16:34:41.750Z |
| Environment | railway-prod |
| Tenant | 11111111-1111-4111-8111-111111111111 |
| Mode | precheck |
| Baseline Timestamp | 2026-03-30T16:34:27.349Z |
| Final Decision | precheck_passed |
| Destructive SQL Executed | no |

## Operator Metadata

| key | value |
| --- | --- |
| Engineer | Fergus |
| Reviewer | Fergus-temp |
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
- Rehearsal artifacts: /tmp/phase27-window/2026-03-30T16-34-41-750Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.json, /tmp/phase27-window/2026-03-30T16-34-41-750Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.md
- Rehearsal anomaly codes: missing_source_record_links, invalid_chat_linkage, meeting_action_count_mismatch
- Precheck passed: yes

### Growth Gate

| newChatMissingSourceRecord | newScheduleMissingSourceRecord | newInvalidChatLinkage |
| --- | --- | --- |
| 0 | 0 | 0 |

### FK Baseline

- FK gate policy: allow-attached-or-detached
- FK policy description: A/B/C dependencies may already be detached before the retirement window. Both attached and detached states are valid.
- Missing dependencies block execution: no
- Observed FK state: fully_detached
- Attached dependencies: 0/3

- No FK rows returned.

#### Missing Dependencies (Informational)

| tableName | columnName | referencesTable | expectedConstraintName |
| --- | --- | --- | --- |
| correction_feedback | action_id | extracted_actions | correction_feedback_action_id_fkey |
| email_outbound_drafts | action_id | extracted_actions | email_outbound_drafts_action_id_fkey |
| meeting_notes | agent_run_id | agent_runs | meeting_notes_agent_run_id_fkey |

### Legacy Table Baseline

| tableName | tableExists | rowCount |
| --- | --- | --- |
| approval_decisions | true | 13 |
| interventions | true | 58 |
| agent_run_transitions | true | 377 |
| extracted_actions | true | 14 |
| agent_runs | true | 19 |

### Blocking Reasons

- None.

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

- precheck_passed

