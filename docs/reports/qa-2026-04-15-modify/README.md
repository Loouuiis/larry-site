# Modify Action — Manual QA Script

**Spec:** [../../superpowers/specs/2026-04-15-modify-action-design.md](../../superpowers/specs/2026-04-15-modify-action-design.md)
**Plan:** [../../superpowers/plans/2026-04-15-modify-action.md](../../superpowers/plans/2026-04-15-modify-action.md)
**Built:** 2026-04-15

---

## Pre-flight

1. Migration 020 applied on the target database. Verify:

   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'larry_events'
     AND column_name IN ('previous_payload', 'modified_by_user_id', 'modified_at');
   ```

   Expect all three rows. If missing, migrations did not run — fix deploy before testing.

2. `@larry/db` and `@larry/ai` packages rebuilt and deployed (Railway API + Vercel web both up to date on the latest commit).

3. A Larry scan has produced at least one suggested event for the target project, or seed one manually.

## The five smoke flows

Each flow covers one of the spec's required behaviours. Fergus tests on deployed production per the `testing-on-production` memory.

### F1. Quick-edit a deadline and save

1. Open the Action Centre (global `/workspace/actions` or the per-project Action Box).
2. Find a pending `create_task` or `change_deadline` suggestion.
3. Click **Modify** — the card stays in place and a panel opens below it.
4. Change the date via the native date picker.
5. Verify the Review diff shows `Due date: OLD → NEW`.
6. Click **Save & execute**.
7. Expected: card disappears from the pending list within ~1s, the created/updated task reflects the new date.
8. Verify in the DB:

   ```sql
   SELECT event_type, previous_payload->>'dueDate', payload->>'dueDate', modified_by_user_id
   FROM larry_events WHERE id = '<eventId>';
   ```

   `event_type = accepted`, `previous_payload` set, `modified_by_user_id` = the user who saved.

### F2. Chat-driven edit

1. Open Modify on any suggestion.
2. In the "Tell Larry in words" strip, type something like `push to next Friday and reassign to Anna` (use a real team member name).
3. Expected: Larry replies in the chat log, the diff updates live with `Due date` and `Assignee` entries, and the working field values update too.
4. Click **Save & execute**.
5. Same DB verification as F1.

### F3. Stop cancels cleanly

1. Open Modify on a suggestion.
2. Change at least one field so the diff shows a pending change.
3. Click **Stop**.
4. Expected: panel closes, card returns to its normal state (original Accept/Modify/Dismiss buttons enabled, payload unchanged).
5. In the DB, the event's `payload` and `event_type` must be unchanged. `previous_payload` must still be NULL.

### F4. Concurrent accept → conflict banner

1. Open two browser tabs, both on `/workspace/actions`, same account.
2. In tab A, click **Modify** on a suggestion.
3. In tab B, click **Accept** on the same suggestion.
4. Back in tab A, change a field and click **Save & execute**.
5. Expected: panel shows the amber "already resolved" conflict state with a Close button. No 500, no duplicate execution.

### F5. Unmodifiable action type is gracefully blocked

1. Find a `send_reminder` event in the activity list (these auto-execute, so they won't be suggested — this flow mostly verifies defence-in-depth). If none, synthesise via:

   ```sql
   INSERT INTO larry_events (tenant_id, project_id, event_type, action_type, display_text, reasoning, payload, triggered_by)
   VALUES ('<tenantId>', '<projectId>', 'suggested', 'send_reminder',
           'Remind Anna about kickoff', 'Test event', '{}'::jsonb, 'schedule');
   ```

   Then POST `/api/workspace/larry/events/<id>/modify` directly (devtools).
2. Expected: 422 with body message `Action type 'send_reminder' is not modifiable.`

## Per-type coverage

Run F1 (quick-edit) once for each modifiable action type and note any rendering issues:

- [ ] `create_task` — title, description, dueDate, assigneeName, priority
- [ ] `change_deadline` — newDeadline
- [ ] `change_task_owner` — newOwnerName
- [ ] `update_task_status` — newStatus, newRiskLevel
- [ ] `flag_task_risk` — riskLevel
- [ ] `draft_email` — to, subject, body

## Known limitations

- Modify chat is **one-shot** per send (no multi-turn refinement). If this is a pain, we can load prior turns in a follow-up — see the spec's open questions section.
- If the user has unsaved edits and closes the browser tab without clicking Stop, no audit `modify_cancelled` log is written. This is accepted as out-of-scope.
- The feature flag `MODIFY_PANEL_V2` was **not** implemented — rollback path is `git revert`.

## If it breaks

File notes in `NOTES.md` next to this file. The three most likely failure modes:

1. **Migration 020 didn't run** → all save attempts return 500 with `column "previous_payload" does not exist`. Fix: run migrations.
2. **`@larry/db` import missing** at API startup (`editableFieldsForActionType` not found) → db package wasn't rebuilt. Fix: `cd packages/db && npx tsc -p tsconfig.json`.
3. **ModifyPanel fails to render** with "Cannot find namespace 'JSX'" or similar → apps/web type check regressed. Fix: re-run `npx tsc --noEmit -p tsconfig.json` in apps/web.
