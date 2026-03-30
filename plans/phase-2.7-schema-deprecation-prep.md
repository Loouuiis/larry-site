# Phase 2.7 Schema Deprecation Prep

## Goal

Define an implementation-ready, rollback-safe sequence for retiring extraction-era tables after canonical Larry rehearsal sign-off.

Target legacy surfaces:

- `agent_runs`
- `extracted_actions`
- `approval_decisions`
- `interventions`

Migration A/B/C/D/E are now repo-complete and target-environment complete, with executed-window evidence captured on `2026-03-30` in committed Phase 2.7 artifacts.

## Preconditions (Hard Gates)

1. Fence validation is complete for active API/web/worker paths.
2. A production-like rehearsal artifact exists in `plans/phase-2.7-artifacts/`.
3. The artifact has engineer + reviewer sign-off and no unresolved blocking anomalies.
4. Migration window and rollback owner are assigned.

If any gate fails, pause and rerun rehearsal/remediation before schema changes.

## Deployment Safety Note (J2b-2c)

- API startup migrations now apply a Phase 2.7 destructive-retirement safety gate in `packages/db/src/migrate.ts`.
- Default behavior during deploy-time migration is safe:
  - Phase 2.7 D/E `DROP TABLE IF EXISTS ...` statements are skipped unless explicitly enabled.
- Explicit opt-in for controlled destructive retirement execution:
  - `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT=true`
- Deploy current API/worker with default-safe gate behavior before running any in-window destructive A/B/C/D/E operator SQL.

## Repo-Native Window Runner Note (J2b-2d)

- The repo now ships a deterministic operator runner for the live Phase 2.7 window:
  - `npm run phase27:rehearsal -- ...`
  - `npm run phase27:retirement-window -- ...`
- The retirement-window runner is read-only by default and emits both a reusable rehearsal artifact and a retirement-window summary artifact under `plans/phase-2.7-artifacts/`.
- Destructive execution only occurs when both flags are present:
  - `--execute --confirm phase-2.7-retirement`
- The runner blocks destructive execution if rehearsal is not `ok`, growth-gate counts are non-zero, required legacy-table baselines are missing, or `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` is enabled.
- Operator connectivity rule:
  - `railway run` from a local workstation is not valid for this flow when `DATABASE_URL` resolves to `postgres.railway.internal`.
  - Standardize live-window execution through in-service `railway ssh --service larry-site ...` commands.
- Rebaseline rule:
  - Set a fresh `BASELINE_TIMESTAMP` immediately after deploy-parity verification and before each precheck/execute pair.

## Latest Target-Environment Evidence (2026-03-30 UTC)

Environment: `railway-prod`  
Tenant: `11111111-1111-4111-8111-111111111111`

- Baseline blocked rehearsal artifact (pre-M0):
  - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.{json,md}`
- Baseline FK/table evidence captured in notes:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-1-notes.md`
- Applied non-destructive M0 canonical preflight alignment SQL (additive `larry_events` columns/backfills/indexes only; no A/B/C/D/E destructive execution).
- Post-M0 aligned rehearsal artifact:
  - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.{json,md}`
  - `status=ok`, canonical preflight passed.
- Read-only recheck run (temp artifact output, non-committed):
  - Run timestamp: `2026-03-29T22:25:35.771Z`
  - `status=ok`, canonical preflight still passed, anomaly counts unchanged from aligned rehearsal baseline.
- Fresh J2b-2b committed pre-check rehearsal:
  - `plans/phase-2.7-artifacts/2026-03-29T22-43-10-868Z__railway-prod__deployed-preflight-j2b-2b-gate__11111111.{json,md}`
  - `status=ok`, canonical preflight passed, anomaly counts still unchanged (`chat=14`, `schedule=145`, `invalid_chat_linkage=14`, `meeting_action_count_mismatch=5`).
- J2b-2a anomaly triage + waiver dossier:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md`
  - Updated sign-off fields: Engineer `Fergus`, Rollback owner `Fergus`, temporary reviewer `Fergus` accepted for sign-off metadata; this initial `blocked` state is superseded by post-parity approved execution evidence below.
- J2b-2b pre-check SQL evidence notes:
  - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2b-precheck-notes.md`
  - Growth-gate query deltas are all `0`; A/B/C FK dependencies and D/E tables still present as expected pre-execution.
- J2b-2e deploy-safe sync landed in target environment:
  - API deploy (`larry-site`): `65d6d39d-a2d2-4589-86f7-3c6d7d23030a` (`status=SUCCESS`)
  - Worker deploy (`diplomatic-vitality`): `8fd8b154-c912-4f5f-8f07-55222b4637f0` (`status=SUCCESS`)
  - `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` confirmed unset on both services.
- J2b-2e in-window precheck artifact:
  - `plans/phase-2.7-artifacts/2026-03-30T15-11-51-707Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.{json,md}`
  - `final_decision=precheck_blocked`
- J2b-2e execute attempt artifact:
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute__11111111.{json,md}`
  - `plans/phase-2.7-artifacts/2026-03-30T15-14-55-535Z__railway-prod__phase-2-7-retirement-window-execute-precheck__11111111.{json,md}`
  - `final_decision=blocked`, `destructive_sql_executed=no`
- J2b-2e operator notes:
  - `plans/phase-2.7-artifacts/2026-03-30__railway-prod__j2b-2e-window-attempt-notes.md`
- Stale-state correction (`2026-03-30`):
  - Production later advanced to `master` commit `d202add5f55c2e410508ac4df58ed9069200c201`; this was corrected by parity redeploy from current workspace state.
- Phase 2 closure parity deployments:
  - API deploy (`larry-site`): `0bf692df-2f4c-4a5a-a720-e6b883d68d89` (`status=SUCCESS`)
  - Worker deploy (`diplomatic-vitality`): `4e8a8540-2935-41e5-9f3f-c0429b764fbc` (`status=SUCCESS`)
  - In-service parity verified: `/app/scripts` present and `phase27:retirement-window` available.
- Fresh post-parity baseline:
  - `BASELINE_TIMESTAMP=2026-03-30T16:34:27.349Z`
- In-window precheck (post-parity baseline):
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-41-750Z__railway-prod__phase-2-7-retirement-window-precheck__11111111.{json,md}`
  - `final_decision=precheck_passed`
  - Growth-gate deltas: all `0`
  - FK observed state: `fully_detached` (allowed by policy, non-blocking)
- Execute-mode run (same baseline):
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-52-288Z__railway-prod__phase-2-7-retirement-window-execute-precheck__11111111.{json,md}`
  - `plans/phase-2.7-artifacts/2026-03-30T16-34-52-288Z__railway-prod__phase-2-7-retirement-window-execute__11111111.{json,md}`
  - `final_decision=executed`
  - `destructive_sql_executed=yes`
  - Postcheck confirms no residual FK dependencies and all legacy target tables retired.

Target-environment destructive retirement execution is complete for this phase. Remaining work is limited to non-schema runtime/doc boundary closure and non-blocking anomaly follow-ups.

## Current FK Dependency State

- `meeting_notes.agent_run_id -> agent_runs.id` constraint is absent in target environment (`2026-03-30` J2b-2e precheck).
- `email_outbound_drafts.action_id -> extracted_actions.id` constraint is absent in target environment (`2026-03-30` J2b-2e precheck).
- `correction_feedback.action_id -> extracted_actions.id` constraint is absent in target environment (`2026-03-30` J2b-2e precheck).
- `extracted_actions.agent_run_id -> agent_runs.id` remains resolved by parent-table retirement sequencing intent.
- Operator implication: FK baseline is now audit evidence, not a blocking precondition; attached and already-detached A/B/C dependency states are both valid for execution.

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
2. [x] Detach `email_outbound_drafts.action_id` (**implemented in repo; environment execution pending gates/window**).
3. [x] Detach `correction_feedback.action_id` (**implemented in repo; environment execution pending gates/window**).

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

Migration B implementation details (repo-complete, execution pending):

- Forward SQL intent:
  - Drop the `email_outbound_drafts.action_id -> extracted_actions.id` FK constraint.
  - Repo implementation now uses an idempotent schema migration block that discovers any matching FK constraint name and drops it.
- Rollback SQL intent:
  - Re-add the FK on `email_outbound_drafts.action_id` to `extracted_actions(id)` with `ON DELETE SET NULL`.
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
  AND tc.table_name = 'email_outbound_drafts'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'action_id'
  AND ccu.table_name = 'extracted_actions'
  AND ccu.column_name = 'id';
```

- Post-validation query (FK removed after apply):
  - Run the same query above and verify it returns zero rows.

Migration C implementation details (repo-complete, execution pending):

- Forward SQL intent:
  - Drop the `correction_feedback.action_id -> extracted_actions.id` FK constraint.
  - Repo implementation now uses an idempotent schema migration block that discovers any matching FK constraint name and drops it.
- Rollback SQL intent:
  - Re-add the FK on `correction_feedback.action_id` to `extracted_actions(id)` with `ON DELETE SET NULL`.
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
  AND tc.table_name = 'correction_feedback'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'action_id'
  AND ccu.table_name = 'extracted_actions'
  AND ccu.column_name = 'id';
```

- Post-validation query (FK removed after apply):
  - Run the same query above and verify it returns zero rows.

Next repo migration target: **Phase 2 - Rebaseline and window execution** (growth-gate remediation/re-baseline + FK-baseline gate alignment, then rerun repo-native precheck).

### Step 4: Child Table Retirement

After FK detaches are confirmed:

1. [x] Retire `approval_decisions` (**repo-complete; env execution pending gates/window**).
2. [x] Retire `interventions` (**repo-complete; env execution pending gates/window**).
3. [x] Retire `agent_run_transitions` (**repo-complete; env execution pending gates/window**).

Implementation notes:

- Forward SQL intent:
  - `DROP TABLE IF EXISTS approval_decisions;`
  - `DROP TABLE IF EXISTS interventions;`
  - `DROP TABLE IF EXISTS agent_run_transitions;`
  - Repo implementation applies these as idempotent Migration D drop statements in `packages/db/src/schema.sql`.
- Rollback SQL intent:
  - Restore the three child tables from prior schema snapshot + backup restore for historical data as required.
- Pre-validation query (tables present before apply):

```sql
SELECT 'approval_decisions' AS table_name, to_regclass('public.approval_decisions') IS NOT NULL AS table_exists
UNION ALL
SELECT 'interventions', to_regclass('public.interventions') IS NOT NULL
UNION ALL
SELECT 'agent_run_transitions', to_regclass('public.agent_run_transitions') IS NOT NULL;
```

- Post-validation query (tables removed after apply):
  - Run the same query above and verify `table_exists = false` for all three tables.
- Pre-drop row-count audit query (run before applying drop statements):

```sql
SELECT 'approval_decisions' AS table_name, COUNT(*) AS row_count
FROM approval_decisions
UNION ALL
SELECT 'interventions', COUNT(*)
FROM interventions
UNION ALL
SELECT 'agent_run_transitions', COUNT(*)
FROM agent_run_transitions;
```

Rollback:

- Recreate tables from prior schema migration plus backup/restore for data as needed.
- Re-enable any historical-only reads only under incident rollback scope.

### Step 5: Parent Table Retirement

After child tables are retired and no inbound FKs remain:

1. [x] Retire `extracted_actions` (**repo-complete; env execution pending gates/window**).
2. [x] Retire `agent_runs` (**repo-complete; env execution pending gates/window**).

Implementation notes:

- Forward SQL intent:
  - `DROP TABLE IF EXISTS extracted_actions;`
  - `DROP TABLE IF EXISTS agent_runs;`
  - Repo implementation applies these as idempotent Migration E drop statements in `packages/db/src/schema.sql`.
- Rollback SQL intent:
  - Restore `agent_runs` and `extracted_actions` from prior schema snapshot + backup restore for historical data as required.
  - If rollback requires FK restoration, re-add in dependency order (`agent_runs` first, then `extracted_actions` and dependent FKs as needed).
- Pre-validation query (tables present before apply):

```sql
SELECT 'extracted_actions' AS table_name, to_regclass('public.extracted_actions') IS NOT NULL AS table_exists
UNION ALL
SELECT 'agent_runs', to_regclass('public.agent_runs') IS NOT NULL;
```

- Post-validation query (tables removed after apply):
  - Run the same query above and verify `table_exists = false` for both tables.
- Pre-drop row-count audit query (run before applying drop statements):

```sql
SELECT 'extracted_actions' AS table_name, COUNT(*) AS row_count
FROM extracted_actions
UNION ALL
SELECT 'agent_runs', COUNT(*)
FROM agent_runs;
```

Rollback:

- Restore from backup and recreate constraints in dependency order.
- Re-run rehearsal checks before reattempting retirement.

### Step 6: Seed/Docs/Script Cleanup

- [x] Remove extraction-era seed inserts from `packages/db/src/seed.ts` (child + parent writes removed in repo).
- [x] Cleanup F operational-core artifacts are canonicalized:
  - `apps/api/openapi.yaml` removed `/v1/agent/*` and legacy `/v1/actions/.../approve|reject|override` path entries.
  - `scripts/demo-smoke-test.sh` now exercises canonical transcript -> action-centre -> event accept flow.
  - `apps/web/src/lib/pm-api.ts` now sources pending actions from canonical `/v1/larry/action-centre`.
  - `apps/api/tests/cleanup-f-operational-boundary.test.ts` guards against reintroduction.
- [x] Cleanup F docs-boundary closure for core runtime docs is complete:
  - Updated `docs/AI-AGENT.md`, `docs/BACKEND-API.md`, `docs/BACKEND-WORKER.md`, `docs/DATABASE.md`, and `docs/ARCHITECTURE.md` to canonical Larry runtime contracts.
  - Updated stale data-model status note in `docs/LARRY-INTELLIGENCE-PLAN.md` to reflect repo-retired extraction runtime tables with env evidence still pending.
  - Added `apps/api/tests/cleanup-f-docs-boundary.test.ts` as regression coverage for canonical docs boundaries.
- Deferred follow-up: residual non-core historical docs sweep can run during J2b evidence closeout if additional references are found.
- Keep migration history notes that map legacy tables to canonical replacements.

Rollback:

- Revert doc/script cleanup with schema rollback only if rollback path reintroduces legacy runtime.

## J2b Repo-Native Operator Commands

Use these repo commands during the approved migration window. Replace placeholders before execution.

### 0) Session setup

```bash
export TENANT_ID='11111111-1111-4111-8111-111111111111'
export ENVIRONMENT='railway-prod'
export OUT_DIR='/tmp/phase27-window'
export BASELINE_TIMESTAMP='2026-03-29T22:25:35.771Z'
export ENGINEER='Fergus'
export REVIEWER='Fergus (temporary)'
export ROLLBACK_OWNER='Fergus'
export LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT='false'
```

Deploy-sync note:
- Keep `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` unset/`false` during normal API deploy migrations.
- Use the repo-native runner for both in-window precheck and destructive execution; do not rely on ad hoc `psql` copy/paste for the primary path.
- Do not use `railway run ... npm run phase27:retirement-window` from local when DB host is `postgres.railway.internal`; run in-service via `railway ssh`.

### 1) In-window precheck (read-only)

Run the repo-native precheck:

```bash
railway ssh --service larry-site --environment production sh -lc "cd /app && node scripts/phase-2.7-retirement-window.mjs \
  --tenant \"$TENANT_ID\" \
  --environment \"$ENVIRONMENT\" \
  --baseline-timestamp \"$BASELINE_TIMESTAMP\" \
  --out-dir \"$OUT_DIR\" \
  --engineer \"$ENGINEER\" \
  --reviewer \"$REVIEWER\" \
  --rollback-owner \"$ROLLBACK_OWNER\""
```

Expected outcomes:
- The runner writes both a rehearsal artifact and a retirement-window summary artifact under `$OUT_DIR`.
- `final_decision=precheck_passed` is required before any destructive execution.
- Block execution if the runner returns `precheck_blocked`, `blocked`, or `error`, or if dossier approvals remain incomplete in `2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md`.

### 2) Destructive execution (staged via runner)

Run the same command with explicit destructive confirmation:

```bash
railway ssh --service larry-site --environment production sh -lc "cd /app && node scripts/phase-2.7-retirement-window.mjs \
  --tenant \"$TENANT_ID\" \
  --environment \"$ENVIRONMENT\" \
  --baseline-timestamp \"$BASELINE_TIMESTAMP\" \
  --out-dir \"$OUT_DIR\" \
  --engineer \"$ENGINEER\" \
  --reviewer \"$REVIEWER\" \
  --rollback-owner \"$ROLLBACK_OWNER\" \
  --execute \
  --confirm phase-2.7-retirement"
```

Expected outcomes:
- The runner re-runs rehearsal, growth-gate, FK baseline, and legacy-table baseline before executing any destructive SQL.
- The only destructive SQL executed is staged A/B/C FK detach, then D child-table retirement, then E parent-table retirement.
- `final_decision=executed` and `destructive_sql_executed=yes` are required for a successful window.
- Abort and treat the window as failed if the runner returns `blocked`, `postcheck_failed`, or `error`.

### 3) Rollback command block

Use only if deployment abort criteria are met.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- Re-add FK constraints (A/B/C rollback)
ALTER TABLE meeting_notes
  ADD CONSTRAINT meeting_notes_agent_run_id_fkey
  FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

ALTER TABLE email_outbound_drafts
  ADD CONSTRAINT email_outbound_drafts_action_id_fkey
  FOREIGN KEY (action_id) REFERENCES extracted_actions(id) ON DELETE SET NULL;

ALTER TABLE correction_feedback
  ADD CONSTRAINT correction_feedback_action_id_fkey
  FOREIGN KEY (action_id) REFERENCES extracted_actions(id) ON DELETE SET NULL;
SQL
```

For D/E rollback, restore `approval_decisions`, `interventions`, `agent_run_transitions`, `extracted_actions`, and `agent_runs` from the approved schema snapshot + backup restore owned by the assigned rollback operator.

### 4) Sign-off metadata template

- Engineer:
- Reviewer:
- Rollback owner:
- Window start (UTC):
- Window end (UTC):
- Rehearsal artifact(s):
- Pre-check output links:
- Post-check output links:
- Rollback evidence (if used):
- Final decision (`approved`/`aborted`):

## Migration Task Backlog (Implementation-Ready)

1. [x] Migration A: detach `meeting_notes.agent_run_id` FK (repo-complete; env execution pending).
2. [x] Migration B: detach `email_outbound_drafts.action_id` FK (repo-complete; env execution pending).
3. [x] Migration C: detach `correction_feedback.action_id` FK (repo-complete; env execution pending).
4. [x] Migration D: retire child tables (`approval_decisions`, `interventions`, `agent_run_transitions`) (repo-complete; env execution pending).
5. [x] Migration E: retire parent tables (`extracted_actions`, `agent_runs`) (repo-complete; env execution pending).
6. [x] Cleanup F: seed/doc/script cleanup and final boundary regression pass (operational-core + core docs boundary complete in repo; target-environment evidence closeout pending in J2b).
7. [x] J2b-2a: anomaly waiver dossier + operator command pack prep (repo-complete; decision transitioned to approved after post-parity precheck/execute evidence).
8. [x] J2b-2c: deploy-safe migration gate for API startup migrations (`LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT`) + regression guard coverage.
9. [x] J2b-2d: repo-native retirement window runner + safeguards/docs/tests (repo-complete).
10. [x] Phase 2 - Rebaseline and window execution: deploy-safe parity + live precheck/execute rerun completed (`precheck_passed` then `executed`) with committed evidence artifacts.

Each migration task must include:

- forward SQL
- rollback SQL
- pre/post validation queries
- owner + deploy window
