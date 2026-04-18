# Action Centre task Modify — verification report

**Date:** 2026-04-18
**Tester:** Claude Opus 4.7 via Playwright MCP (real-browser, not headless)
**Environment:** Production — https://www.larry-pm.com
**Test account:** `launch-test-2026@larry-pm.com` (tenant `5d7cd81b-03ed-4309-beba-b8e41ae21ac8`)

## TL;DR

**Action Centre Modify flow is working correctly on prod today.** I could not
reproduce the reported breakage in the happy path for `task_create`. Full
save-and-execute round-trip succeeds and the task actually lands in the DB
with the edited title. If another agent picks this up with more specific repro
details, start with the untested scenarios in the "Not yet exercised" section
below.

## What I tested

1. **Setup**
   - Logged in as the prod test user (Vercel BotID passes on real Chromium).
   - Created a fresh project `Modify Test 2026-04-18`
     (`fe0afe7a-cacc-43c4-bdd9-7f7105a054a3`).
   - Used project-scoped Ask Larry chat to generate a `task_create`
     suggestion. (Larry pushed back on missing assignee twice — mild UX
     friction but the third forcing prompt emitted a suggestion cleanly.
     Final event `d7482827-4703-4e13-b372-b342b07577c5`.)

2. **Action Centre → Modify (task_create)**
   - Navigated to `/workspace/actions`.
   - Clicked **Modify** on the pending suggestion → panel opened inline.
   - Panel rendered `Title`, `Description`, `Due date`, `Priority`, `Assignee`
     fields pre-filled from the suggestion payload. ✓
   - Edited **Title** → "Review QA checklist — EDITED BY TEST".
     - `Save & execute` button un-disabled the moment a diff existed. ✓
     - Review section populated with the diff. ✓
   - Clicked **Save & execute**.
     - `POST /api/workspace/larry/events/d7482827…/modify` → **200** (open).
     - `POST /api/workspace/larry/events/d7482827…/modify/save`
       with body `{"payloadPatch":{"title":"Review QA checklist — EDITED BY TEST"},"executeImmediately":true}`
       → **200** (save + execute). ✓

3. **DB verification**
   - `GET /api/workspace/tasks?projectId=…` immediately after save returned:
     ```json
     {"count":1,"items":[{"id":"431bec22…","title":"Review QA checklist — EDITED BY TEST","status":"not_started","priority":"high"}]}
     ```
     - Title reflects the edit. ✓
     - Priority from the original payload preserved. ✓

4. **Conflict handling (/modify-chat on already-saved event)**
   - `POST /api/workspace/larry/events/d7482827…/modify-chat` →
     **409 ConflictError** with body
     `{"statusCode":409,"error":"ConflictError","message":"This suggestion was already resolved elsewhere."}`.
   - This matches the 409 branch in `useModifyPanel.sendChat` (line 140).
     Frontend should render the "conflict" state. ✓

## Not yet exercised (where the bug might actually live)

The reported-but-unconfirmed breakage could be in any of these paths. If a
real repro surfaces, try these in order:

1. **Other action types on Modify** — only `task_create` was exercised.
   `status_update`, `risk_flag`, `deadline_change`, `owner_change`,
   `email_draft`, and `project_create` have per-type editable field sets
   in `ModifyPanelFields.tsx`; a bug in one of those sets would be
   invisible to the task_create test.
2. **Tell-Larry refinement path** — the `/modify-chat` endpoint was only
   probed on an already-saved event (correctly 409). The happy path
   (edit + Tell Larry mid-session + save) was not exercised because LLM
   non-determinism + the Groq free-tier TPD (see
   `larry-groq-free-tier-tpd.md`) made it unreliable to trigger a fresh
   suggestion twice in a row. A second suggestion attempt hit a 429 chat
   rate-limit on the tenant.
3. **Multi-field edits** — test edited a single field. A payload patch
   with 3+ fields changed (title + priority + description + dueDate) is
   a distinct code path through the save handler.
4. **Assignee edits** — combobox was present but left at `(unassigned)`.
   Changing assignee to a real team member exercises `resolveUserByName`
   at executor time and is a past source of bugs (see
   `larry-actions-bugs-2026-04-16.md` bug 1).
5. **Role-gated access** — test user is `admin` on its own tenant. Edit
   attempts by `member` or `viewer` roles would hit different RBAC paths
   (see `larry-rbac-owner-project-fix.md`).
6. **Mobile / narrow viewport** — the Modify panel is rendered inline on
   the Action Centre card; visual collision at <1024px wasn't checked.

## How to hand this off

If the user surfaces a concrete repro ("click Modify, edit X, get error Y"):

1. Start by reading `docs/superpowers/specs/2026-04-15-modify-action-design.md`
   for the Modify contract.
2. Hot spots for bugs in the save path:
   - `apps/api/src/routes/v1/larry.ts` — the `/events/:id/modify/save`
     handler.
   - `packages/db/src/larry-executor.ts:executeTaskCreate` and peers —
     verify no required field is being lost across the modify/save/execute
     boundary.
3. Hot spots for the frontend panel:
   - `apps/web/src/app/workspace/ModifyPanelFields.tsx` — per-type field
     renderers; `TaskCreateFields`, `StatusUpdateFields`, etc.
   - `apps/web/src/hooks/useModifyPanel.ts` — state machine + patch
     computation; `diff` memo at `:103-121` drives the Save-enable.
4. If you need a suggestion to test against without going through chat,
   query `project_memory_entries` directly (bypasses LLM) or insert a
   `larry_events` row manually — but prefer chat when possible so the
   full pipeline is exercised.

## Incidental observations

- Larry pushed back twice on "Launch Test" as an assignee name even
  though Launch Test IS on the team (per the combobox dropdown showing
  "Launch Test" as an option later). The chat-layer fuzzy-match on team
  members may not be using the same normalization as the Assignee
  combobox. Minor UX friction; not a Modify bug.
- Second forced-emit chat message hit 429 rate limit within ~90 seconds
  of the first. Rate limiter may be tighter than intended for test
  accounts; worth checking if the launch-day traffic could hit this.
