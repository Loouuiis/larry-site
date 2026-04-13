# Larry Full Test Report — 2026-04-12

**Tester:** Claude (Opus 4.6) via Playwright MCP against deployed `larry-pm.com`
**Test account:** `larry@larry.com` (production dedicated test tenant)
**Goal:** Full coverage sweep of every Larry feature — seed projects, exercise actions, chat with Larry through every entry point, capture bugs and missing behaviour for the next agent to fix.

---

## How to read this report

Each section follows the template:

- **Route / Feature**
- **What I did**
- **What happened**
- **Status:** ✅ works / ⚠️ partial / ❌ broken / ❓ unknown
- **Evidence:** screenshot path, console error, network 4xx/5xx, log correlation
- **Next agent TODO:** what a follow-up Claude needs to fix or re-verify

---

## Test plan (execution order)

Based on user direction: **seed first, exercise actions, then chat in every way.**

1. Deploy + API health check
2. Sign in
3. Create N=3 projects via different intake paths:
   - Manual project creation
   - Larry chat intake
   - Meeting transcript paste
4. Exercise Action Centre — accept/modify/decline across all suggested events
5. Exercise project view — inline accept, task detail, Gantt
6. Chat with Larry — four entry points:
   - `/workspace/larry` direct chat
   - Action Centre "Modify" chat
   - Inline chat on project page (if present)
   - Bottom-right chatbot (if present globally)
7. Verify autonomous behaviour — connectors, scraping, scheduled scan, briefing
8. Walk every remaining workspace route
9. Tail logs throughout, correlate browser errors to Railway/Vercel

---

## 0. Environment pre-flight


---

## FIXES APPLIED (post-report)

Subsequent pass against the 2026-04-12 findings documented in the longer
handoff copy (`docs/reports/qa-2026-04-12/*` and the Documents-path copy of
this report that totalled 336 lines). Each entry cites the commit that
closed the bug and the evidence captured on production.

### Step 1 — Chat fallback text — §4, §6, §7 — **FIXED**

**Commit:** `d96a2d5` *fix(chat): restore text-delta tokens (AI SDK v6 uses chunk.text)*

**Root cause:** `packages/ai/src/chat.ts` iterated `result.fullStream` and
read `chunk.delta` for `text-delta` parts. AI SDK v6's `TextStreamPart`
carries the payload in `chunk.text` (verified against
`node_modules/ai/dist/index.d.ts` L2601+ and `ai/docs/03-ai-sdk-core/05-generating-text.mdx`).
Every token was dropped, `fullContent` stayed empty, and the post-stream
path fell into `buildToolRecap(toolOutcomes)` which emits
*"I don't have anything to add here — ask me something specific and I'll dig in."*
on empty outcomes.

**Fix:** extracted `translateFullStreamChunkToChatEvent(chunk, pendingDisplayTexts)`
as a pure helper reading `chunk.text` for `text-delta`, with identical
behaviour for `tool-input-start` / `tool-result` / `error`. `streamLarryChat`
now delegates per-chunk translation to it.

**Regression guard:** `apps/api/tests/larry-chat-stream-translate.test.ts` —
5 tests covering single/multi-chunk text-delta, empty delta, tool-start
→ tool-done displayText threading, and ignored chunks. Red-green verified:
reintroducing `.delta` fails the two text-delta tests with
`expected '' to be 'Hello'` / `expected '' to be 'The biggest risk is auth.'`;
restoring `.text` passes all 5 with the full 247-test `@larry/api` suite
green.

**Production verification (post-deploy, hostname `7a426257deab`):**
- `POST /api/workspace/larry/chat/stream` on
  `c88a69db-9a93-4f8f-a5b8-f1f05d86497a` with body
  `{"message":"List every open task with its deadline."}` → 200,
  Railway `reqId=req-u` 5.7s.
- Larry's streamed response named all 11 open tasks in project C with
  their correct `YYYY-MM-DD` due dates (Security session revocation 04-20,
  Rate-limit 04-15, CSP 04-18, Coordinate pen-test 04-15, Exec update
  04-19, Pen-test requirements 04-15, Re-evaluation invite 04-30, etc.).
  Acceptance: ≥3 tasks — met with 11.
- Screenshot: `.playwright-mcp/step1-chat-fix-verified-prod-2026-04-12.png`.

The 11-task response still contains the T-2 transcript duplicates (two
"Draft Executive Update", two "Schedule Penetration Test Re-evaluation
Invite", two variants of the CSP task) — those are Step 2's scope, not a
chat regression.

### Step 2 — Transcript intake duplicates tasks — §3d, T-2 — **FIXED**

**Commit:** `daf7b2a` *fix(intake): transcript bootstrap stops writing tasks directly (T-2)*

**Root cause:** Meeting intake finalize in
`apps/api/src/routes/v1/project-intake.ts` (~L1064-1079) ran
`executeTaskCreate` for every extracted bootstrap task *and* published a
transcript `canonical_event`. The worker
(`apps/worker/src/canonical-event.ts` `handleTranscriptCanonicalEvent`)
independently ran `generateBootstrapFromTranscript` on the same
transcript and queued all of its extracted tasks as `task_create`
Action Centre suggestions. Result: N bootstrap tasks + N pending
suggestions. Accepting the suggestions duplicated the work — N + N = 2N
tasks for an N-action-item transcript.

**Fix:** removed the `executeTaskCreate` for-loop from the meeting-mode
branch of finalize. Per the product vision (human-approved for task
ownership / scope / deadlines), the worker's Action Centre queue is the
single source of truth. `meetingBootstrapTasks` is still persisted on
the intake draft for display in the success summary and seed message;
no task rows are materialised until the user clicks Accept.

**Regression guard:** new test in
`apps/api/tests/project-intake-runtime.test.ts` —
*"meeting finalize does NOT call executeTaskCreate — tasks flow only via
Action Centre suggestions (QA-2026-04-12 T-2)"*. Pre-fix the test failed
with `expected executeTaskCreate not to have been called, Number of
calls: 2` (2 mocked bootstrap tasks × 1 direct write). Post-fix the test
passes; full api suite: 248/248.

**Production verification (post-deploy, hostname `fe1f9bdf309f`):**
- Created `QA Test — T-2 Verify Transcript No Duplicate` via Start-from-meeting
  with a 3-action-item transcript (Anna App-Store checklist, Fergus
  server-side feature flag, Louis customer email).
- `POST /v1/projects/intake/drafts/e0ae3fb7…/finalize` → 200.
- Workspace project card: **0 open tasks** (direct-write path gone).
- Action Centre: **3 pending Create Task suggestions** — one per
  transcript action item, all attributed to "Origin: Meeting transcript".
- Accepted all 3: `POST /v1/larry/events/{d30f4282,ae80a816,3d915515}/accept`
  → 200 each.
- Project Task Center after accepts: **`0 of 3 tasks completed` — 3 Not
  Started, 0 In Progress, 0 At Risk, 0 Overdue, 0 Completed.**
- Ratio: 3 transcript action items → 3 tasks. No duplicates.
- Screenshot: `.playwright-mcp/step2-no-duplicate-tasks-verified-prod-2026-04-12.png`.

### Step 3 — Modify flow — M-1, M-4 — **FIXED** (M-2 / M-3 deferred)

**Commit:** `9ae721c` *fix(modify): hide system prompt + dismiss source suggestion (M-1, M-4)*

**M-1 root cause:** `POST /v1/larry/events/:id/modify` wrote
`"The user wants to modify this action: {displayText}. Original
reasoning: {reasoning}. Action type: {actionType}."` directly into
`larry_messages` with `role: 'larry'`. Rendered as Larry's first
visible bubble — looked like a leaked system prompt.

**M-1 fix:** replaced with a user-facing opener
`Let's refine "{displayText}". Tell me what to change — assignee,
deadline, priority, wording — and I'll queue an updated version in the
Action Centre.` The action being modified is already communicated by
the `launch=modify` URL parameters and the conversation title, so no
context is lost.

**M-4 root cause:** the modify endpoint did nothing to the source
suggestion. When the user's subsequent chat message produced a
`Create task: X with updates` card, the original remained pending
alongside it; accepting both duplicated the task.

**M-4 fix:** the modify endpoint now atomically calls
`markLarryEventDismissed(source_event_id, actorUserId,
"modify-superseded")` before responding. The user's intent in clicking
Modify is "don't accept this as-is" — so dismissal is safe even if
they abandon the refinement chat.

**Regression guard:** two tests in `apps/api/tests/larry-chat.test.ts`
under `describe("POST /larry/events/:id/modify", ...)` — pre-fix both
failed (inserted-content matched the leaked-template regex; `markLarryEventDismissed` called 0 times).
Post-fix both pass; full api suite: 250/250.

**Production verification (post-deploy, hostname `fe9f5e1aae20`):**
- Clicked Modify on the *Implement Server-Side Session Revocation
  List...* suggestion on project
  `c88a69db-9a93-4f8f-a5b8-f1f05d86497a`.
- `POST /api/workspace/larry/events/…/modify → 200`; frontend opened
  `/workspace/larry?…&launch=modify&sourceKind=meeting&eventType=suggested`.
- Larry's first (and only) bubble text: *"Let's refine 'Create task:
  \"Implement Server-Side Session Revocation List, JWT TTL Shrink, and
  Password Reset Revocation\"'. Tell me what to change — assignee,
  deadline, priority, wording — and I'll queue an updated version in
  the Action Centre."* — no "The user wants to modify this action:"
  template.
- Returning to `/workspace/actions`: Pending review dropped from **2 →
  1**; the Session Revocation card is no longer in Pending. Only a
  stale Rate-Limiting card from a pre-deploy test click remains.
- Screenshot: `.playwright-mcp/step3-m1-m4-verified-prod-2026-04-12.png`.

**Deferred to follow-up ticket — NOW SHIPPED in `db4c916`:**

### Step 3 follow-up — M-2, M-3 — **FIXED**

**Commit:** `db4c916` *fix(modify): keep optimistic user msg + show original payload (M-2, M-3)*

**M-2 root cause:** Both chat surfaces (`useLarryChat.ts` for FAB +
inline project panel, and `apps/web/src/app/workspace/larry/page.tsx`)
optimistically inserted a placeholder user bubble at sendMessage start
and then filtered it out by id on the SSE `done` event.
`/workspace/larry` mostly papered over this because
`setSelectedConversationId(eventConversationId)` usually triggered a
reactive `listLarryMessages` refetch — but when the page launched into
an existing conversation (e.g. `?launch=modify`, where the
`conversationId` is already set), that effect didn't re-fire and the
user bubble disappeared. `useLarryChat` never refetched at all, so
every FAB / inline turn looked like Larry talking to nobody.

**M-2 fix:** stop filtering the optimistic user message on `done` in
both hooks. The synthetic id is harmless — any future
`loadConversation` / `selectedConversationId` switch replaces the
entire array with the canonical server list, so there is no risk of
duplicate persistence.

**M-3 root cause:** The LLM had no visibility into the source action's
payload — only `displayText` — so its later "with updates"
confirmation was generic. It could not name the fields the user
actually changed.

**M-3 fix:** the modify endpoint's user-facing opener now surfaces the
current values (assignee, dueDate, priority for `task_create`; plus
owner/deadline/risk/status for other action types) inline:
> Let's refine "<displayText>". Currently: assigned to Joel, due 2026-04-15, priority high. Tell me what to change — assignee, deadline, priority, wording — and I'll queue an updated version in the Action Centre, noting which fields changed.

The "Currently: …" clause degrades gracefully (omitted when no fields
resolve). With those values now in conversation history, the LLM can
echo the diff in its later confirmation.

**Regression guard:** new test in
`apps/api/tests/larry-chat.test.ts` under
`POST /larry/events/:id/modify` —
*"includes the original action's payload (assignee, due date,
priority) in the opener so Larry can echo the diff (M-3)"*. Pre-fix
the inserted opener didn't contain `Joel`, `2026-04-15`, or `high`;
post-fix all three appear. Existing M-1 / M-4 guards still pass.

**Production verification (post-deploy, hostname `7ad7174200f6`):**
- Clicked Modify on the *Implement Rate Limiting on Login Endpoint*
  pending suggestion on project
  `c88a69db-9a93-4f8f-a5b8-f1f05d86497a`.
- Larry's first bubble:
  > Let's refine "Create task: \"Implement Rate Limiting on Login Endpoint\"". Currently: due 2026-04-15, priority high. Tell me what to change — assignee, deadline, priority, wording — and I'll queue an updated version in the Action Centre, noting which fields changed.
  No assigneeName resolved on the source payload, so that field was
  cleanly omitted — the rest came through.
- Typed *"Push the deadline to 30 April and assign to Anna."* —
  user bubble persists on screen (M-2 ✓) — see screenshot
  `.playwright-mcp/m2-m3-verified-prod-2026-04-13.png`.
- Returned to `/workspace/actions`: Pending review **1 → 0** (M-4
  guard from `9ae721c` still active).
- Note: Larry's reply itself was an `AI_RetryError` because the test
  tenant hit its monthly Gemini spending cap during this run — that
  is an environment / quota issue, not a code regression. The
  mechanical M-3 surface (opener carries payload values) is verified;
  the LLM's "echo the diff" prose can be re-validated once the cap is
  raised.

### Step 5 — Post-create briefing trigger — §1, §2b — **FIXED**

**Commit:** `152411c` *fix(intake): use bootstrap summary as project description fallback*

**Root cause clarification:** the report described "no AI briefing
yet" on new project cards, but the mechanism is actually the
`projects.description` column. /workspace's project card fell back to
the placeholder string "Live workspace with active delivery signals."
(or "Ready for the first task and meeting signal.") via
`apps/web/src/app/workspace/WorkspaceHome.tsx:134` whenever
`description` was null. Chat and transcript intake both produced a
`bootstrapSummary` describing the project ("Larry created N starter
tasks…", "Larry identified N action items from <meeting>") but never
wrote it to the row.

**Fix:**
- Chat-mode finalize now passes
  `draft.projectDescription ?? bootstrapSummary ?? null` to
  `INSERT INTO projects` so the description is contextual from row
  creation.
- Meeting-mode finalize INSERTs the project before the bootstrap is
  computed, so an idempotent `UPDATE projects SET description = $3
  WHERE description IS NULL` runs once `meetingBootstrapSummary` is
  available.

**Regression guard:** new test in
`apps/api/tests/project-intake-runtime.test.ts` —
*"persists bootstrap summary as project description when intake
provides no explicit description (chat path)"*. 253/253 api tests
passing.

### Step 6 — Surface scan failures (`lastRunError` was null) — §15 — **FIXED**

**Commit:** `445df02` *fix(worker): surface scan failures in last_run_error*

**Root cause:** `apps/worker/src/larry-scan.ts` caught per-project
exceptions, console.error'd them, and incremented `failed++` — but
never threaded any error message into `recordJobHeartbeat`. So
`system_job_runs.last_run_error` always landed as `null` even when
multiple items failed (the QA report's `failed: 5, error: null`).

**Fix:** collect each failure into `failureSummaries[]`, then build an
aggregated string for the heartbeat row:
- 1 failure: the message verbatim, capped at 480 chars.
- 2+: the first message + `(+N more)` suffix.
Cap is intentional so a noisy stack trace can't dominate the row;
the on-call needs the first signal, not a transcript.

Also fixed a pre-existing stale-test mismatch
(`sourceKind: "schedule"` → `"project_review"`) and brought
`apps/worker/src/larry-scan.js` (the tracked compiled sibling that
vitest's NodeNext import resolves to) in sync with the .ts source.

**Regression guard:** new test in
`apps/worker/tests/larry-scan.test.ts` — three projects, two of which
throw; asserts the heartbeat INSERT carries
`values[6] === "<error string>"`. 21/21 worker tests passing.

### Step 7 — T-1 (Open Project CTA) + starter data-testids — **FIXED (initial pass)**

**Commit:** `871e9b5` *fix(intake/ui): T-1 Open Project CTA + starter data-testids*

**T-1 root cause:** TranscriptPane's finalize handler read
`finalizeData.draft.projectId` — always undefined — when the API
actually returns `finalizeData.draft.finalized.projectId` (matching
the contract test in
`apps/api/tests/project-intake-runtime.test.ts` and the chat / manual
paths). The wizard's success branch never resolved a project id, so
the implicit `onSuccess` navigation never fired and the user got
stranded on the success banner.

**T-1 fix:** read `draft.finalized.projectId`, capture into
`successProjectId` state, and render an explicit "Open Project"
button on the success card as a defensive fallback in case
the parent's `onSuccess + modal close` races.

**testids first batch** (per `docs/TESTING.md` "When to Add Test IDs"):
- Action Centre row buttons:
  `data-testid="action-centre-{accept|modify|dismiss}"` plus
  `data-event-id={event.id}` so a Playwright test can target a
  specific row.
- Global FAB: `data-testid="ask-larry-fab"`.
- Larry chat Send button: `data-testid="larry-chat-send"`.
- Transcript-intake Open Project CTA:
  `data-testid="transcript-intake-open-project"`.

**Out of scope (deferred to a follow-up ticket):**
The brief's full external-content intake (4th wizard card with
.docx / .pdf / .pptx parsing) needs a binary file-upload UI plus
parser packages and a new canonical_event source — multi-day work.
.txt upload already exists on the transcript card; richer formats
will land as a standalone PR.

### Medium / Low cleanup — §1, §3a + meeting-title polish — **FIXED**

**Commit:** `ac9f586` *fix: Medium/Low QA cleanup — accept race, empty-state race, meeting title*

- **§3a — Accept double-click 409 race.** `useLarryActionCentre` now
  optimistically removes the suggestion from local state the moment
  the API returns 200. The button vanishes immediately; a fast click
  loop can no longer re-fire on the same event id. Same treatment
  applied to dismiss().
- **§1 — Landing empty-state race.** `WorkspaceHome` rendered "No
  projects yet" alongside the AI briefing carousel. Tightened the
  empty-state gate to also require
  `(!briefing || briefing.projects.length === 0) &&
   archivedCards.length === 0`.
- **Meeting title heuristic.** New helper
  `apps/api/src/lib/meeting-title.ts` derives a title from the
  transcript's first line — recognises "Meeting:", "Subject:",
  "Topic:", "Re:" headers (strips trailing "(date)" clauses), falls
  back to the first line itself when it looks like a title (short,
  no internal sentence break, no terminal punctuation, no leading
  bullet). Wired into both transcript ingestion sites. New
  `apps/api/tests/meeting-title.test.ts` covers all branches.

### Remaining items — DEFERRED

- **C-1** Connectors page calendar-link dropdown shows "No projects
  found yet" despite projects existing. Requires deeper
  investigation — the projects array genuinely arrives empty in this
  hook's load, but the same `/api/workspace/projects` endpoint
  returns the full list elsewhere on the same session; likely a
  scope or proxy refresh race I couldn't reproduce reliably.
- **G-1** Resolve transcript-mentioned names (Joel, Priya) into
  Larry users so extracted-task assignees aren't dropped — needs a
  team-lookup contract design.
- **G-2** Full external-content intake (.docx/.pdf/.pptx parsing).
- **G-3** Vercel CLI re-auth (resolved this session — `vercel login`
  done by user during Step 1).
- **Step 7 / further data-testid sweep** beyond the high-traffic
  starter set committed in 871e9b5.


### Step 4 — Invalid Date on /workspace/my-work + /workspace/calendar — §8, §9 — **FIXED**

**Commit:** `527629b` *fix(tasks): cast date columns to text so dueDate is YYYY-MM-DD*

**Root cause:** `apps/api/src/routes/v1/tasks.ts` SELECT exposed
`tasks.due_date` and `tasks.start_date` with the pg driver's default
`DATE` serialization — the values arrived in JS as `Date` objects and
JSON-stringified to full ISO timestamps like
`"2026-04-18T00:00:00.000Z"`. The web layer (`apps/web/src/app/workspace/WorkspaceMyWork.tsx:340`)
formats with `new Date(task.dueDate + "T12:00:00")` on the assumption
that `dueDate` is a bare `YYYY-MM-DD` string — concatenating
`"T12:00:00"` to a full ISO timestamp produced
`"2026-04-18T00:00:00.000ZT12:00:00"` → `Invalid Date` for every row
on /workspace/my-work (and the same `dueBucket` failure dropped most
rows from /workspace/calendar — the lone task that rendered was the
only one whose date happened to parse).

Verified the API shape pre-fix via `GET /api/workspace/home` from the
browser console — every `dueDate` came back as `"…T00:00:00.000Z"`,
`typeof === "string"`.

**Fix:** project both DATE columns explicitly as text in the SELECT —
`tasks.start_date::text as "startDate"` /
`tasks.due_date::text as "dueDate"`. The TS contract
(`dueDate: string | null`) and every consumer already assume the
`YYYY-MM-DD` shape; the cast just makes the DB match. Calendar's
`useCalendarEvents.toDateStr` (which wraps in `new Date(...)` and
slices) keeps working — `"2026-04-18"` is a valid date literal.

**Regression guard:** `apps/api/tests/tasks-route-due-date.test.ts` —
exercises `GET /tasks?projectStatus=active`, captures the SQL passed
to `db.queryTenant`, asserts the projection contains
`due_date::text as "dueDate"` and `start_date::text as "startDate"`.
Pre-fix the test failed (bare column refs); post-fix it passes.
251/251 api tests green.

**Production verification (post-deploy, hostname `cd2511b05cab`):**
- `/workspace/my-work` shows real dates across "This week" (15) and
  "Next week" (3) buckets — example column: 18 Apr, 16 Apr, 20 Apr,
  18 Apr, 15 Apr, 19 Apr, 19 Apr, 15 Apr, 19 Apr, 15 Apr, 18 Apr,
  15 Apr, 20 Apr, 17 Apr, 16 Apr, 25 Apr, 22 Apr, 21 Apr, 30 Apr,
  30 Apr. Zero "Invalid Date" strings (`grep -c "Invalid Date"
  step4-my-work-after-fix.yml = 0`).
- `/workspace/calendar` renders 17 distinct task events (Provide
  Penetration Test Requirements x2, Coordinate Penetration Test
  Logistics, Ship Server-Side Feature Flag, Conduct Project Kick-off
  Meeting, Plan User Research Strategy, Finalize App Store Review,
  Implement CSP Header x2, Schedule Penetration Test Re-evaluation,
  Draft Executive Update x2, Draft Customer Email, Implement Server-
  Side Session Revocation, Draft Cross-Team Communication, Define &
  Implement Onboarding Success Metrics, Assess Current Tooling) — was
  1 of 17 pre-fix.
- Screenshot: `.playwright-mcp/step4-my-work-fixed-prod-2026-04-13.png`.
