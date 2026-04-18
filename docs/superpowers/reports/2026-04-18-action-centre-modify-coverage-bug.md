# BUG: Action Centre Modify rejects most action types

**Date:** 2026-04-18
**Status:** Confirmed. Reproducible on prod.
**Severity:** P1 — visible broken-looking UX ("Action type 'X' is not modifiable.") on 10 of ~16 suggestion types.
**Repro evidence:** `scope_change` suggestion on prod; Modify → inline red error "Action type 'scope_change' is not modifiable." (screenshot on file).

## TL;DR for the fix agent

The Modify panel only supports **6 of ~16** action types because two coupled
allow-lists were never kept in sync with the action catalog:

- Backend: `FIELDS_BY_ACTION_TYPE` at `packages/db/src/larry-event-modifications.ts:15-23`
- Frontend: `FIELDS_BY_TYPE` at `apps/web/src/app/workspace/ModifyPanelFields.tsx:223-230`

Any suggestion whose `actionType` isn't in both maps hits `422 Unprocessable
Entity` with body `"Action type '<type>' is not modifiable."` on
`POST /v1/larry/events/:id/modify` (the open call), which is what the user
saw.

All "missing" action types **already have full executor support** in
`packages/db/src/larry-executor.ts`. So the fix is purely adding entries to
the two maps + per-type frontend renderers; no new backend executors needed.

## Root cause

### What works today (6 types)
`task_create`, `status_update`, `risk_flag`, `deadline_change`,
`owner_change`, `email_draft`.

### What's broken (rejected with 422)
Every other suggestion-eligible action type:

| actionType               | Payload fields (from system prompt / executor) | Proposed editable fields |
| ------------------------ | ---------------------------------------------- | ------------------------ |
| `scope_change`           | `{ entityId, entityType, newDescription }`     | `newDescription` |
| `project_create`         | `{ name, description, tasks[] }`               | `name`, `description` (tasks[] is complex — leave read-only in v1) |
| `collaborator_add`       | `{ userId, role, displayName }`                | `role` |
| `collaborator_role_update` | `{ userId, role }`                           | `role` |
| `collaborator_remove`    | `{ userId }`                                   | (no editable fields — the only "edit" is to dismiss) |
| `project_note_send`      | `{ visibility, content }`                      | `visibility`, `content` |
| `calendar_event_create`  | `{ summary, startDateTime, endDateTime }`      | `summary`, `startDateTime`, `endDateTime` |
| `calendar_event_update`  | `{ eventId, ...updateFields }`                 | the update fields (summary/start/end if present) |
| `slack_message_draft`    | `{ channelName, message }`                     | `channelName`, `message` |

`reminder_send` is intentionally excluded per the spec comment at
`larry-event-modifications.ts:22` ("auto-executes and never appears as a
suggestion"). Leave it out.

`collaborator_remove` has no genuinely-editable fields. Two options:
1. Keep it in the allow-list with `editableFields: []` and let the
   frontend say "Nothing to edit — Accept or Dismiss." (cleaner UX).
2. Leave it excluded so it keeps returning 422. (less good — the error
   text is the same broken-looking message the user reported.)
   **Pick option 1.** It requires loosening the guard at
   `larry.ts:1970` from `length === 0 → 422` to `unknown-type → 422`.

## Files to change

### 1. `packages/db/src/larry-event-modifications.ts`
Extend the map + the exported union type.

```ts
export type ModifiableActionType =
  | "task_create"
  | "status_update"
  | "risk_flag"
  | "deadline_change"
  | "owner_change"
  | "email_draft"
  | "scope_change"
  | "project_create"
  | "collaborator_add"
  | "collaborator_role_update"
  | "collaborator_remove"
  | "project_note_send"
  | "calendar_event_create"
  | "calendar_event_update"
  | "slack_message_draft";

const FIELDS_BY_ACTION_TYPE: Record<string, readonly string[]> = {
  task_create:              ["title", "description", "startDate", "dueDate", "assigneeName", "priority"],
  status_update:            ["newStatus", "newRiskLevel"],
  risk_flag:                ["riskLevel"],
  deadline_change:          ["newDeadline"],
  owner_change:             ["newOwnerName"],
  email_draft:              ["to", "subject", "body"],
  scope_change:             ["newDescription"],
  project_create:           ["name", "description"],
  collaborator_add:         ["role"],
  collaborator_role_update: ["role"],
  collaborator_remove:      [], // no editable fields — handled by no-op panel
  project_note_send:        ["visibility", "content"],
  calendar_event_create:    ["summary", "startDateTime", "endDateTime"],
  calendar_event_update:    ["summary", "startDateTime", "endDateTime"],
  slack_message_draft:      ["channelName", "message"],
  // reminder_send auto-executes and never appears as a suggestion; intentionally omitted.
};
```

### 2. `apps/api/src/routes/v1/larry.ts` — two call sites

At `:1969-1974` and `:2279-2284` the guard currently treats
"no editable fields" as "not modifiable". Change it to "unknown action
type" so `collaborator_remove` (empty-but-registered) is allowed through:

```ts
const editableFields = editableFieldsForActionType(event.actionType);
if (!isModifiableActionType(event.actionType)) {
  throw fastify.httpErrors.unprocessableEntity(
    `Action type '${event.actionType}' is not modifiable.`
  );
}
```

Add a helper to `larry-event-modifications.ts`:
```ts
export function isModifiableActionType(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIELDS_BY_ACTION_TYPE, actionType);
}
```

### 3. `apps/web/src/app/workspace/ModifyPanelFields.tsx`
Add a field renderer per new type and register them in `FIELDS_BY_TYPE`.
The file already follows a clean pattern — each renderer is a ~20-line
component that binds `workingPayload[field]` to an `<input>`/`<select>`
and calls `applyPatch` on change. Mimic `CreateTaskFields` /
`FlagTaskRiskFields` / `DraftEmailFields`.

Renderers needed:
- `ChangeScopeFields` — single textarea for `newDescription`
- `CreateProjectFields` — name + description inputs; render `tasks[]` as
  read-only list (editing tasks mid-suggestion is out of scope for v1)
- `AddCollaboratorFields` — role select (`owner`/`editor`/`viewer`);
  show `displayName` as read-only label
- `UpdateCollaboratorRoleFields` — role select; show userId as read-only
- `RemoveCollaboratorNoopFields` — just renders
  "Nothing to edit — the userId is fixed. Use Accept or Dismiss."
- `ProjectNoteFields` — visibility select + content textarea
- `CreateCalendarEventFields` — summary + two datetime-locals
- `UpdateCalendarEventFields` — summary + two datetime-locals;
  show eventId as read-only
- `DraftSlackMessageFields` — channelName input + message textarea

`FIELDS_BY_TYPE` needs the 9 new entries so the `if (!Renderer)` fallback
(line 234) no longer fires.

### 4. Tests

`packages/db/src/larry-event-modifications.test.ts` currently has cases
for the 6 supported types + a "returns empty for reminder_send" case.
Add one `it(...)` per new action type mirroring the existing pattern.

```ts
it("exposes editable fields for scope_change", () => {
  expect(editableFieldsForActionType("scope_change")).toEqual(["newDescription"]);
});
```

…and so on. Also add one assertion that `isModifiableActionType` returns
`true` for `collaborator_remove` (the empty-allow-list special case) and
`false` for `does_not_exist` / `reminder_send`.

Consider also adding a runtime exhaustiveness test: enumerate all values
of `LarryActionType` from `@larry/shared` and assert each is either in
`FIELDS_BY_ACTION_TYPE` or in an explicit `INTENTIONALLY_NOT_MODIFIABLE`
set. That prevents this bug recurring the next time a new action type
is added upstream.

## Verification plan (repro + proof-of-fix)

1. Pre-deploy: unit tests in step 4 should pass locally.
2. Post-deploy (Railway + Vercel), using `launch-test-2026@larry-pm.com`:
   - Create a fresh project with Manual setup.
   - Get Larry to emit each of the 9 previously-broken action types.
     The cleanest route is `POST /api/workspace/larry/chat` with an
     imperative message per type (e.g. *"Emit a scope_change action
     with newDescription='…'"*). For types where chat won't reliably
     emit (e.g. `collaborator_*` requires a real userId), seed a
     `larry_events` row with `INSERT … RETURNING id` via the admin
     console or skip and cover via unit test.
   - For each resulting suggestion, click **Modify** in the Action
     Centre and verify:
     - No 422 error banner appears.
     - The panel renders the new per-type fields.
     - Editing a field enables Save & execute.
     - Save lands cleanly (`POST /modify/save` → 200).
     - The executed action appears in "Actions completed" with the
       edited values where the executor exposes them.

## Pitfalls

- **Payload validation**: the backend's `assertPatchIsAllowed` at
  `larry-event-modifications.ts:36-51` already enforces that patch keys
  are a subset of `FIELDS_BY_ACTION_TYPE[type]`. If you add a field to
  the allow-list but forget to render it in the frontend, the user
  can't reach that field — not a bug, but make sure the frontend and
  backend field lists match exactly.
- **Role / collaborator validation**: the executors for
  `collaborator_add` / `collaborator_role_update` expect
  `role ∈ {owner, editor, viewer}`. The frontend select must restrict
  to those values — don't expose a free-text input.
- **Datetime format**: `calendar_event_create` payloads store
  `startDateTime` / `endDateTime` as ISO strings. `<input type="datetime-local">`
  produces local-time strings without timezone. Decide now whether
  the executor expects UTC or local + TZ; look at the existing
  executor (`larry-executor.ts` around `:1481` onward) before wiring
  the input to avoid landing wrong-timezone events.
- **`executeAction` router coverage**: all 9 types are already in the
  switch at `larry-executor.ts:1434-…` so the Save-and-execute path
  will hit a real executor. One gotcha — `calendar_event_create`
  requires a linked Google Calendar installation (see
  `connectors-google-calendar.ts`). If the tenant hasn't connected
  Calendar, the executor will throw `FailedDependency`. That's a
  separate failure mode, not a Modify bug, but the user experience
  will still read as "Modify failed" unless we surface it in the
  panel error state. Plan to render executor errors verbatim in the
  Modify error banner (the frontend already does this via
  `panel.error` → error panel at `ModifyPanel.tsx:57-70`).

## Out of scope for this fix

- Editing `project_create.tasks[]` mid-suggestion. Add as a stretch
  in v2; keep v1 simple.
- The Ask-Larry-first UX friction I noted incidentally during repro
  (chat asks clarifying questions for missing assignees even when
  the team has matching members). Separate bug; don't bundle.
- A post-launch lint rule to prevent this class of drift (i.e. fail
  CI if a new `LarryActionType` is added without a corresponding
  entry in `FIELDS_BY_ACTION_TYPE`). Ship the exhaustiveness unit
  test first; the lint rule is a v2 nicety.
