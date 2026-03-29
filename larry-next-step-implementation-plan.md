# Larry Next Step Implementation Plan (Mirror)

Canonical tracker: `plans/larry-next-step-implementation-plan.md`.
This root mirror is intentionally synchronized to avoid stale or conflicting next-slice guidance.

## Source Of Truth Check (Repo vs Plan)

- `runIntelligence(...)` exists in `packages/ai/src/intelligence.ts`.
- Executor functions (`runAutoActions`, `storeSuggestions`, `executeAction`) live in `packages/db/src/larry-executor.ts`.
- Canonical Larry runtime endpoints are live (`/v1/larry/chat`, `/v1/larry/briefing`, `/v1/larry/action-centre`, `/v1/larry/events/:id/accept`, `/v1/larry/events/:id/dismiss`, `/v1/larry/transcript`).
- Scheduled worker scan (`larry.scan`) is active.
- Legacy parent extraction-era tables are retired in repo schema via Migration E (`DROP TABLE IF EXISTS extracted_actions; DROP TABLE IF EXISTS agent_runs;`).
- Migration A/B/C/D/E repo-side deprecation work is complete; target-environment execution remains pending rehearsal/sign-off.

## Phase Status

- Phase 1 workspace cutover: largely complete, with residual legacy dashboard cleanup still pending.
- Phase 2 Larry runtime consolidation: in progress; canonical runtime is active and legacy schema retirement is in migration sequencing.
- Phase 3 action-centre/event-driven provenance: active and broadly implemented.

## Recent Phase 2.7 Slice Log

### Slice 2026-03-29-A to 2026-03-29-D (implemented)

- Canonicalized transcript endpoint to `POST /v1/larry/transcript`.
- Kept `POST /v1/ingest/transcript` as deprecated compatibility shim.
- Aligned docs and regression tests around canonical contracts.
- Added Migration A repo-side FK detach for `meeting_notes.agent_run_id -> agent_runs.id`.

### Slice 2026-03-29-G (implemented)

- Completed repo-side Migration B/C FK detach prep:
  - `email_outbound_drafts.action_id` detached from inline `extracted_actions` FK (nullable compatibility column retained).
  - `correction_feedback.action_id` detached from inline `extracted_actions` FK (nullable compatibility column retained).
  - Added idempotent FK-drop migration blocks for both constraints in `packages/db/src/schema.sql`.
- Extended schema regression coverage in `apps/api/tests/larry-schema.test.ts` so B/C FK coupling cannot be reintroduced.
- Updated migration runbook and extraction boundary docs:
  - Marked Migration B/C repo-complete (environment execution pending).
  - Added forward/rollback plus pre/post FK validation SQL for B/C.
  - Advanced next repo migration target to Migration D (child-table retirement).

### Slice 2026-03-29-H (implemented)

- Completed repo-side Migration D child-table retirement:
  - Retired `approval_decisions`, `interventions`, and `agent_run_transitions` from `packages/db/src/schema.sql` with idempotent drop statements.
  - Removed retired child-table RLS/policy declarations and added schema regression coverage so Migration D retirement cannot regress.
- Applied compatibility hardening to keep local workflows stable after Migration D:
  - Updated `packages/db/src/seed.ts` to stop inserting retired child-table rows.
  - Updated `scripts/phase-2.7-extraction-rehearsal.mjs` row inventory to be existence-aware (`tableStatus` + nullable `rowCount`).
- Updated runbook/tracking docs to mark Migration D repo-complete and advance next repo migration target to Migration E.

### Slice 2026-03-29-I (implemented)

- Completed repo-side Migration E parent-table retirement:
  - Retired `extracted_actions` and `agent_runs` from `packages/db/src/schema.sql` with explicit idempotent drop statements.
  - Removed retired parent-table baseline definitions plus associated RLS/policy declarations.
- Applied compatibility hardening to keep local workflows stable after Migration E:
  - Updated `packages/db/src/seed.ts` to stop inserting parent-table rows while preserving compatibility placeholder IDs for nullable `action_id` / `agent_run_id` metadata.
  - Added schema regression coverage in `apps/api/tests/larry-schema.test.ts` so Migration E retirement cannot regress.
- Updated runbook/tracking docs to mark Migration E repo-complete and advance next follow-up to rehearsal/evidence execution + Cleanup F.

### Slice 2026-03-29-J1 (implemented)

- Completed Cleanup F operational-core contract closure:
  - Canonicalized `apps/api/openapi.yaml` away from retired `/v1/agent/*` and legacy `/v1/actions/{id}/approve|reject|override` entries.
  - Reworked `scripts/demo-smoke-test.sh` to validate canonical transcript -> action-centre -> event-accept flow only.
  - Updated `apps/web/src/lib/pm-api.ts` to source pending actions from canonical `/v1/larry/action-centre` suggestions while preserving `WorkspaceSnapshot.pendingActions`.
- Added `apps/api/tests/cleanup-f-operational-boundary.test.ts` as a regression guard against reintroducing operational `/v1/agent/*` and legacy approve/reject/override seams.
- Re-synced tracker/runbook guidance so next follow-up is rollout evidence closeout plus deferred broad docs sweep.

### Slice 2026-03-29-J2a (implemented)

- Completed deferred core runtime docs sweep for canonical Larry contracts:
  - Updated `docs/AI-AGENT.md`, `docs/BACKEND-API.md`, `docs/BACKEND-WORKER.md`, `docs/DATABASE.md`, and `docs/ARCHITECTURE.md`.
  - Removed active-path legacy `/v1/agent/*` and `/v1/actions/.../approve|reject|override` runtime narratives from those core docs.
  - Removed extraction-era runtime table descriptions from those core docs.
- Applied targeted stale-state correction in `docs/LARRY-INTELLIGENCE-PLAN.md` so data-model status reflects repo-retired extraction runtime tables with target-environment evidence still pending.
- Added `apps/api/tests/cleanup-f-docs-boundary.test.ts` as a regression guard for canonical docs boundary expectations.
- Re-synced tracker/runbook guidance so J2 is split into:
  - J2a complete (docs + guard)
  - J2b next (rehearsal artifacts + target-environment migration evidence closeout)

### Slice 2026-03-29-J2b-1 (implemented)

- Executed deployed-environment canonical preflight unblock against Railway production target (`crossover.proxy.rlwy.net:31718`, tenant `11111111-1111-4111-8111-111111111111`) without running destructive retirement steps.
- Captured baseline blocked rehearsal artifact before any DDL:
  - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.{json,md}`
- Captured pre-DDL FK/table baseline evidence (A/B/C FK presence + D/E table row counts) and M0 execution details in:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-1-notes.md`
- Applied non-destructive M0 alignment SQL on deployed DB:
  - Added missing canonical `larry_events` linkage/provenance columns.
  - Backfilled `execution_mode`, `executed_by_kind` (auto events), and `source_kind`.
  - Added missing canonical indexes (`idx_larry_events_project_conversation_created`, `idx_larry_events_request_message`, `idx_larry_events_response_message`, `idx_larry_events_source_record`).
- Captured post-M0 rehearsal artifact with canonical preflight unblocked:
  - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.{json,md}`
  - `status=ok`, `preflight Passed: yes`.
- Logged non-blocking but high/medium data anomalies from aligned rehearsal and deferred destructive A/B/C/D/E execution pending anomaly triage/owner assignment.

### Slice 2026-03-29-J2b-2a (implemented)

- Re-ran deployed canonical rehearsal read-only on Railway production (`2026-03-29T22:25:35.771Z UTC`) and confirmed no gate movement:
  - `status=ok`, preflight still passed.
  - anomaly counts unchanged (`missing_source_record_links`, `invalid_chat_linkage`, `meeting_action_count_mismatch`).
  - Migration A/B/C FK dependencies and D/E legacy tables still present in target environment.
- Added anomaly triage + waiver dossier:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md`
  - Captures anomaly counts, rationale, waiver defaults, owner/reviewer placeholders, due date, and explicit growth-gate rule.
- Added deterministic J2b-2b operator command pack in Phase 2.7 runbook/checklist docs:
  - pre-check commands (rehearsal + FK/table validation),
  - staged A/B/C then D/E execution sequence,
  - post-check and rollback command blocks,
  - sign-off metadata template (engineer/reviewer/rollback owner/window).
- Corrected stale tracker claim for Phase 2.2:
  - current `/v1/larry/transcript` behavior still includes inline intelligence writes in addition to canonical event enqueue; full queue-only transcript execution remains a known residual seam.

### Slice 2026-03-29-J2b-2b (in progress, reviewer-gated)

- Ran fresh deployed pre-check rehearsal and committed artifacts:
  - `plans/phase-2.7-artifacts/2026-03-29T22-43-10-868Z__railway-prod__deployed-preflight-j2b-2b-gate__11111111.{json,md}`
  - `status=ok`, preflight passed, anomaly counts unchanged from J2b-2a baseline.
- Ran growth-gate plus FK/table baseline SQL checks and captured outputs:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2b-precheck-notes.md`
  - Growth-gate deltas all `0`; A/B/C FK dependencies and D/E tables remain present pre-execution.
- Updated anomaly dossier sign-off fields:
  - Engineer `Fergus`, Rollback owner `Fergus`, Reviewer pending.
  - Decision: `blocked` until reviewer assignment/sign-off.
- Destructive A/B/C/D/E migration SQL was not executed in this slice because reviewer gate remains unmet.

## What Remains In Current Phase (Phase 2)

- Assign reviewer and complete approval status for anomaly waiver/remediation dossier (`plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md`).
- Re-run deployed rehearsal + growth-gate/FK/table baselines at migration window start and confirm no post-baseline anomaly growth.
- Execute Migration A/B/C/D/E in target environments (staged FK detach -> table retirement) and capture pre/post FK/table validation evidence.
- Record rollout sign-off metadata (engineer, reviewer, rollback owner, deploy window, evidence links).
- Complete any residual non-core historical docs cleanup discovered during evidence closeout (core runtime docs sweep completed in J2a).
- Known residual seam: `/v1/larry/transcript` still performs inline intelligence writes alongside canonical event enqueue; queue-only transcript execution cutover remains deferred follow-up.

## Recommended Next Slice

### Slice 2026-03-29-J2b-2b completion (next)

Goal: complete reviewer-gated anomaly-approved target-environment retirement execution.

Plan:
1. Assign reviewer/sign-off in `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md` and change decision from `blocked` to `approved`.
2. Re-run operator pre-check command pack at migration window start (rehearsal + growth-gate + FK/table baselines) and confirm counts are unchanged from the current J2b-2b baseline.
3. Execute staged target-environment migration sequence (A/B/C FK detach, then D/E retirements) and capture output evidence.
4. Run post-check + rollback-readiness commands and record final sign-off metadata.

Definition of done:
- Reviewer gate is closed, deployed rehearsal/growth/fk-table checks pass in-window, A/B/C/D/E environment evidence is captured, and rollout runbook sign-off metadata is finalized.

