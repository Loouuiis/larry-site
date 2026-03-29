# Phase 2.7 J2b-1 Notes (Railway Prod)

- Date (UTC): 2026-03-29
- Environment: `railway-prod`
- Tenant: `11111111-1111-4111-8111-111111111111`
- Scope: canonical preflight unblock only (non-destructive M0), no A/B/C/D/E retirement execution.

## Baseline Evidence (Pre-M0)

- Rehearsal artifact (blocked):
  - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.json`
  - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.md`
- Baseline FK presence:
  - `meeting_notes_agent_run_id_fkey` present.
  - `email_outbound_drafts_action_id_fkey` present.
  - `correction_feedback_action_id_fkey` present.
- Baseline legacy table presence + row counts:
  - `approval_decisions`: exists, `13` rows
  - `interventions`: exists, `55` rows
  - `agent_run_transitions`: exists, `360` rows
  - `extracted_actions`: exists, `14` rows
  - `agent_runs`: exists, `19` rows

## M0 Execution (Non-Destructive)

Applied additive `larry_events` canonical alignment SQL against Railway prod:

- Added missing canonical linkage/provenance columns via `ADD COLUMN IF NOT EXISTS`:
  - `conversation_id`, `request_message_id`, `response_message_id`, `requested_by_user_id`
  - `approved_by_user_id`, `approved_at`, `dismissed_by_user_id`, `dismissed_at`
  - `executed_by_kind`, `executed_by_user_id`, `execution_mode`, `source_kind`, `source_record_id`
- Backfill updates:
  - `execution_mode` backfilled: `160` rows
  - `executed_by_kind` backfilled for auto events: `95` rows
  - `source_kind` backfilled: `160` rows
- Added missing indexes:
  - `idx_larry_events_project_conversation_created`
  - `idx_larry_events_request_message`
  - `idx_larry_events_response_message`
  - `idx_larry_events_source_record`

Post-M0 null-rate audit (`larry_events`):

- `execution_mode_null = 0`
- `source_kind_null = 0`
- `executed_by_kind_null = 65` (expected for non-auto rows)

## Post-M0 Evidence

- Rehearsal artifact (preflight unblocked):
  - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.json`
  - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.md`
- Status:
  - `status=ok`
  - Canonical preflight `Passed: yes`
  - Required `larry_events` columns present:
    - `conversation_id`, `request_message_id`, `response_message_id`, `requested_by_user_id`, `source_kind`, `source_record_id`

## Anomalies Found (Must Triage Before A-E)

From aligned rehearsal artifact:

- `[high] missing_source_record_links` (`chat=14`, `schedule=145`)
- `[high] invalid_chat_linkage` (`14`)
- `[medium] meeting_action_count_mismatch` (`5` meeting notes)

## Gate Decision

- A/B/C/D/E destructive retirement execution is deferred.
- Next slice (`J2b-2`) must:
  1. assign owners/remediation for the above anomalies,
  2. rerun rehearsal to confirm anomaly closure (or approved exception),
  3. then execute staged A/B/C FK detach and D/E table retirement with pre/post evidence.

