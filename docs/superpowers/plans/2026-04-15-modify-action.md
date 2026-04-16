# Modify Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken "click Modify → dropped into chat with no capability" flow with an inline Modify panel that lets users edit a pending Larry suggestion via structured fields or a focused chat, review the diff, and commit with a single Save & execute action.

**Architecture:** Mutate the pending `larry_events` row in place with a `previous_payload` audit snapshot. Reuse the existing accept flow transactionally after applying the edit. Keep edits client-side until Save. Chat path uses a dedicated endpoint whose LLM has one tool — `apply_modification` — that returns a payload patch only.

**Tech Stack:** Fastify (api), Next.js App Router (web), Vitest (unit/integration), Playwright (e2e), PostgreSQL, AI SDK v6 + Groq, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-15-modify-action-design.md`

**Deployment reality:** Testing happens on deployed preview per `larry-testing-tools` / `testing-on-production` memories. Fergus does not run locally. Every phase ends with a push; verify the Railway + Vercel deploy before moving on.

---

## Phase 1 — Data model foundations

### Task 1: Migration 020 — audit columns on larry_events

**Files:**
- Create: `packages/db/src/migrations/020_larry_event_modifications.sql`
- Modify: `packages/db/src/schema.sql` (append columns to `larry_events` definition near the existing `ALTER TABLE … ADD COLUMN IF NOT EXISTS` block around line 1099)

- [ ] **Step 1: Write the migration file**

```sql
-- 020_larry_event_modifications.sql
-- Adds audit columns for the Modify Action flow (spec 2026-04-15-modify-action-design.md).
-- previous_payload stores the payload before the user's most recent in-place edit so
-- before/after is recoverable from a single row. Nullable so existing rows are unaffected.

ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS previous_payload    JSONB,
  ADD COLUMN IF NOT EXISTS modified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_at         TIMESTAMPTZ;

COMMENT ON COLUMN larry_events.previous_payload IS
  'Snapshot of payload before the most recent user edit via Modify. NULL if the event has never been modified.';
COMMENT ON COLUMN larry_events.modified_by_user_id IS
  'User who most recently applied a Modify edit to this event.';
COMMENT ON COLUMN larry_events.modified_at IS
  'Timestamp of the most recent Modify edit on this event.';
```

- [ ] **Step 2: Append the same ALTERs to `schema.sql`**

In `packages/db/src/schema.sql`, directly after the final `ADD COLUMN IF NOT EXISTS` on `larry_events` (around line 1103), append:

```sql
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS previous_payload    JSONB;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS modified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS modified_at         TIMESTAMPTZ;
```

- [ ] **Step 3: Run migrations locally (or in test harness) to verify syntax**

Run: `cd packages/db && npm run migrate:apply 2>&1 | tail -20` (or equivalent — check `package.json` scripts if unclear).
Expected: the new migration reports applied, no SQL errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/020_larry_event_modifications.sql packages/db/src/schema.sql
git commit -m "feat(db): add modify-action audit columns to larry_events (migration 020)"
```

---

### Task 2: Pure `applyEventModification` helper

**Files:**
- Create: `packages/db/src/larry-event-modifications.ts`
- Create: `packages/db/src/larry-event-modifications.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/db/src/larry-event-modifications.test.ts
import { describe, expect, it } from "vitest";
import {
  applyPatch,
  editableFieldsForActionType,
  assertPatchIsAllowed,
} from "./larry-event-modifications.js";

describe("editableFieldsForActionType", () => {
  it("returns task fields for create_task", () => {
    expect(editableFieldsForActionType("create_task")).toEqual([
      "title", "description", "dueDate", "assigneeName", "priority",
    ]);
  });
  it("returns single-field sets for tweak-only actions", () => {
    expect(editableFieldsForActionType("change_deadline")).toEqual(["newDeadline"]);
    expect(editableFieldsForActionType("change_task_owner")).toEqual(["newOwnerName"]);
    expect(editableFieldsForActionType("flag_task_risk")).toEqual(["riskLevel"]);
  });
  it("returns empty for unknown types", () => {
    expect(editableFieldsForActionType("does_not_exist")).toEqual([]);
  });
});

describe("applyPatch", () => {
  it("merges patch over payload, preserving untouched keys", () => {
    const base = { title: "A", dueDate: "2026-04-20", priority: "medium" };
    const patch = { dueDate: "2026-04-30" };
    expect(applyPatch(base, patch)).toEqual({
      title: "A", dueDate: "2026-04-30", priority: "medium",
    });
  });
  it("does not mutate the original payload", () => {
    const base = { title: "A" };
    applyPatch(base, { title: "B" });
    expect(base).toEqual({ title: "A" });
  });
});

describe("assertPatchIsAllowed", () => {
  it("accepts a patch whose keys are all editable for the action type", () => {
    expect(() =>
      assertPatchIsAllowed("create_task", { title: "A", dueDate: "2026-05-01" })
    ).not.toThrow();
  });
  it("throws on a disallowed field", () => {
    expect(() =>
      assertPatchIsAllowed("create_task", { taskId: "abc" })
    ).toThrow(/not editable.*create_task/i);
  });
  it("throws on unknown action type", () => {
    expect(() =>
      assertPatchIsAllowed("mystery_action", { anything: "x" })
    ).toThrow(/unknown action type/i);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `cd packages/db && npx vitest run src/larry-event-modifications.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/db/src/larry-event-modifications.ts
// Pure helpers for the Modify Action flow (spec 2026-04-15). No DB access.

export type ActionType =
  | "create_task" | "update_task_status" | "flag_task_risk"
  | "send_reminder" | "change_deadline" | "change_task_owner"
  | "draft_email";

const FIELDS_BY_ACTION_TYPE: Record<string, readonly string[]> = {
  create_task:        ["title", "description", "dueDate", "assigneeName", "priority"],
  update_task_status: ["newStatus", "newRiskLevel"],
  flag_task_risk:     ["riskLevel"],
  change_deadline:    ["newDeadline"],
  change_task_owner:  ["newOwnerName"],
  draft_email:        ["to", "subject", "body"],
  // send_reminder auto-executes; not modifiable.
};

export function editableFieldsForActionType(actionType: string): string[] {
  return [...(FIELDS_BY_ACTION_TYPE[actionType] ?? [])];
}

export function applyPatch(
  payload: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...payload, ...patch };
}

export function assertPatchIsAllowed(
  actionType: string,
  patch: Record<string, unknown>,
): void {
  const allowed = FIELDS_BY_ACTION_TYPE[actionType];
  if (!allowed) {
    throw new Error(`Unknown action type '${actionType}' — cannot modify.`);
  }
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `Field '${key}' is not editable for action type '${actionType}'. Allowed: ${allowed.join(", ")}.`,
      );
    }
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `cd packages/db && npx vitest run src/larry-event-modifications.test.ts`
Expected: 3 suites, 7 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/larry-event-modifications.ts packages/db/src/larry-event-modifications.test.ts
git commit -m "feat(db): add pure helpers for modify-action payload patches"
```

---

## Phase 2 — Refactor accept into a reusable executor

### Task 3: Extract `runAcceptFlow` from the accept route

Rationale: Save & execute must run the same post-accept logic (executeAction, retry-with-resolution, markLarryEventAccepted, correction_feedback, audit log). Extracting avoids copy-paste drift.

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts` (the `POST /events/:id/accept` handler, currently lines 1550-1820 approx)
- Create: `apps/api/src/routes/v1/larry-accept-flow.ts` (new module holding the extracted function)
- Create: `apps/api/src/routes/v1/larry-accept-flow.test.ts` (regression guard)

- [ ] **Step 1: Write a regression test first (happy path only — the retry branches are integration-tested via the existing accept route)**

```ts
// apps/api/src/routes/v1/larry-accept-flow.test.ts
import { describe, expect, it, vi } from "vitest";
import { runAcceptFlow } from "./larry-accept-flow.js";

describe("runAcceptFlow", () => {
  it("calls executeAction with merged payload and marks event accepted", async () => {
    const executeAction = vi.fn().mockResolvedValue({ id: "task-123" });
    const markAccepted = vi.fn().mockResolvedValue(undefined);
    const writeCorrection = vi.fn().mockResolvedValue(undefined);

    const result = await runAcceptFlow({
      tenantId: "t1",
      actorUserId: "u1",
      event: {
        id: "e1", projectId: "p1", actionType: "create_task",
        payload: { title: "X" }, displayText: "Create task: X",
      },
      deps: { executeAction, markAccepted, writeCorrection, logger: { info: vi.fn(), warn: vi.fn() } },
    });

    expect(executeAction).toHaveBeenCalledOnce();
    expect(markAccepted).toHaveBeenCalledWith(expect.anything(), "t1", "e1", "u1");
    expect(writeCorrection).toHaveBeenCalledOnce();
    expect(result.entity).toEqual({ id: "task-123" });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL (module missing)**

Run: `cd apps/api && npx vitest run src/routes/v1/larry-accept-flow.test.ts`

- [ ] **Step 3: Extract the implementation**

Create `apps/api/src/routes/v1/larry-accept-flow.ts` exporting `runAcceptFlow` that accepts the event + deps and returns `{ entity, updatedEvent }`. The function contains the body of the current accept handler from line 1579 (`let entity: unknown; try { ... }`) through the retry logic and `markLarryEventAccepted` + correction_feedback write, but NOT the HTTP reply formatting. Errors that would have become 422 replies are thrown as a typed `AcceptFlowError` class carrying `{ statusCode, message, originalError, resolvable, candidates }`.

- [ ] **Step 4: Update the accept route to call `runAcceptFlow`**

Replace lines ~1579-1805 of `apps/api/src/routes/v1/larry.ts` with a call to `runAcceptFlow`, catching `AcceptFlowError` to produce the 422 reply, keeping everything else (audit logs, listLarryEventSummaries, toast metadata) in the route handler.

- [ ] **Step 5: Run the existing accept integration tests**

Run: `cd apps/api && npx vitest run tests/larry-event-id-uuid-guard.test.ts tests/larry-chat.test.ts`
Expected: all pass — no behaviour change.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/larry-accept-flow.ts apps/api/src/routes/v1/larry-accept-flow.test.ts apps/api/src/routes/v1/larry.ts
git commit -m "refactor(api): extract runAcceptFlow so Modify can reuse it"
```

---

## Phase 3 — API endpoints for Modify

### Task 4: Rewrite `POST /events/:id/modify` to return editable snapshot

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts` lines ~1907-2029
- Create: `apps/api/tests/larry-modify-snapshot.test.ts`

- [ ] **Step 1: Write the failing API test**

```ts
// apps/api/tests/larry-modify-snapshot.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { buildTestApp, seedSuggestedEvent, seedTenantAndUser } from "./helpers/app.js";

describe("POST /v1/larry/events/:id/modify (snapshot)", () => {
  it("returns the current payload + editable fields, without mutating event state", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task",
      payload: { title: "Write brief", dueDate: "2026-04-20", priority: "medium" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/larry/events/${eventId}/modify`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eventId).toBe(eventId);
    expect(body.actionType).toBe("create_task");
    expect(body.payload).toEqual({ title: "Write brief", dueDate: "2026-04-20", priority: "medium" });
    expect(body.editableFields).toEqual(["title", "description", "dueDate", "assigneeName", "priority"]);
    expect(Array.isArray(body.teamMembers)).toBe(true);

    // Event must still be 'suggested' — no mutation on open.
    const stillPending = await app.inject({
      method: "GET",
      url: `/v1/larry/events/${eventId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stillPending.json().eventType).toBe("suggested");
  });

  it("409 when the event is not suggested", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task", payload: { title: "X" }, eventType: "accepted",
    });
    const res = await app.inject({
      method: "POST", url: `/v1/larry/events/${eventId}/modify`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
  });
});
```

If `seedSuggestedEvent` doesn't exist with this signature, extend `apps/api/tests/helpers/app.ts` to provide it before writing this test. Its job is to insert a single `larry_events` row with the given fields and return the id.

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/api && npx vitest run tests/larry-modify-snapshot.test.ts`

- [ ] **Step 3: Replace the modify handler body**

In `apps/api/src/routes/v1/larry.ts`, replace the current `/events/:id/modify` handler body (from `const event = await getLarryEventForMutation...` to the `return reply.code(200).send({ conversationId, eventId: id });`) with:

```ts
const event = await getLarryEventForMutation(fastify.db, tenantId, id);
if (!event) throw fastify.httpErrors.notFound("Event not found.");
await assertProjectAccessOrThrow({
  tenantId, userId: actorUserId, tenantRole: request.user.role,
  projectId: event.projectId, mode: "manage", requireWritable: true,
});
if (event.eventType !== "suggested") {
  throw fastify.httpErrors.conflict("Only suggested events can be modified.");
}

const teamMembers = await fastify.db.queryTenant<{
  userId: string; displayName: string; email: string;
}>(
  tenantId,
  `SELECT u.id AS "userId", u.display_name AS "displayName", u.email
     FROM users u
     JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.tenant_id = $1 AND pm.project_id = $2`,
  [tenantId, event.projectId],
);

return reply.code(200).send({
  eventId: id,
  actionType: event.actionType,
  displayText: event.displayText,
  reasoning: event.reasoning,
  payload: event.payload ?? {},
  editableFields: editableFieldsForActionType(event.actionType),
  teamMembers,
});
```

Add an import at the top of the file:

```ts
import { editableFieldsForActionType } from "@larry/db";
```

(Re-export `editableFieldsForActionType` from `packages/db/src/index.ts` if not already.)

Remove the old logic: opener-message insertion, conversation creation, `markLarryEventDismissed` call, and the now-unused helper code it referenced. Double-check via `grep -n "openerMessage\|currentLine\|readString" apps/api/src/routes/v1/larry.ts` — if these are only referenced by the removed block, delete them.

- [ ] **Step 4: Run test, expect PASS**

Run: `cd apps/api && npx vitest run tests/larry-modify-snapshot.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/db/src/index.ts
git commit -m "feat(api): rewrite /events/:id/modify to return editable snapshot instead of dismissing"
```

---

### Task 5: New `POST /events/:id/modify/save` endpoint

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`
- Create: `apps/api/tests/larry-modify-save.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/larry-modify-save.test.ts
import { describe, expect, it } from "vitest";
import { buildTestApp, seedSuggestedEvent, seedTenantAndUser } from "./helpers/app.js";

describe("POST /v1/larry/events/:id/modify/save", () => {
  it("applies the patch, snapshots previous_payload, executes, marks accepted", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task",
      payload: { title: "Write brief", dueDate: "2026-04-20", priority: "medium" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/larry/events/${eventId}/modify/save`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadPatch: { dueDate: "2026-04-30" }, executeImmediately: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.executed).toBe(true);
    expect(body.event.eventType).toBe("accepted");

    // Event row has previous_payload + modified_by set.
    const row = await app.db.queryTenant(tenantId,
      `SELECT previous_payload, modified_by_user_id, payload FROM larry_events WHERE id = $1`,
      [eventId],
    );
    expect(row[0].previous_payload.dueDate).toBe("2026-04-20");
    expect(row[0].payload.dueDate).toBe("2026-04-30");
    expect(row[0].modified_by_user_id).toBe(userId);
  });

  it("409 when event was accepted in another tab between open and save", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task", payload: { title: "X" }, eventType: "accepted",
    });
    const res = await app.inject({
      method: "POST", url: `/v1/larry/events/${eventId}/modify/save`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadPatch: { title: "Y" }, executeImmediately: true },
    });
    expect(res.statusCode).toBe(409);
  });

  it("422 on patch with disallowed field", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task", payload: { title: "X" },
    });
    const res = await app.inject({
      method: "POST", url: `/v1/larry/events/${eventId}/modify/save`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadPatch: { taskId: "abc" }, executeImmediately: true },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/not editable/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add the handler**

Inside `registerLarryRoutes` (below the existing `/events/:id/modify` handler), add:

```ts
const ModifySaveBodySchema = z.object({
  payloadPatch: z.record(z.unknown()),
  executeImmediately: z.boolean(),
  conversationId: z.string().uuid().optional(),
});

fastify.post(
  "/events/:id/modify/save",
  { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
  async (request, reply) => {
    const tenantId = request.user.tenantId;
    const actorUserId = request.user.userId;
    const { id } = request.params as { id: string };
    if (!isUuidShape(id)) throw fastify.httpErrors.badRequest("Invalid event id.");

    const parsed = ModifySaveBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw fastify.httpErrors.badRequest(parsed.error.issues[0]?.message ?? "Invalid body.");
    }
    const { payloadPatch, executeImmediately } = parsed.data;

    // Re-fetch under the suggested guard — race-safe against concurrent accept.
    const event = await getLarryEventForMutation(fastify.db, tenantId, id);
    if (!event) throw fastify.httpErrors.notFound("Event not found.");
    await assertProjectAccessOrThrow({
      tenantId, userId: actorUserId, tenantRole: request.user.role,
      projectId: event.projectId, mode: "manage", requireWritable: true,
    });
    if (event.eventType !== "suggested") {
      throw fastify.httpErrors.conflict("This suggestion was already resolved elsewhere.");
    }

    try {
      assertPatchIsAllowed(event.actionType, payloadPatch);
    } catch (err) {
      throw fastify.httpErrors.unprocessableEntity(err instanceof Error ? err.message : String(err));
    }

    const nextPayload = applyPatch(event.payload ?? {}, payloadPatch);

    // Persist the edit. Transaction: snapshot previous_payload + update payload,
    // then (if executeImmediately) run the accept flow inside the same transaction
    // so a failed executor rolls back the edit.
    const result = await fastify.db.withTenantTransaction(tenantId, async (tx) => {
      await tx.query(
        `UPDATE larry_events
            SET previous_payload    = COALESCE(previous_payload, payload),
                payload             = $3::jsonb,
                modified_by_user_id = $4,
                modified_at         = NOW()
          WHERE tenant_id = $1 AND id = $2 AND event_type = 'suggested'`,
        [tenantId, id, JSON.stringify(nextPayload), actorUserId],
      );

      if (!executeImmediately) return { executed: false, entity: null };

      const updatedEvent = { ...event, payload: nextPayload };
      const accept = await runAcceptFlow({
        tenantId, actorUserId, event: updatedEvent,
        deps: {
          executeAction: (...args) => executeAction(tx, ...args.slice(1)),
          markAccepted: (db, t, eid, actor) => markLarryEventAccepted(tx, t, eid, actor),
          writeCorrection: (fb) => tx.query(
            `INSERT INTO correction_feedback (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
             VALUES ($1, $2, $3, 'accepted', $4::jsonb)`,
            [tenantId, id, actorUserId, JSON.stringify(fb)],
          ),
          logger: request.log,
        },
      });
      return { executed: true, entity: accept.entity };
    });

    const [updated] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });
    return reply.code(200).send({ event: updated, executed: result.executed, entity: result.entity });
  },
);
```

Add imports at the top: `assertPatchIsAllowed`, `applyPatch` from `@larry/db`; `runAcceptFlow` from `./larry-accept-flow.js`.

If `fastify.db.withTenantTransaction` doesn't exist, check existing usage in `apps/api/src/routes/v1/larry.ts` for the project's transaction pattern and adapt accordingly.

- [ ] **Step 4: Run tests, expect PASS**

Run: `cd apps/api && npx vitest run tests/larry-modify-save.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add POST /events/:id/modify/save endpoint"
```

---

### Task 6: New `POST /events/:id/modify/stop` endpoint

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`
- Create: `apps/api/tests/larry-modify-stop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/larry-modify-stop.test.ts
import { describe, expect, it } from "vitest";
import { buildTestApp, seedSuggestedEvent, seedTenantAndUser } from "./helpers/app.js";

describe("POST /v1/larry/events/:id/modify/stop", () => {
  it("returns 200 and writes an audit log, with no event-state change", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task", payload: { title: "X" },
    });

    const res = await app.inject({
      method: "POST", url: `/v1/larry/events/${eventId}/modify/stop`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    const row = await app.db.queryTenant(tenantId,
      `SELECT event_type FROM larry_events WHERE id = $1`, [eventId],
    );
    expect(row[0].event_type).toBe("suggested");

    const audit = await app.db.queryTenant(tenantId,
      `SELECT action_type FROM audit_logs WHERE object_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [eventId],
    );
    expect(audit[0].action_type).toBe("larry.event.modify_cancelled");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add the handler**

```ts
fastify.post(
  "/events/:id/modify/stop",
  { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
  async (request, reply) => {
    const tenantId = request.user.tenantId;
    const actorUserId = request.user.userId;
    const { id } = request.params as { id: string };
    if (!isUuidShape(id)) throw fastify.httpErrors.badRequest("Invalid event id.");

    const event = await getLarryEventForMutation(fastify.db, tenantId, id);
    if (!event) throw fastify.httpErrors.notFound("Event not found.");
    await assertProjectAccessOrThrow({
      tenantId, userId: actorUserId, tenantRole: request.user.role,
      projectId: event.projectId, mode: "manage", requireWritable: true,
    });

    await writeAuditLog(fastify.db, {
      tenantId, actorUserId,
      actionType: "larry.event.modify_cancelled",
      objectType: "larry_event", objectId: id,
      details: { actionType: event.actionType },
    });

    return reply.code(200).send({ ok: true });
  },
);
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add POST /events/:id/modify/stop endpoint"
```

---

### Task 7: New `POST /events/:id/modify-chat` endpoint

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`
- Create: `apps/api/tests/larry-modify-chat.test.ts`
- (Depends on) AI package work in Task 8; do Task 8 before this step 3.

- [ ] **Step 1: Write failing test (mock the AI)**

```ts
// apps/api/tests/larry-modify-chat.test.ts
import { describe, expect, it, vi } from "vitest";
import { buildTestApp, seedSuggestedEvent, seedTenantAndUser } from "./helpers/app.js";

vi.mock("@larry/ai", async (orig) => {
  const real = await orig<typeof import("@larry/ai")>();
  return {
    ...real,
    streamModifyChat: async function* () {
      yield { type: "token", delta: "Pushed the deadline. " };
      yield { type: "tool_done", name: "apply_modification", success: true,
              payloadPatch: { dueDate: "2026-04-30" }, summary: "Pushed the deadline to 30 Apr." };
      yield { type: "done", messageId: "msg-1" };
    },
  };
});

describe("POST /v1/larry/events/:id/modify-chat", () => {
  it("returns the assistant message and the tool-produced payloadPatch", async () => {
    const app = await buildTestApp();
    const { tenantId, token, userId } = await seedTenantAndUser(app);
    const eventId = await seedSuggestedEvent(app, tenantId, userId, {
      actionType: "create_task",
      payload: { title: "X", dueDate: "2026-04-20" },
    });
    const res = await app.inject({
      method: "POST", url: `/v1/larry/events/${eventId}/modify-chat`,
      headers: { authorization: `Bearer ${token}` },
      payload: { message: "push to 30 Apr", currentPayload: { title: "X", dueDate: "2026-04-20" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.payloadPatch).toEqual({ dueDate: "2026-04-30" });
    expect(body.summary).toMatch(/30 Apr/);
    expect(body.message).toContain("Pushed the deadline");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add the handler (after Task 8 ships `streamModifyChat`)**

The handler should:
1. Validate `{ message: string, currentPayload: Record<string, unknown>, conversationId?: string }`.
2. Re-fetch event with `event_type = 'suggested'` guard → 409 otherwise.
3. Create or reuse a `larry_conversations` row titled `Modify: <truncated displayText>`.
4. Insert the user message via `insertLarryMessage`.
5. Pull team members (same query as Task 4).
6. Stream `streamModifyChat({ config, event, currentPayload, teamMembers, messages })` accumulating token text and capturing the first `apply_modification` tool result.
7. Insert the assistant message.
8. Return `{ conversationId, messageId, message, payloadPatch, summary, linkedActions: [] }`.

Use the existing global chat flow (`/chat` handler around line 2393) as a template for conversation + message persistence.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add POST /events/:id/modify-chat with apply_modification tool"
```

---

## Phase 4 — AI chat: apply_modification tool

### Task 8: `buildModifySystemPrompt` + `streamModifyChat` in `@larry/ai`

**Files:**
- Create: `packages/ai/src/modify-chat.ts`
- Create: `packages/ai/src/modify-chat.test.ts`
- Modify: `packages/ai/src/index.ts` (export new functions)

- [ ] **Step 1: Write prompt-builder tests**

```ts
// packages/ai/src/modify-chat.test.ts
import { describe, expect, it } from "vitest";
import { buildModifySystemPrompt } from "./modify-chat.js";

describe("buildModifySystemPrompt", () => {
  it("embeds display text, reasoning, current payload, editable fields, team", () => {
    const prompt = buildModifySystemPrompt({
      actionType: "create_task",
      displayText: "Create task: Draft kickoff email",
      reasoning: "Kickoff is next Monday.",
      currentPayload: { title: "Draft kickoff email", dueDate: "2026-04-20", priority: "medium" },
      editableFields: ["title", "description", "dueDate", "assigneeName", "priority"],
      teamMembers: [{ displayName: "Anna" }, { displayName: "Priya" }],
    });
    expect(prompt).toContain("Create task: Draft kickoff email");
    expect(prompt).toContain("Kickoff is next Monday.");
    expect(prompt).toContain('"dueDate": "2026-04-20"');
    expect(prompt).toMatch(/editable fields[^\n]*dueDate/i);
    expect(prompt).toContain("Anna");
    expect(prompt).toContain("Priya");
    expect(prompt).toMatch(/only call apply_modification/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `buildModifySystemPrompt`**

```ts
// packages/ai/src/modify-chat.ts
import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import type { IntelligenceConfig } from "@larry/shared";
import { createModel } from "./provider.js";
import { computeDateContext } from "./chat.js";

export interface ModifyChatContext {
  actionType: string;
  displayText: string;
  reasoning: string;
  currentPayload: Record<string, unknown>;
  editableFields: string[];
  teamMembers: { displayName: string }[];
}

export function buildModifySystemPrompt(ctx: ModifyChatContext): string {
  const d = computeDateContext();
  const team = ctx.teamMembers.map((m) => m.displayName).join(", ") || "(no team members on this project)";
  return `You are Larry. The user has opened the Modify panel on a pending suggestion and wants to change something before accepting it.

TODAY: ${d.dayOfWeek}, ${d.today}. next Monday = ${d.nextMonday}. next Friday = ${d.nextFriday}.

## THE SUGGESTION BEING MODIFIED

- Action type: ${ctx.actionType}
- Display text: ${ctx.displayText}
- Original reasoning: ${ctx.reasoning}
- Current payload:
${JSON.stringify(ctx.currentPayload, null, 2)}

## EDITABLE FIELDS

${ctx.editableFields.join(", ")}

You can ONLY change fields in that list. Ignore user requests to change other fields; say what you can and can't change.

## TEAM MEMBERS ON THIS PROJECT

${team}

If the user names someone not on this list, do not silently drop them. Ask who they meant.

## YOUR ONE TOOL

Call \`apply_modification\` exactly once per turn, with only the fields the user's message changes. Use a short past-tense summary ("Pushed deadline to 30 Apr and reassigned to Anna."). If the user's message is a clarifying question with no change, do not call the tool — just answer in prose.

Never call any other tool. This conversation is for modifying one pending suggestion, nothing else.

## STYLE

Direct, short, conversational. Don't restate the whole payload. Don't announce tool calls — call the tool and continue the sentence.`;
}

export type ModifyChatStreamEvent =
  | { type: "token"; delta: string }
  | { type: "tool_done"; name: "apply_modification"; success: boolean; payloadPatch: Record<string, unknown>; summary: string }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export async function* streamModifyChat(input: {
  config: IntelligenceConfig;
  messages: ModelMessage[];
  context: ModifyChatContext;
}): AsyncGenerator<ModifyChatStreamEvent> {
  const { config, messages, context } = input;
  if (config.provider === "mock" || !config.apiKey) {
    yield { type: "token", delta: "(mock modify) no API key configured." };
    yield { type: "done", messageId: "mock" };
    return;
  }
  const model = createModel(config);
  const tools = {
    apply_modification: tool({
      description: "Apply the user-described change to the pending suggestion's payload. Call exactly once per turn, or zero times for a clarifying question.",
      inputSchema: z.object({
        payloadPatch: z.record(z.unknown()).describe("Only the fields that change; keys must be in the editable fields list."),
        summary: z.string().describe("One short past-tense sentence summarising the change."),
      }),
      execute: async (p) => ({ ok: true, payloadPatch: p.payloadPatch, summary: p.summary }),
    }),
  };
  const result = streamText({
    model, system: buildModifySystemPrompt(context), messages, tools,
    stopWhen: stepCountIs(2), maxRetries: 1,
  });
  for await (const chunk of result.fullStream) {
    const c = chunk as { type?: string } & Record<string, unknown>;
    if (c.type === "text-delta") {
      const text = (c as { text?: string }).text;
      if (typeof text === "string" && text.length > 0) yield { type: "token", delta: text };
    } else if (c.type === "tool-result") {
      const t = c as { toolName: string; output?: { payloadPatch: Record<string, unknown>; summary: string } };
      if (t.toolName === "apply_modification" && t.output) {
        yield { type: "tool_done", name: "apply_modification", success: true,
                payloadPatch: t.output.payloadPatch, summary: t.output.summary };
      }
    } else if (c.type === "error") {
      const e = c as { error: unknown };
      yield { type: "error", message: e.error instanceof Error ? e.error.message : String(e.error) };
    }
  }
}
```

- [ ] **Step 4: Export and run tests**

Add `export * from "./modify-chat.js";` to `packages/ai/src/index.ts`. Run: `cd packages/ai && npx vitest run src/modify-chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai
git commit -m "feat(ai): add streamModifyChat with apply_modification tool"
```

---

## Phase 5 — Next.js proxy routes

### Task 9: Rewrite `/api/workspace/larry/events/[id]/modify` proxy + add 3 new route handlers

**Files:**
- Modify: `apps/web/src/app/api/workspace/larry/events/[id]/modify/route.ts`
- Create: `apps/web/src/app/api/workspace/larry/events/[id]/modify/save/route.ts`
- Create: `apps/web/src/app/api/workspace/larry/events/[id]/modify/stop/route.ts`
- Create: `apps/web/src/app/api/workspace/larry/events/[id]/modify-chat/route.ts`

- [ ] **Step 1: Rewrite `modify/route.ts`**

The existing file already proxies to `/v1/larry/events/${id}/modify`. The upstream shape changed (returns `{ eventId, actionType, displayText, reasoning, payload, editableFields, teamMembers }` now). The proxy itself doesn't need structural changes beyond removing the hard-coded `body: JSON.stringify({})` (keep it — Fastify accepts empty body).

Confirm via test:

```ts
// apps/web/e2e/modify-proxy.spec.ts — deferred to Task 14.
```

No code change needed if existing file already proxies generically. Otherwise replace with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const result = await proxyApiRequest(session, `/v1/larry/events/${id}/modify`, { method: "POST", body: JSON.stringify({}) });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Create `modify/save/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.text();
  const result = await proxyApiRequest(session, `/v1/larry/events/${id}/modify/save`, { method: "POST", body });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Create `modify/stop/route.ts`**

Same shape as save, targeting `/v1/larry/events/${id}/modify/stop`.

- [ ] **Step 4: Create `modify-chat/route.ts`**

Same shape, targeting `/v1/larry/events/${id}/modify-chat`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/workspace/larry/events
git commit -m "feat(web): add Next.js proxy routes for Modify save/stop/modify-chat"
```

---

## Phase 6 — React Modify panel

### Task 10: `useModifyPanel` hook

**Files:**
- Create: `apps/web/src/hooks/useModifyPanel.ts`
- Create: `apps/web/src/hooks/useModifyPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Testing approach: mock `fetch`, render a dummy consumer of the hook, assert state transitions (`idle → loading → editing → saving → idle|conflict`), and that `applyPatch` merges correctly.

```tsx
// apps/web/src/hooks/useModifyPanel.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useModifyPanel } from "./useModifyPanel.js";

describe("useModifyPanel", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("open() fetches the snapshot and transitions to 'editing'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      eventId: "e1", actionType: "create_task",
      displayText: "Create task: X", reasoning: "why",
      payload: { title: "X", dueDate: "2026-04-20" },
      editableFields: ["title", "description", "dueDate", "assigneeName", "priority"],
      teamMembers: [{ userId: "u", displayName: "Anna", email: "a@x" }],
    }), { status: 200 })));

    const { result } = renderHook(() => useModifyPanel());
    await act(() => result.current.open("e1"));
    await waitFor(() => expect(result.current.state).toBe("editing"));
    expect(result.current.snapshot?.payload.dueDate).toBe("2026-04-20");
  });

  it("applyPatch merges into the working payload and updates the diff", async () => {
    // ... fetch stub same as above ...
    const { result } = renderHook(() => useModifyPanel());
    await act(() => result.current.open("e1"));
    act(() => result.current.applyPatch({ dueDate: "2026-04-30" }));
    expect(result.current.workingPayload?.dueDate).toBe("2026-04-30");
    expect(result.current.diff).toEqual([
      { key: "dueDate", before: "2026-04-20", after: "2026-04-30" },
    ]);
  });

  it("saveAndExecute posts the patch and returns the server result", async () => {
    // stub snapshot fetch + save fetch
    // ...
  });

  it("stop() calls the stop endpoint and returns to idle", async () => { /* ... */ });

  it("on 409 save response, transitions to 'conflict'", async () => { /* ... */ });
});
```

Flesh each test body with full stubs when implementing.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/hooks/useModifyPanel.ts
"use client";
import { useCallback, useMemo, useState } from "react";

type PanelState = "idle" | "loading" | "editing" | "saving" | "conflict";

export interface ModifySnapshot {
  eventId: string; actionType: string; displayText: string; reasoning: string;
  payload: Record<string, unknown>;
  editableFields: string[];
  teamMembers: { userId: string; displayName: string; email: string }[];
}

export interface DiffEntry { key: string; before: unknown; after: unknown }

export function useModifyPanel() {
  const [state, setState] = useState<PanelState>("idle");
  const [snapshot, setSnapshot] = useState<ModifySnapshot | null>(null);
  const [workingPayload, setWorkingPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (eventId: string) => {
    setState("loading"); setError(null);
    const res = await fetch(`/api/workspace/larry/events/${eventId}/modify`, { method: "POST" });
    if (!res.ok) {
      setState("idle");
      setError(res.status === 409 ? "This suggestion was already resolved." : "Couldn't open Modify.");
      return;
    }
    const snap = (await res.json()) as ModifySnapshot;
    setSnapshot(snap); setWorkingPayload(snap.payload); setState("editing");
  }, []);

  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    setWorkingPayload((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const diff = useMemo<DiffEntry[]>(() => {
    if (!snapshot || !workingPayload) return [];
    const out: DiffEntry[] = [];
    for (const key of Object.keys(workingPayload)) {
      if (snapshot.payload[key] !== workingPayload[key]) {
        out.push({ key, before: snapshot.payload[key], after: workingPayload[key] });
      }
    }
    return out;
  }, [snapshot, workingPayload]);

  const saveAndExecute = useCallback(async () => {
    if (!snapshot || !workingPayload) return null;
    setState("saving"); setError(null);
    const patch: Record<string, unknown> = {};
    for (const { key, after } of diff) patch[key] = after;
    const res = await fetch(`/api/workspace/larry/events/${snapshot.eventId}/modify/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payloadPatch: patch, executeImmediately: true }),
    });
    if (res.status === 409) { setState("conflict"); return null; }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Save failed."); setState("editing"); return null;
    }
    const body = await res.json();
    setState("idle"); setSnapshot(null); setWorkingPayload(null);
    return body;
  }, [diff, snapshot, workingPayload]);

  const stop = useCallback(async () => {
    if (snapshot) {
      await fetch(`/api/workspace/larry/events/${snapshot.eventId}/modify/stop`, { method: "POST" });
    }
    setState("idle"); setSnapshot(null); setWorkingPayload(null); setError(null);
  }, [snapshot]);

  const sendChat = useCallback(async (message: string): Promise<{ text: string; summary?: string } | null> => {
    if (!snapshot || !workingPayload) return null;
    const res = await fetch(`/api/workspace/larry/events/${snapshot.eventId}/modify-chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, currentPayload: workingPayload }),
    });
    if (!res.ok) { setError("Chat failed."); return null; }
    const body = await res.json() as { message: string; payloadPatch?: Record<string, unknown>; summary?: string };
    if (body.payloadPatch) applyPatch(body.payloadPatch);
    return { text: body.message, summary: body.summary };
  }, [snapshot, workingPayload, applyPatch]);

  return { state, snapshot, workingPayload, diff, error, open, applyPatch, saveAndExecute, stop, sendChat };
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks
git commit -m "feat(web): add useModifyPanel hook for the Modify panel state machine"
```

---

### Task 11: `ModifyDiff` component

**Files:**
- Create: `apps/web/src/app/workspace/_components/ModifyDiff.tsx`

- [ ] **Step 1: Component**

```tsx
"use client";
import type { DiffEntry } from "@/hooks/useModifyPanel";

const LABELS: Record<string, string> = {
  title: "Title", description: "Description", dueDate: "Due date",
  assigneeName: "Assignee", priority: "Priority", newDeadline: "New deadline",
  newOwnerName: "New owner", newStatus: "New status", newRiskLevel: "Risk level",
  riskLevel: "Risk level", to: "To", subject: "Subject", body: "Body",
};

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function ModifyDiff({ entries }: { entries: DiffEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No changes yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((e) => (
        <li key={e.key} className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-neutral-700">{LABELS[e.key] ?? e.key}:</span>
          <span className="text-neutral-500 line-through">{fmt(e.before)}</span>
          <span aria-hidden>→</span>
          <span className="text-[#6c44f6] font-medium">{fmt(e.after)}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/_components/ModifyDiff.tsx
git commit -m "feat(web): add ModifyDiff component"
```

---

### Task 12: `ModifyPanel` + per-type field components

**Files:**
- Create: `apps/web/src/app/workspace/_components/ModifyPanel.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/CreateTaskFields.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/ChangeDeadlineFields.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/ChangeTaskOwnerFields.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/UpdateTaskStatusFields.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/FlagTaskRiskFields.tsx`
- Create: `apps/web/src/app/workspace/_components/modify-fields/DraftEmailFields.tsx`

- [ ] **Step 1: Build each field component**

Each is a small uncontrolled-by-parent component: takes `{ payload, onPatch, teamMembers }`, renders the native inputs (`<input type="date">`, `<select>`, `<textarea>`), calls `onPatch({ field: nextValue })` on change. Keep them dumb — no state, no fetches.

Example:

```tsx
// modify-fields/ChangeDeadlineFields.tsx
export function ChangeDeadlineFields({
  payload, onPatch,
}: { payload: Record<string, unknown>; onPatch: (p: Record<string, unknown>) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">New deadline</span>
      <input type="date"
        value={typeof payload.newDeadline === "string" ? payload.newDeadline : ""}
        onChange={(e) => onPatch({ newDeadline: e.target.value })}
        className="rounded border border-neutral-300 px-2 py-1" />
    </label>
  );
}
```

Assignee / owner dropdowns pull from `teamMembers` and render an option per member's `displayName`.

- [ ] **Step 2: Build the panel**

```tsx
// ModifyPanel.tsx
"use client";
import { useState } from "react";
import type { ModifySnapshot, DiffEntry } from "@/hooks/useModifyPanel";
import { ModifyDiff } from "./ModifyDiff";
import { CreateTaskFields } from "./modify-fields/CreateTaskFields";
import { ChangeDeadlineFields } from "./modify-fields/ChangeDeadlineFields";
import { ChangeTaskOwnerFields } from "./modify-fields/ChangeTaskOwnerFields";
import { UpdateTaskStatusFields } from "./modify-fields/UpdateTaskStatusFields";
import { FlagTaskRiskFields } from "./modify-fields/FlagTaskRiskFields";
import { DraftEmailFields } from "./modify-fields/DraftEmailFields";

const FIELDS_BY_TYPE: Record<string, React.ComponentType<any>> = {
  create_task: CreateTaskFields,
  change_deadline: ChangeDeadlineFields,
  change_task_owner: ChangeTaskOwnerFields,
  update_task_status: UpdateTaskStatusFields,
  flag_task_risk: FlagTaskRiskFields,
  draft_email: DraftEmailFields,
};

export function ModifyPanel({
  snapshot, workingPayload, diff, state, error,
  onPatch, onSend, onSave, onStop,
}: {
  snapshot: ModifySnapshot;
  workingPayload: Record<string, unknown>;
  diff: DiffEntry[];
  state: "editing" | "saving" | "conflict";
  error: string | null;
  onPatch: (p: Record<string, unknown>) => void;
  onSend: (msg: string) => Promise<{ text: string; summary?: string } | null>;
  onSave: () => void;
  onStop: () => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ who: "you" | "larry"; text: string }[]>([]);
  const Fields = FIELDS_BY_TYPE[snapshot.actionType];

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatLog((log) => [...log, { who: "you", text: msg }]);
    setChatInput("");
    const reply = await onSend(msg);
    if (reply) setChatLog((log) => [...log, { who: "larry", text: reply.text }]);
  }

  if (state === "conflict") {
    return (
      <div className="rounded border border-amber-400 bg-amber-50 p-4 text-sm">
        This suggestion was already resolved in another tab. Refresh the Action Centre.
        <button onClick={onStop} className="ml-2 underline">Close</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-4 shadow-sm space-y-4">
      <header className="text-sm text-neutral-600">
        Editing: <span className="font-medium">{snapshot.displayText}</span>
      </header>

      {Fields ? (
        <Fields payload={workingPayload} onPatch={onPatch} teamMembers={snapshot.teamMembers} />
      ) : (
        <p className="text-sm text-neutral-500">This action type has no quick fields. Use chat below.</p>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
          placeholder="Anything a field can't capture? Describe the change…"
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1 text-sm text-white">Tell Larry</button>
      </form>
      {chatLog.length > 0 && (
        <div className="space-y-1 text-sm">
          {chatLog.map((entry, i) => (
            <div key={i}><strong>{entry.who === "you" ? "You" : "Larry"}:</strong> {entry.text}</div>
          ))}
        </div>
      )}

      <section className="rounded border border-neutral-200 bg-neutral-50 p-3">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Review</h4>
        <ModifyDiff entries={diff} />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onSave} disabled={state === "saving" || diff.length === 0}
          className="rounded bg-[#6c44f6] px-3 py-1 text-sm text-white disabled:opacity-50">
          {state === "saving" ? "Saving…" : "Save & execute"}
        </button>
        <button onClick={onStop} className="rounded border border-neutral-300 px-3 py-1 text-sm">
          Stop
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/_components
git commit -m "feat(web): add ModifyPanel + per-type field components"
```

---

### Task 13: Wire Action Centre and Project Overview to render the panel

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts` (the `modify` function currently navigates; make it the hook-orchestrated open instead)
- Modify: `apps/web/src/app/workspace/actions/page.tsx` (line 679 area + render panel below card when `modifyingEventId === event.id`)
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` (line 1273 area + render panel)

- [ ] **Step 1: In `useLarryActionCentre.ts`**

Replace the body of the existing `modify` callback (around line 215) with a simpler one that **does not** fetch — the panel's own `useModifyPanel` hook will do the fetch. The hook-level `modify` becomes a state signal:

```ts
const [modifyingEventId, setModifyingEventId] = useState<string | null>(null);
const modify = useCallback((id: string) => { setModifyingEventId(id); }, []);
const stopModifying = useCallback(() => { setModifyingEventId(null); }, []);
```

Return `modifyingEventId` and `stopModifying` in the hook's return value.

- [ ] **Step 2: In `actions/page.tsx`**

Below the existing action card JSX where buttons are rendered (around line 679), conditionally render the panel:

```tsx
{modifyingEventId === event.id && (
  <ModifyPanelContainer eventId={event.id}
    onFinished={async () => { stopModifying(); await refresh(); }} />
)}
```

Create a small `ModifyPanelContainer` inline that owns a local `useModifyPanel()`, calls `open(eventId)` on mount, and renders `<ModifyPanel />` with the hook's state. On successful save or stop, calls `onFinished`. Extract to its own file if it grows beyond ~40 lines.

Update the Modify button onClick to call `modify(event.id)` (no await, no navigation).

- [ ] **Step 3: Same wiring in `ProjectWorkspaceView.tsx`**

- [ ] **Step 4: Remove the `buildFullChatHref(..., "modify")` branch**

The chat launch for modify is gone — the panel replaces it. Remove any code paths that generate `launch=modify` URLs (`/workspace/larry/page.tsx` may also consume the `launch=modify` search param; delete that handling too).

Run `grep -rn "launch=modify\|launch.*modify" apps/web/src` before removing to confirm scope.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): wire Modify button to inline panel instead of chat redirect"
```

---

## Phase 7 — Feature flag, E2E, rollout

### Task 14: Feature flag `MODIFY_PANEL_V2`

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`
- Modify: `apps/api/src/routes/v1/larry.ts`

- [ ] **Step 1: Web flag**

Read `process.env.NEXT_PUBLIC_MODIFY_PANEL_V2` — when falsy, the Modify button stays hidden (do not fall back to the old chat redirect; the old code path is being deleted).

- [ ] **Step 2: API flag**

Not strictly needed — the API routes are additive / backwards-incompatible (old `/modify` return shape is replaced). If an extra safety margin is wanted, have the new `/modify/save` return 503 when `process.env.MODIFY_PANEL_V2 !== "1"` — but that complicates testing. Default to **flag is web-only.**

- [ ] **Step 3: Add flag defaults to `.env.example` and Vercel**

`.env.example`:
```
NEXT_PUBLIC_MODIFY_PANEL_V2=1
```

Per `larry-testing-tools` memory, `vercel env add` against preview + prod to set `NEXT_PUBLIC_MODIFY_PANEL_V2=1`.

- [ ] **Step 4: Commit**

```bash
git add .env.example apps/web/src/hooks/useLarryActionCentre.ts
git commit -m "feat(web): gate Modify panel behind NEXT_PUBLIC_MODIFY_PANEL_V2"
```

---

### Task 15: Playwright E2E

**Files:**
- Create: `apps/web/e2e/modify-action.spec.ts`

- [ ] **Step 1: Write the four scenarios from spec §9.3**

```ts
// apps/web/e2e/modify-action.spec.ts
import { test, expect } from "@playwright/test";
import { login, seedSuggestion } from "./helpers.js";

test.describe("Modify action", () => {
  test("quick-edit deadline, save and execute", async ({ page }) => {
    await login(page);
    const eventId = await seedSuggestion({ actionType: "create_task",
      payload: { title: "Write brief", dueDate: "2026-04-20", priority: "medium" } });
    await page.goto("/workspace/actions");
    await page.getByTestId(`action-modify-${eventId}`).click();
    await page.getByLabel("Due date").fill("2026-04-30");
    await expect(page.getByText("Due date: 2026-04-20 → 2026-04-30")).toBeVisible();
    await page.getByRole("button", { name: "Save & execute" }).click();
    await expect(page.getByTestId(`action-row-${eventId}`)).toBeHidden();
  });

  test("chat-driven edit", async ({ page }) => { /* ... */ });
  test("stop reverts panel, original stays pending", async ({ page }) => { /* ... */ });
  test("concurrent accept → conflict banner", async ({ page, browser }) => { /* ... */ });
});
```

Flesh out each when implementing. `seedSuggestion` is a Playwright-side helper that POSTs directly to the API with a test admin token — pattern already present in other e2e specs.

- [ ] **Step 2: Deploy preview, run tests against it**

```bash
git push
# Wait for Vercel preview + Railway deploy (monitor via `vercel inspect` / MCP)
npx playwright test apps/web/e2e/modify-action.spec.ts --reporter=list
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e
git commit -m "test(e2e): cover Modify panel flows"
```

---

### Task 16: Manual QA + notes

**Files:**
- Create: `docs/reports/qa-2026-04-15-modify/README.md`

- [ ] **Step 1: QA script**

For each of the 6 modifiable action types, manually:
1. Seed a suggestion (or wait for a real one in the Groq budget per `larry-groq-free-tier-tpd` — prefer seeding to preserve TPD).
2. Click Modify. Confirm panel opens, card greys out, Accept/Dismiss disabled on source card.
3. Change one field. Confirm diff updates live.
4. Click Save & execute. Confirm card disappears, task/email/etc. reflects edited values.
5. Seed another, open Modify, type in chat: "<scenario appropriate to type>". Confirm Larry's reply and diff update.
6. Seed another, open Modify, click Stop. Confirm card returns to normal with original payload.

Document anomalies in `docs/reports/qa-2026-04-15-modify/NOTES.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/reports/qa-2026-04-15-modify
git commit -m "docs(qa): record Modify panel manual QA notes (2026-04-15)"
```

---

## Done criteria

- Migration 020 applied in preview + prod.
- All Phase 1-2 unit tests green in CI.
- Phase 3 API integration tests green in CI.
- Playwright spec (Task 15) green on preview.
- Manual QA script (Task 16) passed for at least 3 action types on prod.
- `NEXT_PUBLIC_MODIFY_PANEL_V2=1` set in Vercel preview + prod envs.
- Old `launch=modify` chat entrypoint removed (confirm with grep).

---

## Self-review notes

- Spec §§1-10 are all covered; §11 (open questions) left open.
- `withTenantTransaction` assumed to exist — if the codebase uses a different pattern (e.g. a top-level `db.transaction`), Task 5 Step 3 should mirror whatever pattern the accept handler already uses.
- Task 3 (refactoring accept) is the riskiest — it touches a 245-line handler with retry branches. Keep the regression test (Step 5) as a gate before moving on.
- Tasks 4 and 7 depend on `seedSuggestedEvent` test helper; if absent, extend `apps/api/tests/helpers/app.ts` as the first action of Task 4.
- Task 12 intentionally keeps field components small (~15 lines each). Resist adding validation UI there — validation lives at the API boundary (Task 5).
- Rollback plan: set `NEXT_PUBLIC_MODIFY_PANEL_V2=0`; Modify button disappears; API endpoints remain but are unreachable from UI. No DB rollback needed (columns are nullable and additive).
