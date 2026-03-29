# Phase 2.7 Extraction Boundary Checklist

## Goal

Capture the current extraction-runtime boundary and provide a repeatable rehearsal checklist for canonical `larry_events` and `larry_messages` verification on production-like data.

## Scripted Rehearsal Workflow

Use the rehearsal runner to execute checks and emit artifacts:

```bash
node scripts/phase-2.7-extraction-rehearsal.mjs \
  --tenant <tenant-uuid> \
  --environment <environment-label> \
  --dataset <dataset-label> \
  [--out-dir plans/phase-2.7-artifacts]
```

CLI contract:

- `--tenant <uuid>` required.
- `--environment <name>` required.
- `--dataset <name>` required.
- `--out-dir <path>` optional (defaults to `plans/phase-2.7-artifacts`).

Exit behavior:

- Exit `0` when rehearsal queries complete and artifacts are written.
- Exit `0` with `status=blocked` when canonical preflight fails (artifacts still written with explicit missing-column reasons).
- Exit non-zero on DB connectivity/query failure.

Artifacts are commit-safe JSON + Markdown files under `plans/phase-2.7-artifacts` by default.

## Keep/Migrate/Fence Matrix

| Legacy table | Current active-path usage | Decision | Notes |
| --- | --- | --- | --- |
| `agent_runs` | No active workspace/API/worker runtime reads or writes after task-triage cutover to canonical `POST /v1/larry/chat`. Legacy schema/docs/script references remain (`meeting_notes.agent_run_id`, `agent_run_transitions`, legacy seeds/docs, demo script). | Fence + deprecate prep | Phase 2.6 removed meetings read coupling. Phase 2.7a removed transcript write-time `agent_run_id` coupling and deleted unused `/api/workspace/agent/runs/[runId]` proxy route. Phase 2.7b removed active workspace task-triage writes to `/v1/agent/runs`. |
| `extracted_actions` | No active runtime reads/writes. Still referenced by legacy FK columns (`email_outbound_drafts.action_id`, `interventions.action_id`) and seed/docs. | Fence + migrate later | Keep for historical rows until FK migration and deprecation migration are executed. |
| `approval_decisions` | No active runtime reads/writes in API/worker/web. | Keep (historical) + fence new usage | Canonical approval lifecycle is on `larry_events` (`accepted`/`dismissed` + attribution columns). |
| `interventions` | No active runtime reads/writes. Legacy table still present in schema/seed/docs. | Keep (historical) + fence new usage | Replace with canonical policy/execution metadata already attached to `larry_events`. |

## Rehearsal SQL Checks

Run these checks against production-like data before the next canonical cutover.
The script above runs these checks using tenant parameterization.

### 1) Row-count inventory

```sql
SELECT 'larry_events' AS table_name, COUNT(*) AS row_count
FROM larry_events
WHERE tenant_id = $1
UNION ALL
SELECT 'larry_messages', COUNT(*)
FROM larry_messages
WHERE tenant_id = $1
UNION ALL
SELECT 'agent_runs', COUNT(*)
FROM agent_runs
WHERE tenant_id = $1
UNION ALL
SELECT 'extracted_actions', COUNT(*)
FROM extracted_actions
WHERE tenant_id = $1
UNION ALL
SELECT 'approval_decisions', COUNT(*)
FROM approval_decisions
WHERE tenant_id = $1
UNION ALL
SELECT 'interventions', COUNT(*)
FROM interventions
WHERE tenant_id = $1;
```

### 2) Canonical linkage completeness

```sql
SELECT source_kind, COUNT(*) AS missing_source_record
FROM larry_events
WHERE tenant_id = $1
  AND source_kind IN ('chat', 'meeting', 'email', 'slack', 'calendar', 'briefing', 'schedule')
  AND source_record_id IS NULL
GROUP BY source_kind;
```

```sql
SELECT COUNT(*) AS invalid_chat_linkage
FROM larry_events
WHERE tenant_id = $1
  AND source_kind = 'chat'
  AND (
    conversation_id IS NULL
    OR request_message_id IS NULL
    OR response_message_id IS NULL
    OR requested_by_user_id IS NULL
  );
```

```sql
SELECT COUNT(*) AS orphaned_message_links
FROM larry_events e
LEFT JOIN larry_messages req
  ON req.tenant_id = e.tenant_id
 AND req.id = e.request_message_id
LEFT JOIN larry_messages res
  ON res.tenant_id = e.tenant_id
 AND res.id = e.response_message_id
WHERE e.tenant_id = $1
  AND (
    (e.request_message_id IS NOT NULL AND req.id IS NULL)
    OR (e.response_message_id IS NOT NULL AND res.id IS NULL)
  );
```

### 3) Meeting reconciliation checks

```sql
WITH meeting_event_counts AS (
  SELECT source_record_id AS meeting_note_id, COUNT(*) AS event_count
  FROM larry_events
  WHERE tenant_id = $1
    AND source_kind = 'meeting'
    AND source_record_id IS NOT NULL
  GROUP BY source_record_id
)
SELECT mn.id,
       mn.action_count AS meeting_action_count,
       COALESCE(mec.event_count, 0) AS ledger_event_count
FROM meeting_notes mn
LEFT JOIN meeting_event_counts mec
  ON mec.meeting_note_id = mn.id
WHERE mn.tenant_id = $1
  AND mn.action_count <> COALESCE(mec.event_count, 0)
ORDER BY mn.created_at DESC;
```

### 4) Replay/idempotency smoke checks

```sql
SELECT source_kind,
       source_record_id,
       action_type,
       md5(COALESCE(display_text, '')) AS display_text_fingerprint,
       COUNT(*) AS duplicate_count
FROM larry_events
WHERE tenant_id = $1
  AND source_kind IN ('meeting', 'email', 'slack', 'calendar')
  AND source_record_id IS NOT NULL
GROUP BY source_kind, source_record_id, action_type, md5(COALESCE(display_text, ''))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, source_kind, source_record_id;
```

```sql
SELECT source_kind,
       COUNT(*) AS total_events,
       COUNT(DISTINCT source_record_id) AS distinct_source_records
FROM larry_events
WHERE tenant_id = $1
  AND source_kind IN ('meeting', 'email', 'slack', 'calendar')
GROUP BY source_kind
ORDER BY source_kind;
```

## Canonical Preflight Expectations

Before linkage/replay checks run, preflight must verify these canonical columns exist:

- `larry_events.source_kind`
- `larry_events.source_record_id`
- `larry_events.conversation_id`
- `larry_events.request_message_id`
- `larry_events.response_message_id`
- `larry_events.requested_by_user_id`
- `larry_messages.id`
- `larry_messages.tenant_id`
- `larry_messages.conversation_id`

If any required column is missing, rehearsal is `blocked` and migration/fence-drop execution must stay paused until schema is aligned.

## Rehearsal Artifact Template

Record one artifact per rehearsal run with:

- Run timestamp (UTC)
- Environment and dataset identifier
- Tenant(s) covered
- Query output snapshots for:
  - row-count inventory
  - linkage completeness checks
  - meeting reconciliation check
  - replay/idempotency smoke checks
- Observed anomalies (if any)
- Follow-up actions and owners
- Sign-off (engineer + reviewer)

Use generated artifacts under `plans/phase-2.7-artifacts` and link them from Phase 2 tracking updates.
