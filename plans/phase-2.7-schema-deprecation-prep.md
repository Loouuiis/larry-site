# Phase 2.7 Schema Deprecation Prep

## Goal

Define an implementation-ready, rollback-safe sequence for retiring extraction-era tables after canonical Larry rehearsal sign-off.

Target legacy surfaces:

- `agent_runs`
- `extracted_actions`
- `approval_decisions`
- `interventions`

This runbook is planning-only. No table drops are executed in this slice.

## Preconditions (Hard Gates)

1. Fence validation is complete for active API/web/worker paths.
2. A production-like rehearsal artifact exists in `plans/phase-2.7-artifacts/`.
3. The artifact has engineer + reviewer sign-off and no unresolved blocking anomalies.
4. Migration window and rollback owner are assigned.

If any gate fails, pause and rerun rehearsal/remediation before schema changes.

## Current FK Dependencies To Resolve

- `meeting_notes.agent_run_id -> agent_runs.id`
- `agent_run_transitions.agent_run_id -> agent_runs.id`
- `extracted_actions.agent_run_id -> agent_runs.id`
- `interventions.agent_run_id -> agent_runs.id`
- `approval_decisions.action_id -> extracted_actions.id`
- `interventions.action_id -> extracted_actions.id`
- `email_outbound_drafts.action_id -> extracted_actions.id`
- `correction_feedback.action_id -> extracted_actions.id`

## Ordered Deprecation Sequence

### Step 1: Fence Validation Lock

- Reconfirm no active runtime reads/writes use legacy extraction endpoints or tables.
- Keep regression guards green (task triage boundary, meetings cutover, ingest boundary).
- Freeze new feature work that would add extraction-era writes.

Rollback:

- No schema change yet. Reopen fenced paths only by explicit incident decision.

### Step 2: Artifact Sign-Off Lock

- Run `scripts/phase-2.7-extraction-rehearsal.mjs` on production-like data.
- Attach JSON/Markdown artifact in `plans/phase-2.7-artifacts/`.
- Require explicit sign-off fields before any destructive migration is queued.

Rollback:

- If blocked or anomalous, keep schema unchanged and repeat remediation + rehearsal.

### Step 3: Dependent FK Detach Migrations

Execute additive/detach migrations first, in this order:

1. [x] Detach `meeting_notes.agent_run_id` (**implemented in repo; environment execution pending gates/window**).
2. Detach `email_outbound_drafts.action_id`.
3. Detach `correction_feedback.action_id`.

Implementation notes:

- Prefer dropping FK constraints before dropping columns.
- If compatibility window is required, keep nullable columns temporarily but remove constraints first.
- Ensure API contracts already return canonical fields only (or explicit null compatibility placeholders).

Migration A implementation details (repo-complete, execution pending):

- Forward SQL intent:
  - Drop the `meeting_notes.agent_run_id -> agent_runs.id` FK constraint.
  - Repo implementation now uses an idempotent schema migration block that discovers any matching FK constraint name and drops it.
- Rollback SQL intent:
  - Re-add the FK on `meeting_notes.agent_run_id` to `agent_runs(id)` with `ON DELETE SET NULL`.
- Pre-validation query (FK exists before apply):

```sql
SELECT tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.table_schema = kcu.table_schema
 AND tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.table_schema = ccu.table_schema
 AND tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'meeting_notes'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'agent_run_id'
  AND ccu.table_name = 'agent_runs'
  AND ccu.column_name = 'id';
```

- Post-validation query (FK removed after apply):
  - Run the same query above and verify it returns zero rows.

Rollback:

- Recreate dropped constraints against legacy parent tables if consumer rollback requires legacy linkage.
- If columns were dropped, re-add nullable columns and restore constraints only if rollback runbook requires it.

### Step 4: Child Table Retirement

After FK detaches are confirmed:

1. Retire `approval_decisions`.
2. Retire `interventions`.
3. Retire `agent_run_transitions`.

Implementation notes:

- Snapshot row counts before drop for audit.
- Keep migration logs with exact dropped objects.

Rollback:

- Recreate tables from prior schema migration plus backup/restore for data as needed.
- Re-enable any historical-only reads only under incident rollback scope.

### Step 5: Parent Table Retirement

After child tables are retired and no inbound FKs remain:

1. Retire `extracted_actions`.
2. Retire `agent_runs`.

Rollback:

- Restore from backup and recreate constraints in dependency order.
- Re-run rehearsal checks before reattempting retirement.

### Step 6: Seed/Docs/Script Cleanup

- Remove extraction-era seed inserts from `packages/db/src/seed.ts`.
- Update docs/scripts still referencing `/v1/agent/*`, `agent_runs`, or `extracted_actions`.
- Keep migration history notes that map legacy tables to canonical replacements.

Rollback:

- Revert doc/script cleanup with schema rollback only if rollback path reintroduces legacy runtime.

## Migration Task Backlog (Implementation-Ready)

1. Migration A: detach `meeting_notes.agent_run_id` FK (and column if approved).
2. Migration B: detach `email_outbound_drafts.action_id` FK (and column if approved).
3. Migration C: detach `correction_feedback.action_id` FK (and column if approved).
4. Migration D: retire child tables (`approval_decisions`, `interventions`, `agent_run_transitions`).
5. Migration E: retire parent tables (`extracted_actions`, `agent_runs`).
6. Cleanup F: seed/doc/script cleanup and final boundary regression pass.

Each migration task must include:

- forward SQL
- rollback SQL
- pre/post validation queries
- owner + deploy window
