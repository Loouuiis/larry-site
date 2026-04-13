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

**Deferred to follow-up ticket:**
- **M-2** (user's typed message not rendered in FAB / inline project
  chat panels — `/workspace/larry` already has optimistic insert at
  `apps/web/src/app/workspace/larry/page.tsx:455`): lives in separate
  chat-panel components and needs their `handleSend` to add an
  optimistic user-message insert before the fetch.
- **M-3** (generic modify confirmation — "I queued 'Create task: X
  with updates' in the Action Centre for you to review." — doesn't
  echo the fields the user actually changed): requires threading the
  original action context into the chat system prompt when
  `conversation.sourceEventId` is set, plus prompt-engineering to ask
  Larry to echo the diff. Non-trivial; filed as a standalone ticket.

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
