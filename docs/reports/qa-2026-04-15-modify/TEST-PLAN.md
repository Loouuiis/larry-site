# Modify Action — Full Test Plan (Production)

**Target:** https://larry-pm.com (Vercel + Railway, master @ 59a32f3)
**Driver:** Playwright MCP, real Chromium, signed in as `larry@larry.com`
**Spec:** `docs/superpowers/specs/2026-04-15-modify-action-design.md`
**Run date:** 2026-04-16

---

## Scope

Validate the full Modify Action surface end-to-end on production:

- Both entry points (`/workspace/actions` and `/workspace/projects/[id]`)
- Both edit modes (quick-edit fields, Larry chat strip)
- Both terminal actions (Save & execute, Stop)
- Failure modes (concurrent resolve, no changes, unmodifiable type)
- Per-action-type quick-edit rendering for the 6 modifiable types

## Out of scope

- Mobile / responsive layout (deferred — desktop only this round)
- Automated CI Playwright suite (manual MCP run only)
- Calendar / Slack action types — explicitly not modifiable per spec
- Rate-limit testing (would burn the 20/min Modify-chat budget)

## Pre-flight

| Check | How | Expected |
|---|---|---|
| Master deployed | `git rev-parse origin/master` matches `59a32f3` | yes |
| Vercel preview live | `curl https://larry-pm.com/login -o /dev/null -w "%{http_code}"` | 307 (redirect to canonical) |
| Migration 020 applied | Inspect a `larry_events` row in DB or rely on save flow returning 200 | new columns present |
| Test creds | `.env.test` readable | LARRY_URL, LARRY_TEST_EMAIL, LARRY_TEST_PASSWORD set |

## Test cases

### T1 — Smoke: login + Action Centre loads

**Goal:** confirm the deploy is healthy and we can reach the surface under test.

1. Navigate to `/login`.
2. Fill email + password from `.env.test`.
3. Submit. Wait for `/workspace`.
4. Navigate to `/workspace/actions`.
5. Capture snapshot. Confirm at least one card with a Modify button is visible.

**Pass criteria:** signed in, action centre loaded, ≥1 suggested event with a Modify button.

If the test account has zero suggested events, fall back to the per-project route (T6) where one is more likely. If neither has any, halt and ask Fergus to seed via a Larry scan.

### T2 — Open + Stop (Modify is reversible)

**Goal:** confirm clicking Modify opens the panel, the source card stays present, and Stop returns to the original UI without DB mutation.

1. Click Modify on a suggested card.
2. Snapshot — verify the panel renders below the card with field editors, "Tell Larry in words" strip, Review section ("No changes yet."), Save & execute button (disabled), Stop button.
3. Click Stop.
4. Snapshot — verify the panel disappears, the source card is unchanged (Accept/Modify/Dismiss buttons enabled, original payload visible).
5. Network check: confirm `POST /api/workspace/larry/events/<id>/modify` returned 200 and `POST /api/workspace/larry/events/<id>/modify/stop` returned 200. No `/save`. No 500.

**Pass criteria:** panel rendered + closed cleanly; no `event_type` change.

### T3 — Quick-edit single field + Save & execute

**Goal:** the simplest happy path — change a date and commit.

1. Click Modify on a suggested card with a date field (`create_task` or `change_deadline`).
2. Change the date via the native date picker to a value 7 days later than the original.
3. Snapshot — Review section should show `Due date: OLD → NEW`. Save button should now be **enabled**.
4. Click Save & execute.
5. Snapshot — panel disappears, card disappears from the suggested list.
6. Network check: `POST /modify/save` returned 200 with `executed: true`.

**Pass criteria:** card resolves, save returns 200, no executor 422.

### T4 — Chat-driven edit produces a payload patch

**Goal:** Larry's `apply_modification` tool produces a usable patch from natural-language instructions.

1. Click Modify on a suggested card.
2. Type into the "Tell Larry in words" strip: `push the deadline by one week and bump priority to high`.
3. Submit (Tell Larry button or Enter).
4. Wait for Larry's reply to appear in the chat log.
5. Snapshot — Review section should show diff entries for `Due date` and `Priority`.
6. Click Save & execute.
7. Network check: `/modify-chat` returned 200 with non-empty `payloadPatch`; `/modify/save` returned 200.

**Pass criteria:** chat reply rendered + diff updated + save succeeded.

If Larry's reply lands but no patch surfaces (LLM declined to call the tool), retry once with a more imperative phrasing (`change the deadline to YYYY-MM-DD`). Mark as PARTIAL if even the retry doesn't produce a patch — this is a model-behaviour issue, not a code regression.

### T5 — Save disabled when no edits

**Goal:** UX guardrail — pressing Save with no changes is impossible.

1. Click Modify on any suggested card.
2. Without changing any field, snapshot the Save & execute button.

**Pass criteria:** button is disabled (`aria-disabled="true"` or `disabled` attribute present); diff shows "No changes yet."

3. Click Stop to clean up.

### T6 — Per-project Action Centre Modify

**Goal:** the second entry point on `/workspace/projects/[id]` works the same.

1. From `/workspace`, pick any project tile with at least one suggested action and navigate to `/workspace/projects/<id>`.
2. Switch to the Action Centre tab if it isn't the default.
3. Repeat T2 (open + Stop) and T3 (quick-edit + save) using the per-project card.

**Pass criteria:** identical behaviour to global Action Centre; same network endpoints.

### T7 — Per-action-type coverage (best-effort)

For each modifiable type that's available in the test tenant's pending suggestions, exercise the field renderer:

| Type | What to verify in the panel |
|---|---|
| `create_task` | title input, description textarea, dueDate date input, priority select, assignee select pulls team list |
| `change_deadline` | newDeadline date input |
| `change_task_owner` | newOwnerName select pulls team list |
| `update_task_status` | newStatus select with all 6 options, newRiskLevel select |
| `flag_task_risk` | riskLevel select |
| `draft_email` | to text input, subject text input, body textarea |

For each present type: open Modify, snapshot, change one field, Save & execute. **Skip** types that have no pending suggestion in the test tenant rather than seeding (Groq TPD discipline).

**Pass criteria:** every type that's available renders without console errors and saves successfully.

### T8 — Network + console error scan

**Goal:** catch silent regressions during the full flow.

After running T2–T7:

1. `browser_console_messages level=error` — expect zero application errors. Vercel/Next.js infra messages and chunk-load warnings are noise; ignore.
2. `browser_network_requests filter=/api/workspace/larry/events/.*/modify` — confirm only 200/409 status codes. Any 500 is a fail.

**Pass criteria:** no 500 responses on Modify endpoints; no React error boundary triggers.

## Cases intentionally not run end-to-end

- **Concurrent accept → 409 conflict (F4 from QA README):** would require two browser sessions or a separate API call. Verified instead by code inspection: `larry.ts` modify/save handler returns 409 on `event_type !== 'suggested'`, and the panel's `useModifyPanel` maps 409 to the conflict state.
- **send_reminder 422:** `send_reminder` events auto-execute and don't appear as suggestions in normal data. Verified by code inspection: `editableFieldsForActionType('send_reminder')` returns `[]` and the snapshot endpoint throws `unprocessableEntity`.
- **Migration verification SQL:** can't run without Railway DB connection; relied on save endpoint returning 200 (which would 500 if columns didn't exist).

## Reporting

Results land in `docs/reports/qa-2026-04-15-modify/REPORT.md` with one section per test case:

```
### T<n> — <title>
Result: PASS | FAIL | PARTIAL | SKIP
Notes: …
Evidence: <screenshot path or network excerpt>
```

Any FAIL gets a follow-up issue ticketed in `NOTES.md`.
