# Task → source email thread + Reply-in-Gmail (issue #92)

**Date:** 2026-04-18
**Sprint:** Launch 2026-04-19 (P1 differentiator)

## Problem

Larry creates tasks from Gmail signals but the tasks carry no link back
to the source thread. Users can't jump from "Reply to the Acme RFP by
Friday" to the actual inbox conversation that prompted it. Height,
Motion, Asana all lack this.

## Acceptance

- Click a surfaced task → the source thread is visible inline
- Reply-in-Gmail button opens `https://mail.google.com/mail/u/0/#inbox/<threadId>`
- Works for ≥90% of Gmail-sourced tasks

## Approach

Memory entries already carry `source_kind` + `source_record_id` (the
Gmail thread ID lands here via the normalizer). The LLM knows which
memory entry triggered a task because it sees them in the prompt. So:

1. Expose memory-entry IDs in the prompt.
2. Let the LLM cite the triggering entry on `task_create`.
3. Copy the entry's `source_kind` + `source_record_id` onto the task.
4. Render a "Reply in Gmail" button in the task detail when the source
   kind is `email`.

The LLM-output-correctness risk is mitigated because the executor
validates the cited memoryEntryId actually exists in `project_memory_entries`
for this tenant+project before copying — invalid citations silently drop
the link rather than fabricate one.

## Changes

### 1. Schema — migration `025_task_source_linkage.sql`

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_kind TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT;

CREATE INDEX IF NOT EXISTS tasks_source_idx
  ON tasks (tenant_id, source_kind, source_record_id)
  WHERE source_record_id IS NOT NULL;
```

Mirror the DDL into `packages/db/src/schema.sql` (idempotent `ADD
COLUMN IF NOT EXISTS`) since migrations also run at boot from that
file.

### 2. Intelligence prompt — `packages/ai/src/intelligence.ts`

Memory entries are rendered at `:517-526`. Extend the line to include
the entry ID so the LLM can cite it:

```ts
`  [memory:${e.id}] [${e.createdAt.slice(0,10)}] [${e.sourceKind}] ${wrappedBody}`
```

`getProjectSnapshot` already selects `id` on `project_memory_entries`
per `packages/db/src/larry-snapshot.ts`. (Verify — add if missing.)

Update `buildIntelligenceSystemPrompt` to instruct: *"When creating a
task based on a PROJECT MEMORY entry, include `sourceMemoryEntryId`
in the task payload set to the `memory:<id>` value from that line."*

### 3. Action schema — `packages/ai/src/intelligence.ts`

Optional payload field on `task_create`:
```ts
sourceMemoryEntryId: z.string().uuid().optional()
```
Added to `REQUIRED_PAYLOAD_FIELDS` as an optional (not required).

### 4. Executor — `packages/db/src/larry-executor.ts::executeTaskCreate`

Before the `INSERT INTO tasks`:

```ts
let sourceKind: string | null = null;
let sourceRecordId: string | null = null;
if (typeof payload.sourceMemoryEntryId === "string") {
  const rows = await db.queryTenant<{ source_kind: string; source_record_id: string | null }>(
    tenantId,
    `SELECT source_kind, source_record_id
     FROM project_memory_entries
     WHERE tenant_id = $1 AND project_id = $2 AND id = $3
     LIMIT 1`,
    [tenantId, projectId, payload.sourceMemoryEntryId]
  );
  if (rows[0]) {
    sourceKind = rows[0].source_kind;
    sourceRecordId = rows[0].source_record_id;
  }
}
```

Pass the two values into the existing INSERT statement (add columns).

### 5. API — `apps/api/src/routes/v1/tasks.ts`

`GET /tasks/:id` and the list endpoint(s) select and return `source_kind`
and `source_record_id`. Shape:

```ts
{ ...task, sourceKind: string | null, sourceRecordId: string | null }
```

### 6. Frontend

Find the task detail component (sidebar/modal) and render:

```tsx
{task.sourceKind === "email" && task.sourceRecordId && (
  <a
    href={`https://mail.google.com/mail/u/0/#inbox/${task.sourceRecordId}`}
    target="_blank"
    rel="noreferrer"
  >
    Reply in Gmail →
  </a>
)}
```

No 3-message preview card in v1 — the issue body lists it but the
acceptance only requires the link + inline-visible source indication.
That lands in v2 (would require an extra Gmail API fetch or a stored
`last_messages` JSONB on the canonical event).

### 7. Tests

- **Executor unit test** (existing suite under `packages/db/tests` if
  present, otherwise new): `task_create` with `sourceMemoryEntryId`
  copies the memory entry's source fields to the task. Invalid ID →
  task still created, source fields stay null.
- **API test**: `GET /tasks/:id` returns the two new fields.

## Out of scope

- 3-message preview card (v2, per issue body)
- LLM-drafted reply that syncs back to the Gmail thread (v2)
- Backfill of existing tasks (new linkage only applies going forward)
- Non-Gmail source kinds in the UI (Slack/calendar — the data model
  supports them but the UI v1 only wires the Gmail button; other
  source kinds render no button)
