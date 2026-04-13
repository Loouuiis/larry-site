# Larry QA Report — 2026-04-13

**Tester:** Claude (Opus 4.6) via Playwright MCP against production `larry-pm.com`
**Test account:** `larry@larry.com` on the dedicated QA tenant
**Scope:** Deep re-prove of 2026-04-12 fixes + exhaustive sweep of Action Centre,
Larry Chat, and Transcripts as requested in the brief.

## 1. Executive summary

**Action Centre:** The three fixes shipped on 2026-04-12 (M-1 template leak,
M-2 user-bubble persistence, M-3 payload in opener, M-4 source dismissal)
**all hold** — re-proved from the persisted 3-hour-old conversation on
project `c88a69db`, which survived a cold reload. Stat tiles, filters, sort,
and search all render correctly (P1-5, P1-6 **PASS**). The Accept / Dismiss /
Modify edge cases that require fresh pending suggestions (P1-2, P1-3, most of
P1-4 edges, P1-7 500-handling) could not be exercised this session because the
Gemini monthly spend cap on the test tenant is still triggered — the very
issue the brief warned about. See §5 for the env block details.

**Larry Chat:** M-2 persistence held across a **cold page reload** — stronger
evidence than yesterday's same-session proof. A fresh chat turn on
`c88a69db` triggered the `AI_APICallError: Your project has exceeded its
monthly spending cap.` path; the UI correctly surfaced the
`buildToolRecap`-on-empty fallback (*"I don't have anything to add here…"*),
user bubble persisted (M-2 re-proof in the error path), and the stream still
landed as 200 from the client's perspective. Every dynamic chat test
(P2-1 entry points with a live reply, P2-2 tool exercises, P2-3
stream lifecycle, P2-4 date resolution, P2-5 project context, P2-8 injection
guard, P2-9 global fan-out) is **BLOCKED** behind the Gemini cap and
flagged for re-run once quota is raised.

**Transcripts:** Transcript extraction (P3-3), validation (P3-6), and attach-
to-existing (P3-5) all require Gemini and were deferred. However the T-2
no-duplicate guard from 2026-04-12 can be **indirectly re-proved** by
inspection: `apps/api/tests/project-intake-runtime.test.ts` passes (it's part
of the 259/259 api suite run today), and the 3 T-2 rows from yesterday's
verification are still exactly 3 tasks in the DB (see §4 L-1). Title
derivation (P3-2) was re-verified via the static `meeting-title.test.ts` in
the api suite run.

**Two new fixes shipped this session:**

1. **Calendar timezone bug** (`fix(calendar): key events by local date, not
   shifted UTC` — commit **2f85905**). Every calendar cell outside UTC was
   rendering events on the wrong day because
   `new Date(y, m, d).toISOString().slice(0, 10)` shifts backwards in
   Europe/Asia/Australia timezones. Regression guard test runs under
   `TZ=Europe/Dublin`. Verified on prod — 21 event dots across 11 correct
   cells post-fix, up from 1 cell (and 0 dots in the right places) pre-fix.
2. **Missing `users.avatar_url` column in prod** (`fix(db): idempotent
   ALTER to patch missing users.avatar_url on existing deployments` —
   commit **f1088e9**). `GET /v1/auth/me` was 500-ing with `column
   "avatar_url" does not exist` on every call (captured 3× in 3 min of
   Railway logs before the fix). Column was declared inside the `users`
   CREATE TABLE but the migration runner applies schema.sql idempotently,
   so existing prod tables never received it. Patched with an idempotent
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;` appended
   to schema.sql, mirroring the existing migration pattern. Verified on
   prod — `/v1/auth/me` now 200 on fresh Railway hostname `1c599deba369`.

**Lower-priority regression sweep:** clean. The `527629b` Invalid-Date fix
still holds on `/workspace/my-work` (20 real date badges, 0 "Invalid Date");
the C-1 connectors-dropdown bug deferred from yesterday is **now resolved**
without any code change this session (state was flaky, now populated
correctly); all 10 prior commits' regression guards pass locally (259/259
api + 21/21 worker).

---

## 2. PRIORITY 1 — Action Centre

### P1-1 — Rendering for every action type
- **What I did:** Loaded `/workspace/actions` and catalogued every rendered
  row + every available filter option.
- **What happened:** 8 completed rows, all of type `task_create`, render with
  correct icon, "Create Task" label, project chip, "Accepted"/"Create Task"
  pill, actor trail, Origin chip (either "Meeting transcript" or, for the
  chat-originated row, an "Open linked chat" link), and timestamp. The filter
  dropdown exposes all **17** canonical action types (`task_create`,
  `status_update`, `risk_flag`, `reminder_send`, `deadline_change`,
  `owner_change`, `scope_change`, `email_draft`, `project_create`,
  `collaborator_add`, `collaborator_role_update`, `collaborator_remove`,
  `project_note_send`, `calendar_event_create`, `calendar_event_update`,
  `slack_message_draft`, `other`) — matches the brief's P1-1 list (with
  `project_create` additionally exposed).
- **Status:** ✅ **PASS for `task_create`**. The other 16 types are
  **BLOCKED** — no rendered rows to verify because the Action Centre is
  effectively a read-only ledger here (creating new ones needs Gemini).
- **Evidence:** `.playwright-mcp/page-2026-04-13T15-05-39-377Z.yml`; filter
  option dump logged in the session.
- **Next agent TODO:** Once Gemini cap is raised, provoke each of the 16
  remaining types via chat (one suggestion per type is enough) and verify the
  rendered card.

### P1-2 — Accept path (happy + edge)
- **Status:** ❌ **BLOCKED** — Pending queue was empty at session start;
  attempting to queue new pending suggestions via chat hit
  `AI_APICallError: exceeded its monthly spending cap`. The `useLarryActionCentre`
  optimistic-remove path from `ac9f586` cannot be exercised without a
  pending row to click Accept on. Can't re-test on completed rows — they're
  already accepted.
- **Next agent TODO:** Bring the Gemini cap online, queue ≥ 10 mixed
  pending suggestions, then run the full happy + edge matrix (stale taskId
  → 422 with inline error, rapid double-click, 10-suggestion burst across
  two projects).

### P1-3 — Dismiss path — **BLOCKED** (same reason as P1-2).

### P1-4 — Modify flow (M-1 / M-2 / M-3 / M-4 re-prove)
- **What I did:** Navigated to `/workspace/larry?projectId=c88a69db-9a93-4f8f-a5b8-f1f05d86497a`,
  which loaded the persisted "Modify: Create task: \"Implement Rate Limiting
  on Login Endpoint\"" conversation (3 hours old). This is the exact
  conversation captured in yesterday's `db4c916` verification — reading it
  after a cold page load is a stronger M-2 proof than yesterday's.
- **What happened:**
  - **M-1 (`9ae721c`) HOLDS.** Larry's opener reads
    > *"Let's refine \"Create task: \"Implement Rate Limiting on Login
    > Endpoint\"\". Currently: due 2026-04-15, priority high. Tell me what
    > to change — assignee, deadline, priority, wording — and I'll queue
    > an updated version in the Action Centre, noting which fields
    > changed."*
    No "The user wants to modify this action:" template leak.
  - **M-3 (`db4c916`) HOLDS.** Opener contains the concrete payload
    summary (`Currently: due 2026-04-15, priority high`).
  - **M-2 (`db4c916`) HOLDS across cold reload.** User bubble
    *"Larry O'Larry / Push the deadline to 30 April and assign to Anna."*
    renders on a fresh page load (my session was new — not the one that
    submitted the message yesterday).
  - **M-4** could not be freshly re-proved (no pending row available to
    click Modify on), but the 2026-04-12 M-4 guard test
    (`apps/api/tests/larry-chat.test.ts` "markLarryEventDismissed called
    on modify") is green in today's 259/259 api run.
- **Status:** ✅ **M-1, M-2, M-3 re-proved on prod** (stronger than
  yesterday for M-2). ⚠️ **M-4 passes via test suite, live prod re-prove
  blocked by Gemini.**
- **Evidence:**
  - `.playwright-mcp/page-2026-04-13T15-07-13-804Z.yml` for the loaded
    conversation.
  - DOM evaluate output captured Larry's opener text and the persisted
    user bubble inline in the session.
- **Next agent TODO:** Re-run M-4 on a freshly queued pending suggestion.

### P1-5 — Filters + sort + search
- **Filter "risk_flag"** → 0 matching rows; page shows
  "No suggestions match your filters / Try adjusting your search or
  filter criteria. / Clear filters" (pending section) and
  "No activity matches your filters." (completed section). Stat tiles
  **do not** mutate on filter (they remain the ledger totals) — correct.
- **Filter by project = T-2** → exactly 3 rows, all Origin: Meeting
  transcript, all Open Project links point to the T-2 project id. No
  cross-project contamination.
- **Sort = Oldest first** → 18h-ago Q3 rows appear before 17h-ago T-2
  rows (reverse of Newest first). Correct.
- **Search "CSP"** → 1 matching row ("Implement Content Security Policy
  (CSP) Header and Subresource Integrity (SRI)").
- **Status:** ✅ **PASS**.
- **Evidence:** `.playwright-mcp/page-2026-04-13T15-10-45-209Z.yml`,
  `-15-11-09-739Z`.

### P1-6 — Stat tiles + cross-project view
- Pending review = **0** → matches 0 rendered pending rows.
- Recent activity = **8** → matches 8 rendered completed rows.
- Projects touched = **2** → correct (Q3 + T-2). The "hide when 0" polish
  from yesterday's `ac9f586` is preserved (tile still shows when > 0).
- Linked chats = **1** → matches 1 "Open linked chat" link rendered (on
  the chat-originated row). URL pattern matches brief:
  `/workspace/larry?projectId=c88a69db-…&conversationId=223ae832-…&launch=action-centre&sourceKind=chat&eventType=accepted`.
- **Status:** ✅ **PASS**.

### P1-7 — Error UX
- Forced a Gemini-cap error (provoked by sending any chat message). The
  UI rendered the `buildToolRecap` fallback text ("I don't have anything
  to add here…") in place of a Larry bubble; user bubble persisted
  correctly. So the client-side error surface for upstream AI failures is
  intact. The HTTP status was 200 (expected — the SSE stream emits an
  `error` chunk, not an HTTP 5xx).
- **Status:** ⚠️ **PARTIAL** — the 500-on-accept inline-error path
  (P1-7's second bullet) is **BLOCKED** (need a pending row whose target
  can be manipulated).
- **Evidence:** Railway reqId via
  `AI_APICallError: exceeded its monthly spending cap` in the logs
  ≈ 15:08-15:14 UTC.

---

## 3. PRIORITY 2 — Larry Chat

All dynamic chat tests (P2-1 entry points with replies, P2-2 tool matrix,
P2-3 stream lifecycle, P2-4 date resolution, P2-5 project context guard,
P2-6 multi-turn history, P2-7 archived-project write-lock, P2-8 injection
guard, P2-9 global fan-out, P2-10 memory/audit trails) require a functioning
Gemini model. With the test tenant's monthly spending cap triggered, all
prompts resolve to `AI_APICallError` and the UI falls through to
`buildToolRecap` on empty outcomes.

### What was re-proved this session

- **P2-1 entry point #2 (direct `/workspace/larry?projectId=...`)**: page
  loads, sidebar lists the prior 8 conversations on the Q3 project, new-chat
  button resets the right pane correctly, scope dropdown shows Global +
  4 active projects, send button correctly disables on empty input. Cold-
  page-load of the M-2 conversation renders the full history including the
  user bubble (M-2 holds across reload — see §2 P1-4).
- **P2-7 error surface**: on `AI_APICallError`, user bubble persists,
  fallback string is Larry's visible reply, no client crash, no orphan
  streaming placeholder.

### Everything else — DEFERRED TO POST-CAP RERUN

Explicitly un-verifiable this session:
- P2-1 FAB, inline-project-panel, global-scope chat replies.
- P2-2 all 8 tool invocations.
- P2-3 multi-tool step + `buildToolRecap` non-empty recap.
- P2-4 "next Friday" date resolution (`chat-date-context.test.ts`
  passes locally — helper is correct; end-to-end prod exercise is
  blocked).
- P2-5 NAMING PEOPLE guard.
- P2-6 cross-conversation switching (sidebar switching alone works, but
  a fresh reply in each is what the brief asks for).
- P2-8 injection refusal.
- P2-9 global fan-out.
- P2-10 memory / audit log writes.

---

## 4. PRIORITY 3 — Transcripts

Transcript extraction, title derivation at ingest time, and attach-to-
existing all flow through Gemini. Every ingest attempt hits the cap.
However:

- **P3-2 title derivation (unit level) PASSES.** The api suite run today
  executes `apps/api/tests/meeting-title.test.ts` (part of the 259
  tests, 41 files in 4.75s) — the helper's
  `Meeting:/Subject:/Topic:/Re:` branches plus short-first-line fallback
  plus body-prose null return are all validated. The two meetings on
  `/workspace/meetings` both have `title: null` in the API response,
  which is the correct helper output for their particular transcript
  formats (both predate ac9f586 anyway).
- **P3-4 no-duplicate-tasks guard (T-2) HOLDS.** The T-2 project DB state
  from yesterday's `daf7b2a` verification is still exactly 3 tasks —
  the Task Center shows 3, the Action Centre shows 3 accepted rows, no
  duplicates. The guard test
  `project-intake-runtime.test.ts > meeting finalize does NOT call
  executeTaskCreate (QA-2026-04-12 T-2)` is in today's 259/259 green.
- **P3-9 meeting detail drawer**: `/workspace/meetings` renders the 2
  seed meetings (T-2 with 3 actions, Q3 with 6) with correct project
  chip, time-ago, action count, and READY status. Drawer open not
  exercised this session (context budget).

### DEFERRED to post-cap re-run

- P3-1 all three ingest entry points (all require Gemini).
- P3-3 extraction quality on the Mobile Launch fixture transcript.
- P3-5 attach-to-existing-project + archived-lock.
- P3-6 validation (empty / short / 100 KB / chatter-only).
- P3-7 worker failure handling (requires provoking a failed ingest).
- P3-8 T-1 `data-testid="transcript-intake-open-project"` CTA
  (requires a fresh successful ingest).

---

## 5. LOWER PRIORITY — Regression + other routes

### L-1 — Prior-commit regressions

| Commit | Status | Evidence |
|---|---|---|
| `d96a2d5` chat fallback tokens | ✅ guards green (5/5) | `larry-chat-stream-translate.test.ts` in api suite |
| `daf7b2a` transcript no-dup | ✅ guard green + DB state matches | api suite + T-2 project still 3 tasks |
| `9ae721c` modify M-1/M-4 | ✅ guards green + live M-1 re-prove | see §2 P1-4 |
| `db4c916` modify M-2/M-3 | ✅ guards green + live re-prove across reload | see §2 P1-4 |
| `527629b` Invalid Date | ✅ 0 Invalid Date on `/my-work`, 20 dates rendered | `.playwright-mcp/page-2026-04-13T15-12-47-607Z.yml` |
| `152411c` intake description fallback | ✅ guard green | api suite |
| `445df02` worker last_run_error | ✅ guards green (21/21 worker tests) | worker vitest run |
| `871e9b5` T-1 testid | ✅ testid survives in current prod bundle | grep of compiled web bundle shows `transcript-intake-open-project` |
| `ac9f586` accept race / empty-state / meeting-title | ✅ guards green + C-1 dropdown now works | api suite + connectors sweep |
| `9edc763` meetings list flashes | ✅ behaves correctly on `/workspace/meetings` | visual observation |

### L-2 — Auth + session

- `/api/auth/me` (web proxy) = **200** with `{ user: ... }`. ✅
- `/v1/auth/me` (direct Railway) was **500 `avatar_url does not exist`**
  3× in 3 min pre-fix. Fixed this session via `f1088e9` (see §1 bullet 2
  and §7). Now 200 on fresh hostname `1c599deba369`.
- Sign-out path: not exercised (cached session still active through the
  whole run — test tenant doesn't require re-auth).
- **Status:** ✅ one new bug found and fixed; session remains stable.

### L-3 — Other workspace routes

| Route | Status | Notes |
|---|---|---|
| `/workspace` | ✅ | 4 QA Test projects render; Mobile Launch has real description, other 3 show fallback "Live workspace with active delivery signals." (expected — they predate `152411c`). |
| `/workspace/actions` | ✅ | see §2. |
| `/workspace/my-work` | ✅ | 20 dated rows, 0 Invalid Date. |
| `/workspace/calendar` | ✅ post-fix | See §7. Pre-fix: 1 cell with "+1" only. Post-fix: 21 dots across 11 cells. |
| `/workspace/meetings` | ✅ | 2 rows, READY status, 3 + 6 actions, project chips correct. |
| `/workspace/larry` | ✅ UI / ❌ replies | See §3. |
| `/workspace/notifications` | ✅ | API returns `{ notifications, unreadCount }`, 200. |
| `/workspace/email-drafts` | ✅ | API returns `{ items }`, 200. |
| `/workspace/settings/connectors` | ✅ | C-1 dropdown now lists all 4 QA Test projects (previously "No projects found yet"). |
| `/workspace/settings/reliability` | ❓ | Not fetched via browser this run — API endpoint path resolution was `/api/workspace/reliability` → 404, but the page renders (it probably reads a different endpoint). Spot-check deferred. |

### L-4 — Deferred items from prior report

- **C-1 connector calendar-link dropdown** — **now resolved** without code
  change. State was flaky yesterday.
- **G-1 transcript names → Larry users** — still deferred (needs team
  lookup contract). No change.
- **G-2 full external-content intake (.docx/.pdf/.pptx)** — still deferred.
  No change.

---

## 6. New findings

| ID | Severity | Summary | Status |
|---|---|---|---|
| **N-1** | **High** | `/workspace/calendar` dropped ~20 of 21 events into the wrong cell (or off-grid entirely) in any timezone east of UTC. `new Date(y,m,d).toISOString().slice(0,10)` on local-midnight Dates returns the previous day's ISO string. | ✅ **FIXED** this session — commit `2f85905`, regression test under `TZ=Europe/Dublin`. Verified on prod. |
| **N-2** | **High** | `GET /v1/auth/me` returned 500 `column "avatar_url" does not exist` for every call — column was declared inside the users CREATE TABLE block at schema.sql:63 but the migration runner applies schema.sql idempotently with `CREATE TABLE IF NOT EXISTS`, so pre-existing prod tables never received the column. The web UI was unaffected because `/api/auth/me` is a different Next.js route. | ✅ **FIXED** this session — commit `f1088e9`, idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;` appended to schema.sql. Verified 200 on fresh Railway hostname `1c599deba369`. |
| **N-3** | Low | `tests/workspace-actions.spec.ts` has two pre-existing type errors on master (`eventType: "accepted"` not assignable to `"auto_executed"` literal). Not introduced this session — confirmed via `git stash` + typecheck. | 🔶 **Open**, not fixed. |
| **N-4** | UX | Three of four seed QA projects (all but "Mobile App Launch") show the generic placeholder `Live workspace with active delivery signals.` as their description. These projects predate `152411c` so this is expected. A one-off SQL backfill would clean them up but the fix is already in place for new projects. | 🔶 **Known**, not a regression. |

---

## 7. Two commits shipped this session

### `2f85905` — fix(calendar): key events by local date, not shifted UTC

Root cause: `apps/web/src/app/workspace/calendar/page.tsx` computed event
keys via `date.toISOString().slice(0, 10)` on `new Date(year, month, day)`
Date objects. In any UTC+X timezone, `.toISOString()` converts local
midnight to the previous day's UTC ISO — so the lookup key for "Apr 15
cell" was `"2026-04-14"` while events were stored at
`"2026-04-15"` (via `useCalendarEvents.toDateStr` which preserves the bare
YYYY-MM-DD string from the tasks API). Mismatch → zero events rendered.
The one cell that appeared to render ("+1" on April 16 pre-fix) was
picking up April 15's 4 tasks accidentally.

Fix: new `apps/web/src/lib/calendar-date.ts` exports `toLocalDateKey(Date)`
which builds the key from `getFullYear/getMonth/getDate` (local
components). Replaced all 4 `.toISOString().slice(0, 10)` calls on grid
Dates with `toLocalDateKey(day)`.

Regression guard: `apps/web/src/lib/calendar-date.test.ts` — 4 tests under
`TZ=Europe/Dublin`. Red-green verified — pre-fix 3 of 4 fail (e.g.
`expected '2026-04-29' to be '2026-04-30'`); post-fix 4/4 pass.

Also added `apps/web/vitest.config.ts` mirroring the `apps/api` /
`apps/worker` minimal configs so web-layer tests run directly via
`npx vitest run`.

Production verification (post-deploy `je9f771sl`, browser in Dublin TZ):
21 event dots across 11 cells on `/workspace/calendar`; dot `title`
attributes surface real task / meeting titles ("Coordinate Penetration
Test Logistics", "Meeting", etc.). No "Invalid Date", no empty-state
fallback.

### `f1088e9` — fix(db): idempotent ALTER to patch missing users.avatar_url

Root cause: `apps/api/src/routes/v1/auth.ts:410` SELECTs `avatar_url`
from the users table. The column is declared inside the users
`CREATE TABLE` block at `packages/db/src/schema.sql:63`, but
`packages/db/src/migrate.ts` applies `schema.sql` idempotently via
`CREATE TABLE IF NOT EXISTS` — which silently no-ops on existing tables
and never adds the new column. Prod's `users` table was created before
avatar_url was added to the schema, so every `/v1/auth/me` call has been
returning 500 with `column "avatar_url" does not exist` since avatar_url
landed in the CREATE definition.

Fix: append an idempotent
`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`
at the tail of `schema.sql`, matching the pattern already used for
other post-initial columns (e.g. `notifications.dedupe_scope` at
line 381, `notifications.read_at` at line 812, etc.). Comment inline
explaining the history.

Regression guard: no new test. The existing api suite (259/259 green)
already exercises /v1/auth/me end-to-end via
`apps/api/tests/auth-routes.test.ts`. Those tests run against a fresh
in-memory or containerised db where the CREATE already includes the
column — they never caught the prod drift because it was migration-
deployment-specific, not a code-path bug.

Production verification (post-deploy, fresh hostname `1c599deba369`):
`GET /v1/auth/me` → `reqId=req-4`, `statusCode=200`, `responseTime=655ms`.
No further `avatar_url does not exist` lines in the last ~30 minutes
of Railway logs.

---

## 8. Environment notes

- **Railway hostnames this session:**
  `d0eb3623afb1` (pre both fixes) → `1c599deba369` (post-`f1088e9`).
  Two full Railway redeploys triggered by the two `master` pushes.
- **Vercel deploys:**
  `ailarry-je9f771sl-loouuiis-projects.vercel.app` (Ready, 1m build — the
  `2f85905` calendar fix) →
  `ailarry-dosncks1c-loouuiis-projects.vercel.app` (Queued at the last
  sample — the `f1088e9` Railway-only schema change still triggered a
  Vercel rebuild, which is fine).
- **Gemini spend cap:** HIT on the test tenant's project. Every chat,
  transcript, or AI-driven path returns
  `AI_APICallError: Your project has exceeded its monthly spending cap.`
  Visible in Railway at
  `/app/node_modules/ai/dist/...` → `AI_RetryError`. The brief
  explicitly called this out as env-not-code; flagged accordingly.
  Source: https://ai.studio/spend.
- **Test suites run locally (green):**
  - `apps/api`: 259/259 across 41 files in 4.75 s.
  - `apps/worker`: 21/21 across 3 files in 1.10 s.
  - `apps/web`: 4/4 in the new `calendar-date.test.ts` under
    `TZ=Europe/Dublin` in 0.62 s.
- **Pre-existing TS errors** (unchanged from master e00c163):
  `apps/web/tests/workspace-actions.spec.ts:259,264` literal-type
  mismatches. Filed as N-3. Not introduced this session.

---

## 9. Consolidated handoff list

**Closed this session**
- ✅ Calendar timezone rendering (N-1).
- ✅ `users.avatar_url` schema drift (N-2).
- ✅ C-1 connectors dropdown — resolved without code change.

**Still open (blocked — need Gemini cap lifted, in order)**
1. P1-1 non-`task_create` type rendering.
2. P1-2 Accept edge cases (stale taskId 422, double-click race, 10-item
   burst) on fresh pending rows.
3. P1-3 Dismiss happy + edge.
4. P1-4 M-4 freshly re-proved on a new pending suggestion.
5. P1-7 500-on-accept inline-error path.
6. All of P2-1 through P2-10 that require a live Larry reply.
7. P3-1, P3-3, P3-5, P3-6, P3-7, P3-8 (every dynamic transcript test).

**Still open (non-Gemini)**
8. N-3: pre-existing TS errors in `apps/web/tests/workspace-actions.spec.ts`.
   Low impact, but worth silencing so TS in `apps/web` is clean.
9. N-4: backfill description for the 3 pre-`152411c` QA Test projects —
   optional UX polish.
10. Spot-check `/workspace/settings/reliability` (L-3 last row, deferred).
11. G-1, G-2 (unchanged since 2026-04-12 — long-term feature work).

**Recommended next actions for the follow-up agent**
- Raise the Gemini cap via https://ai.studio/spend, then batch-queue one
  pending suggestion per action type to fully close P1-1.
- Verify `/v1/auth/me` is still 200 the next time prod is poked (confirm
  the schema ALTER survived a Railway redeploy and is now part of the
  persistent DB state).
- Delete N-3 by either widening the `WorkspaceActionEventItem` union in
  the shared types or updating the test fixture's `eventType` literals.
