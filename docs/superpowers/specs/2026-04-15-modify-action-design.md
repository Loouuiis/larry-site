# Modify Action — Design

**Date:** 2026-04-15
**Status:** Approved (brainstorm 2026-04-15)
**Author:** Fergus + Claude
**Scope:** Action Centre "Modify" button on suggested Larry events

---

## 1. Problem

Clicking **Modify** on a suggested action in the Action Centre (both the global `/workspace/actions` page and the per-project Action Box) today drops the user into a Larry chat with a canned opener. From there:

- The source suggestion is **dismissed immediately** (`markLarryEventDismissed`, reason `modify-superseded`) — the user loses the original if they abandon the chat.
- Larry's chat LLM has no tool that means "update the pending suggestion." Its toolbox — `create_task`, `change_deadline`, `change_task_owner`, etc. — operates on existing `tasks` rows via `taskId`. The thing being modified is a *pending suggestion*, not a task.
- The LLM typically responds by (a) calling `create_task` and leaving a duplicate suggestion floating, (b) calling `change_deadline` with a hallucinated/stale `taskId` → 422, or (c) giving up and writing generic prose.

The capability genuinely does not exist. Users report "Modify does nothing useful."

## 2. Goals

1. **Modify means modify.** Clicking Modify produces an edited version of the suggestion that can be saved and executed, without routing through task mutation tools that assume the action has already happened.
2. **Light edits should be light.** Changing a deadline shouldn't require a chat round-trip.
3. **Heavy edits stay in chat.** "Rewrite the description, split into two tasks" should still work.
4. **Reversible.** If the user changes their mind mid-edit, the original suggestion is not lost.
5. **One consent per edit.** Saving the edited version *is* the accept. No "save, then accept again."
6. **Auditable.** `previous_payload` + `modified_by` + `modified_at` is recorded on the event row so before/after is recoverable.

## 3. Non-goals

- Multi-user concurrent editing of the same suggestion (drafts/locking). Larry is effectively single-PM-per-tenant; last-write-wins is fine.
- Preserving rejected edits across sessions ("resume your draft from yesterday"). If the user hits Stop or navigates away, the edit is discarded.
- Modifying `send_reminder` events (they auto-execute and never appear as suggestions).
- Modifying `accepted` or `dismissed` events. Only `suggested` events are modifiable.

## 4. UX

### 4.1 Entry points

Two existing buttons fire this flow:

- `/workspace/actions` page — action card in the global Action Centre (`apps/web/src/app/workspace/actions/page.tsx:679`).
- Per-project Action Box (`apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx:1273`).

Both currently call the `modify(event.id)` hook from `useLarryActionCentre.ts`. That hook today navigates to the chat; it will instead open the new **Modify panel** inline on the card (or as a side drawer on narrow screens — Tailwind breakpoint decision at implementation time).

### 4.2 Modify panel

Opening the panel puts the source card into an **"editing" visual state**: muted background, "You are editing this" badge, Accept / Dismiss / Modify buttons disabled. The original `larry_events` row is *not* touched — event_type stays `suggested`.

The panel contains, for every action type:

1. **Quick-edit fields** — native controls for the structured fields in the payload. Per type:
   - `create_task`: title (input), description (textarea), dueDate (date picker), assigneeName (select from team), priority (select).
   - `change_deadline`: newDeadline (date picker).
   - `change_task_owner`: newOwnerName (select from team).
   - `update_task_status`: newStatus (select), newRiskLevel (select).
   - `flag_task_risk`: riskLevel (select).
   - `draft_email`: to (input), subject (input), body (textarea).

   The assignee / owner select pulls from the project's team list to prevent re-introducing the "Marcus isn't on the team" bug.

2. **"Tell Larry in words" chat strip** — a single-line input with placeholder *"Anything a field can't capture? Describe the change…"*. Sends the user's message + the current payload snapshot to a new dedicated chat endpoint (`POST /v1/larry/events/:id/modify-chat`) that runs the LLM with a single tool: `apply_modification` (see §6.2). Larry returns natural-language acknowledgement plus a proposed payload diff.

3. **Review area** — shows the current edited payload as a diff against the original (`Deadline: Apr 23 → Apr 30`, `Assignee: Priya → Anna`). Updated live as fields or chat produce changes.

4. **Action row** — two buttons:
   - **Save & execute** — applies the edits to the event row, then runs the existing `/events/:id/accept` handler. Panel closes. Card leaves Action Centre as normal.
   - **Stop** — discards all pending edits, closes the panel, source card returns to normal pending state. No database mutation beyond optionally ending the modify chat conversation if one was started.

### 4.3 Visual states on the source card

| State | Source card appearance |
|---|---|
| Not being modified | Normal card with Accept / Modify / Dismiss buttons. |
| Panel open (editing) | Muted background, "You are editing" chip, buttons disabled. |
| After Save & execute | Card disappears from pending list (standard accept flow). |
| After Stop | Returns to "Not being modified" state. |

## 5. Data model

### 5.1 Schema change

New migration `020_larry_event_modifications.sql`:

```sql
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS previous_payload   JSONB,
  ADD COLUMN IF NOT EXISTS modified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_at        TIMESTAMPTZ;

COMMENT ON COLUMN larry_events.previous_payload IS
  'Snapshot of payload before the most recent user edit via Modify. NULL if the event has never been modified.';
```

No new indexes — these are audit columns, not query columns.

### 5.2 Semantics

- When a Modify panel opens, **no DB write happens**. Editing is purely client-side until Save or Stop.
- On Save & execute:
  1. Begin transaction.
  2. `UPDATE larry_events SET previous_payload = payload, payload = $new, modified_by_user_id = $actor, modified_at = NOW() WHERE id = $id AND event_type = 'suggested'`.
  3. Re-run the existing accept path (`executeAction` + `markLarryEventAccepted`) inside the same transaction.
  4. Commit.
- On Stop: no DB write. If a modify-chat conversation was created, it remains (users can read chat history later), but it is **not linked to the event** — the event is back to its original state.

### 5.3 What happens if the LLM-generated context is stale

Scan cadence + long edit sessions mean the suggestion could be re-issued by a scheduled run while the user edits. Mitigation:

- `/events/:id/modify-chat` and the Save endpoint both re-fetch the event with `event_type = 'suggested'` guard. If the event was accepted/dismissed elsewhere (e.g. Accept on another tab), Save returns **409 Conflict** with a clear message; the panel shows "This suggestion was already accepted in another tab" and offers a Close button. No partial state.

## 6. API

### 6.1 Modified endpoints

**`POST /v1/larry/events/:id/modify`** (changed)

Current behaviour (dismiss original + open chat) is **replaced**. The new contract:

- No DB write. Returns the suggestion's current payload, the list of editable fields for its action type, and the team member list for the project.
- Response shape:

  ```ts
  {
    eventId: string;
    actionType: string;
    displayText: string;
    reasoning: string;
    payload: Record<string, unknown>;
    editableFields: ('title'|'description'|'dueDate'|'assigneeName'|'priority'|'newDeadline'|'newOwnerName'|'newStatus'|'newRiskLevel'|'riskLevel'|'to'|'subject'|'body')[];
    teamMembers: { userId: string; displayName: string; email: string }[];
  }
  ```

- Role gate unchanged (`admin`, `pm`).
- 409 if event is not `suggested`.

**`POST /v1/larry/events/:id/modify/save`** (new)

Body:

```ts
{
  payloadPatch: Record<string, unknown>;  // fields the user changed
  executeImmediately: boolean;            // true = Save & execute
  conversationId?: string;                // if a modify chat was used
}
```

- Validates `payloadPatch` keys against the action type's allowed fields (same list as `editableFields`).
- Merges `payloadPatch` over `payload`.
- Validates the merged payload with the action type's Zod schema (reusing whatever `executeAction` uses).
- If `executeImmediately` is true, runs the accept flow transactionally as described in §5.2.
- If `executeImmediately` is false (future extension; not exposed in UI initially), just persists the edit and keeps the event pending.
- Response: `{ event: LarryEventSummary, executed: boolean, documentId?: string, entity?: unknown }` — shape-compatible with the existing accept response.

**`POST /v1/larry/events/:id/modify/stop`** (new)

Idempotent no-op on the DB. Exists only so the frontend has a durable "cancel" hook for analytics / audit log. Writes one `audit_logs` row (`larry.event.modify_cancelled`). 200 always.

### 6.2 New chat endpoint: `POST /v1/larry/events/:id/modify-chat`

Dedicated endpoint so we don't muddle the general `/chat` tools with a modification-only tool.

Body: `{ message: string, currentPayload: Record<string, unknown>, conversationId?: string }`.

Behaviour:

1. If no `conversationId`, create a conversation titled `Modify: <truncated displayText>` linked to the event's `projectId`.
2. Insert user message.
3. Run `streamText` with a **single tool**, `apply_modification`:

   ```ts
   apply_modification: tool({
     description: 'Apply the user-described change(s) to the pending suggestion payload. Call exactly once per user turn, or zero times if the user is asking a clarifying question.',
     inputSchema: z.object({
       payloadPatch: z.record(z.unknown()).describe('Fields to change, keyed by payload field name. Only include fields that change.'),
       summary: z.string().describe('One short sentence describing the change, in past tense. E.g. "Pushed the deadline to 30 Apr and reassigned to Anna."'),
     }),
     execute: async (p) => ({ ok: true, patch: p.payloadPatch, summary: p.summary }),
   })
   ```

4. System prompt is a stripped-down version of the main chat prompt: no date/project recap, just:
   - The suggestion's `displayText`, `reasoning`, current payload (pretty-printed).
   - The editable-fields list for the action type.
   - The team list (display names) for assignee/owner resolution.
   - Rules: only call `apply_modification`; never call other tools; refuse to change unknown fields; ask a clarifying question if the user is ambiguous.

5. Response: same shape as the main chat, plus `payloadPatch` and `summary` if the tool was called. The frontend merges the patch into the in-memory edit state.

Role gate: `admin`, `pm` (matches existing modify endpoint).

### 6.3 Endpoints removed / decommissioned

- The current `POST /v1/larry/events/:id/modify` return shape (`{ conversationId, eventId }`) is a breaking change to the new shape. Frontend and API ship together; no external consumers. No deprecation window needed.
- The auto-dismiss-on-modify behaviour is removed. Tests asserting this (if any — search confirms only audit-log tests touch it) will be updated.

## 7. Frontend changes

### 7.1 New files

- `apps/web/src/app/workspace/_components/ModifyPanel.tsx` — the panel body. Props: `{ event, onSave(patch, execute), onStop(), teamMembers }`.
- `apps/web/src/app/workspace/_components/ModifyPanelFields/*` — one small component per action type rendering its structured fields.
- `apps/web/src/app/workspace/_components/ModifyDiff.tsx` — renders before/after as `Field: old → new` lines.
- `apps/web/src/hooks/useModifyPanel.ts` — local state machine (`idle | loading | editing | saving | conflict`), chat send/receive, patch merge.
- Next.js route handlers:
  - `apps/web/src/app/api/workspace/larry/events/[id]/modify/route.ts` — **rewrite** to proxy new GET-equivalent POST.
  - `.../modify/save/route.ts` — new.
  - `.../modify/stop/route.ts` — new.
  - `.../modify-chat/route.ts` — new.

### 7.2 Changed files

- `useLarryActionCentre.ts` — `modify()` no longer navigates. Returns the editable snapshot. Callers open the panel instead of routing.
- `apps/web/src/app/workspace/actions/page.tsx` — swap navigation for panel rendering.
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` — same swap.

### 7.3 Styling

Reuse Larry palette tokens per `larry-design-decisions` memory (primary `#6c44f6`). Panel uses existing card chrome. Diff lines use a muted semantic colour for removed, accent for added. No new design tokens.

## 8. Error handling

| Condition | Handling |
|---|---|
| Event already accepted/dismissed between open and save (409) | Panel shows "This suggestion was already resolved elsewhere." Close button only. |
| Payload validation fails | Inline error under the offending field (and a top-level banner if the chat produced an invalid patch). Save button disabled until fields are valid. |
| Chat LLM refuses / calls no tool | Larry's prose answer is shown; edit state is unchanged. User can try again or edit fields manually. |
| Chat LLM produces a patch with unknown keys | API rejects with 422; panel shows "Larry tried to change an unsupported field — ignore and try again, or edit manually." |
| Executor fails during Save & execute | Transaction rolls back `previous_payload` + payload. Event stays `suggested` with original values. Panel shows executor's error. |
| Team member name can't be resolved at save | 422 with the offending name, panel shows "We don't have <name> on this project. Pick from the dropdown." |

## 9. Testing

### 9.1 Unit tests (Vitest)

- `packages/db` — `applyEventModification(payload, patch)`: pure merge helper.
- `packages/ai/src/chat.ts` modification-mode variant — a new `buildModifySystemPrompt` and the single-tool wiring. Unit-test the prompt shape (contains payload, team list, action type) and that `stepCountIs(2)` still holds.
- API route tests for `/events/:id/modify` (new shape), `/save`, `/stop`, `/modify-chat` — covering 200, 409, 422, role gate, multi-tenant isolation.

### 9.2 Integration tests

Reuse the pattern from `apps/api/tests/larry-event-id-uuid-guard.test.ts`:

- Save & execute with patch → event row has `previous_payload` set, `payload` updated, `event_type = accepted`, executor ran.
- Stop → no DB mutation except audit log.
- Concurrent Accept in another tab → Save returns 409 and does not mutate.
- Chat `apply_modification` tool call → returned patch validates and can be passed to Save.

### 9.3 E2E (Playwright, per `larry-testing-tools` memory)

New spec `apps/web/e2e/modify-action.spec.ts` covering:

1. Open Modify panel on a create_task suggestion, change deadline via date picker, Save & execute, confirm task created with new date.
2. Open Modify panel, type in "Tell Larry in words" strip ("push to next Friday and reassign to Anna"), confirm diff updates, Save & execute.
3. Open Modify, click Stop, confirm card returns to pending state with original payload.
4. Open Modify in one tab, Accept in another, attempt Save, confirm 409 banner.

Run against the deployed preview per `testing-on-production` memory (Fergus does not test locally).

### 9.4 Manual QA script

Documented in `docs/reports/qa-2026-04-15-modify/README.md` after implementation lands. Covers each action type's field set and the chat path with 3 prompt variations.

## 10. Rollout

- Ship as one PR. Backwards compatibility isn't needed — the only consumer of the old `/modify` response shape is the frontend, and they deploy together.
- Migration `020` is additive (nullable columns) — safe on prod with live traffic.
- Feature flag gate: `MODIFY_PANEL_V2` env var (default **on** in preview, **on** in prod after preview soak). Rollback = flip the flag; old code path is gone but Modify button would become a no-op rather than a crash, which is acceptable for a short-window rollback window.
- Monitor: new audit log events `larry.event.modified`, `larry.event.modify_cancelled`. Add to Larry's daily activity feed if one exists.

## 11. Open questions (deferred, none block implementation)

- Should the modify chat conversation be visible in the user's normal chat history? Current plan: yes, labelled "Modify: <displayText>". Easy to change later.
- Do we want a keyboard shortcut (e.g. `m` on a focused card) to open Modify? Nice-to-have, not in scope.
