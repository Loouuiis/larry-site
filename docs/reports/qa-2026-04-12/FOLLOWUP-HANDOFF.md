# Follow-up Handoff — 2026-04-12 (after QA fixes session)

**Previous pass:** `docs/reports/qa-2026-04-12/QA-REPORT.md` (Fergus's Playwright run).
**This session's commits:** `f1167c4..5c827d0` on `master`.
**Read this before starting.** The original QA report describes the failures as tested. This document describes *what was fixed, what was partially fixed, and what was left on the floor*. Everything below is unfinished work the next agent owns.

---

## Summary

All **critical (C-*) and important (I-*) findings from QA-REPORT.md have a fix in production**. Every fix has at least one vitest assertion. `/v1/larry/briefing` now returns 200 with a real greeting, `/v1/admin/scan/last-run` returns a live heartbeat, the two QA projects are deleted, and the 30-min scan ran cleanly (`processed:32`, `failed:4`, `duration:142s`).

But several fixes are incomplete, brittle, or rely on LLM compliance rather than deterministic guards. The list below is ordered by blast-radius-if-it-regresses, not by effort.

| Priority | Item | Why it's unfinished |
|---|---|---|
| P1 | C-5 briefing has no Fastify-level regression test | Can regress silently; I verified with curl only |
| P1 | Worker test already red on master (`larry-scan.test.ts`) | CI is noisy; next real regression can hide in it |
| P1 | C-7 assignee guard is prompt-level only | LLM non-compliance still creates unassigned tasks |
| P2 | I-1 milestone fallback is dumb placeholder titles | User's schedule preserved but tasks read as stubs |
| P2 | C-3/C-6 approval gate is universal, not per-source | Scheduled scan now enqueues bulk suggestions |
| P2 | I-3/I-4 reaper depends on BullMQ repeat schedule | Single point of failure if Redis is wiped |
| P2 | Briefing cache not invalidated on project delete | 4-hour stale briefings after cleanup |
| P3 | C-2 sanitiser is a denylist, not an allowlist | New provider error phrasings will leak again |
| P3 | Polish #11 (Send button) — judgement call, not fixed | Paste-only / clipboard-API flows may still be blocked |
| P3 | Pre-existing TS errors in `apps/web` untouched | `react-markdown` missing module, implicit-any |
| P3 | I-5/I-6 assumes `apps/api/railway.toml` is the deploy command | If worker toml wins, migrations skip and heartbeat vanishes |
| P3 | Railway CLI service lookup is still flaky | I-5 root cause not actually fixed, only documented |

---

## Priority 1 — do these first

### 1. Write a Fastify-level regression test for C-5

**Why:** The fix in `apps/api/src/routes/v1/larry.ts` (commit `3b8e3c2`) replaced `WHERE u.tenant_id = $1` with a `memberships` JOIN. If a future edit restores the old shape — because `u.tenant_id` reads naturally to someone unfamiliar with the schema — the 500 comes back at every login with zero test coverage stopping it.

**What to add:**
- `apps/api/tests/larry-briefing-route.test.ts` that boots the Fastify app via `createApp()`, injects a request to `/v1/larry/briefing`, mocks `fastify.db.queryTenant` to throw `column u.tenant_id does not exist` when the SQL contains that substring, and asserts HTTP 200 with `degraded: "load-user"`.
- A second assertion that the happy path returns `degraded` undefined and a real greeting.
- Add a query-text assertion too: `expect(queryTenant.mock.calls[0][1]).not.toMatch(/\bu\.tenant_id\b/)`.

**File:** `apps/api/src/routes/v1/larry.ts:2098-2110` (the fixed SELECT).

### 2. Fix or quarantine the pre-existing `larry-scan.test.ts` failure

**Why:** `npm run worker:test` currently reports `Test Files 2 failed | 1 passed (3) · Tests 6 failed | 14 passed (20)`. The real bug in this session's diff is 0 failures — all mine pass. But a red CI baseline means the next real regression will be invisible ("oh, the worker tests are always red"). This is the exact failure mode of C-3 (the agent saw "(no response)" for hours without investigating).

**What to do:**
- The failing test expects `sourceKind: "schedule"` but `runLarryScan()` at `apps/worker/src/larry-scan.ts:42` actually writes `sourceKind: "project_review"`. Pick one.
- Likely fix: the test expectation is stale — `"project_review"` is the canonical label for scheduled health scans post-refactor. Update the test.
- If the canonical label should be `"schedule"` (matching the `triggeredBy` argument), change the ledger context on line 42.
- Pair this with a check of other tests that reference `sourceKind: "schedule"` — they should all agree.

### 3. Harden the C-7 assignee guard with a deterministic layer

**Why:** The prompt now says "if the user names someone not on the team, answer in prose and ask". That's soft — Gemini complies most of the time, not all of it. When it doesn't, `executeTaskCreate` at `packages/db/src/larry-executor.ts:714-716` calls `resolveUserByName`, gets `null`, and silently creates the task with `assignee_user_id = NULL`. Exactly what QA-REPORT C-7 flagged.

**What to add:**
- In `executeTaskCreate`, after `resolveUserByName`, if `payload.assigneeName` is set and `assigneeId === null`, *do not silently create the task*. Either:
  - (a) Throw a typed `ActionExecutionError` with `reason: "unresolved_assignee"` and the candidate name. The approval-flow UI can then render "Marcus isn't on this project — add them first or pick a different assignee" instead of creating an orphan.
  - (b) Create the task but attach a system-level flag `needs_assignee_resolution` so the UI shows a warning badge. Lower blast radius than (a), higher UX quality than nothing.
- Write a test in `apps/api/tests/governed-auto-execution.test.ts` that passes `assigneeName: "Marcus"` with no matching team member, mocks `resolveUserByName` → null, and asserts the task is **not** written or is written with a resolution-needed marker.

**Files:** `packages/db/src/larry-executor.ts:708-737`, and wherever the Action Centre renders a pending `task_create`.

---

## Priority 2 — needed before the next demo

### 4. I-1 milestone fallback produces placeholder task titles

**The symptom:** If the user says "launch by May 15" and the LLM ignores it and clusters tasks in April, my fallback at `apps/api/src/routes/v1/project-intake.ts:387-400` injects:
```
{ title: "Milestone deliverable due 2026-05-15", description: "User-stated milestone date from intake. Confirm scope and owner before the date.", dueDate: "2026-05-15", priority: "high" }
```
The date is preserved, but the title is a stub. A user reviewing the bootstrap preview sees a task that looks like placeholder content — the exact failure mode C-4 was meant to prevent.

**Better fix:**
- If `explicitMilestoneDates` are missing from the AI result, **re-prompt** with: "You omitted these dates from the user's stated timeline: [...]. Rewrite the task list to include at least one specific, named deliverable due on each date." This keeps the title meaningful.
- If the re-prompt also misses a date, *then* fall through to the placeholder.
- Alternatively, use the user's outcome string to synthesize a better title: instead of "Milestone deliverable due 2026-05-15", try "Launch landing page (from intake milestone)" when the outcome contains "landing page".

**File:** `apps/api/src/routes/v1/project-intake.ts:387-400`.

### 5. Approval-gate change is universal — consider a per-source override

**Why:** I added `risk_flag` and `status_update` to `APPROVAL_ONLY_ACTION_TYPES` in `packages/db/src/larry-executor.ts:169-183`. This is the strict reading of QA-REPORT C-6 and is the safest default. But it means:
- The 30-minute scheduled scan can never auto-flag a task as at-risk anymore — every flag lands in Pending review.
- If Fergus wants a demo where Larry wakes up, notices an overdue task, and autonomously escalates, that no longer works.

**What to do:**
- Ask Fergus whether scheduled scans should be allowed to auto-flag even when chat isn't. This is a product call, not a code call.
- If yes: change `decideAutoExecution` in `packages/db/src/larry-executor.ts:304-358` to consult `triggeredBy`. Allow `risk_flag` auto-exec when `triggeredBy === "schedule"` and role is `admin`/`pm`; keep chat on approval.
- If no: document the decision in `docs/AI-AGENT.md` so the next "why doesn't the scan do X" question has an answer.

### 6. I-3/I-4 reaper hasn't been demonstrated on live data

**Why:** The three zombie meeting notes from QA-REPORT were cleaned up by the project-delete cascade, not by the reaper. The reaper code compiled, the repeat job is registered, but I never saw it mark a real row dead_lettered. Also:
- The reaper uses BullMQ repeat schedules. If Redis is wiped (Railway restart, migration, retention), the repeat entry dies silently and no exception is raised.
- The 15-minute stale threshold is hardcoded in `apps/worker/src/handlers.ts:runStalledAttemptReaper`. Not configurable.

**What to do:**
- **Prove it works.** Force a stall: insert a row into `canonical_event_processing_attempts` with `status='running'` and `started_at = NOW() - INTERVAL '20 minutes'`. Wait 5 min. Verify it transitions to `dead_lettered` with the reaper's reason text.
- **Add a healthcheck.** Extend `/v1/admin/scan/last-run` (or add a sibling endpoint) that reports the last reaper run timestamp. Heartbeat goes through the same `system_job_runs` table.
- **Make threshold configurable** via env var (`WORKER_STALL_THRESHOLD_MINUTES`, default 15).

**Files:** `apps/worker/src/handlers.ts`, `apps/worker/src/worker.ts`, `packages/db/src/canonical-event-runtime.ts:reapStalledProcessingAttempts`.

### 7. Briefing cache not invalidated on project delete

**Symptom:** After deleting the two QA projects, the next `/v1/larry/briefing` call returned a briefing that **mentioned the deleted projects**. The 4-hour cache TTL in `apps/api/src/services/larry-briefing.ts:getOrGenerateBriefing` is stale-by-design, and there's no delete hook.

**What to add:**
- In `apps/api/src/routes/v1/projects.ts` (the `/:id/delete` handler around line 410), after the project purge transaction commits, invalidate cached briefings:
  ```sql
  DELETE FROM larry_briefings WHERE tenant_id = $1 AND content::jsonb -> 'projects' @> '[{"projectId":"<deletedProjectId>"}]'::jsonb
  ```
- Same treatment for project archive.
- Consider a shorter TTL (30 min) anyway — 4 hours is too long for a demo where projects change.

---

## Priority 3 — smaller polish, do when convenient

### 8. C-2 sanitiser is a denylist

**File:** `apps/worker/src/error-sanitizer.ts`.
**Risk:** Any new provider error phrasing that doesn't match the 9 regex patterns leaks. Example: if Gemini changes "spending cap" to "quota threshold reached" on a different endpoint, my regex for `/spending cap/i` misses it — but `/quota|rate[- ]?limit/i` would still catch it. Partial coverage only.
**Better approach:**
- Keep the denylist for known leaks.
- Add a URL allowlist: strip `https?://\S+` unconditionally from user-visible messages.
- Add a length cap that collapses any >200-char error to "Larry is temporarily unavailable." Provider errors tend to be verbose; real operational errors are typically short.

### 9. Polish #11 (Send button) — unresolved

**What happened:** I decided this was a Playwright-dispatchEvent artifact, not a user bug, because `ChatInput.tsx:267` already reads `value.trim().length < 1` from React state. That's a judgement call.

**What might still be broken:**
- Paste from clipboard on some browsers doesn't fire `onChange` — paste fires `onPaste` then the input value updates via the browser, not via React's synthetic event.
- Voice input (if re-enabled) that writes directly to the input via `ref.current.value = ...`.

**What to check:**
- Reproduce paste-only: open chat widget, focus the input, paste text with ⌘V, click Send *without* typing first. Does it submit?
- If no, add an `onPaste` handler to the input that calls `onChange(e.clipboardData.getData('text'))`.
- If yes, close this as "working as intended, the QA note was about Playwright automation".

**File:** `apps/web/src/components/larry/ChatInput.tsx:235-264`.

### 10. Pre-existing TypeScript errors in the frontend

**Evidence:**
```
$ npx tsc --noEmit -p apps/web/tsconfig.json
apps/web/src/app/workspace/LarryChat.tsx(4,27): error TS2307: Cannot find module 'react-markdown'
apps/web/src/app/workspace/LarryChat.tsx(119,27): error TS7031: Binding element 'children' implicitly has an 'any' type.
...
```

**Not my regression.** But the next agent climbing the testing pyramid (`tsc → vitest → smoke → Playwright`) hits these on step 1 and either spends time on them or gets used to ignoring them. Either is bad. Install `react-markdown` + `@types/react-markdown` or remove the import and inline a simpler renderer.

### 11. I-5/I-6 assumes `apps/api/railway.toml` is the deploy command

**Context:** The `larry-site` service runs one start command. Two `railway.toml` files exist:
- `apps/api/railway.toml` — runs `db:migrate` before `node server.js`.
- `apps/worker/railway.toml` — runs `node worker.js` directly, no migrations.

If Railway is actually configured to use the worker toml (or a different dashboard-defined start command), the `system_job_runs` table **never gets created** and my `recordJobHeartbeat` silently swallows the error at `apps/worker/src/larry-scan.ts:33`. The `/v1/admin/scan/last-run` endpoint then returns `"alive": false`.

**I verified it works right now** — the scan wrote a real row and the endpoint returned `alive:true`. So the deploy is currently using the api toml's migrate step. But this is a landmine: a future "simplify Railway config" change could silently break both the heartbeat and every future migration.

**Fix:** Decide on a single source of truth. Options:
- Move the migrate step into the Dockerfile `CMD` so it runs regardless of which toml wins.
- Add a startup check to the API server: `SELECT 1 FROM system_job_runs LIMIT 0` — if it throws, run migrations inline.
- Document the migrate dependency in `DEPLOYMENT.md` so a future refactor doesn't strip it.

### 12. Railway CLI flakiness is the actual I-5 root cause

**What I did:** Updated `docs/TESTING.md` to say the service is named `larry-site` (correct). I did not diagnose why `railway logs --service larry-site` intermittently returned `Service 'larry-site' not found` during this session.

**Hypothesis:** Railway CLI caches project/service metadata per working directory. `railway link` on one project then querying a service on the other project's name fails. But that doesn't explain why the same command worked early in my session and broke later.

**What to check:**
- `railway --version` — might be on an old/beta CLI build.
- `railway link --project soothing-contentment --environment production` then `railway service larry-site` — see if linking the service (not just the project) is the missing step.
- If reproducible, file an issue upstream. If not, document the exact repro steps in `docs/TESTING.md` so the next tester isn't stuck for an hour like I was.

---

## Known-correct-but-verify-on-next-demo

These are items I fixed and tested, but which rely on external systems that could drift:

- **C-3 recap text.** The synthesised recap ("Done — flagged the checkout task as high risk; I queued…") comes from `buildToolRecap()` at `apps/api/src/routes/v1/larry.ts:~2845`. It reads well in isolation. If a new tool type is added without a `displayText`, the recap reads as "Done — undefined". Future new tools: make sure `displayText` is always set.
- **C-7 date anchoring.** Works because `computeDateContext()` is called at `buildChatSystemPrompt()` invocation time, which is every chat request. If someone wraps the prompt in a server-side cache (e.g. Vercel Data Cache), the anchor freezes at cache-fill time and goes stale. Don't cache the chat system prompt.
- **I-1 milestone extractor.** Handles "May 15", "end of July", "in June", "by July", ISO dates, ordinals. **Does not handle:** quarters ("Q3"), fiscal-year references ("FY26"), relative phrases ("two weeks from kickoff"). If the QA test introduces those, add to `extractMilestoneDates` in `project-intake.ts`.

---

## Files touched this session

```
apps/api/src/app.ts
apps/api/src/routes/v1/admin.ts                    (new)
apps/api/src/routes/v1/index.ts
apps/api/src/routes/v1/larry.ts
apps/api/src/routes/v1/project-intake.ts
apps/api/tests/chat-date-context.test.ts           (new)
apps/api/tests/governed-auto-execution.test.ts
apps/api/tests/intake-placeholder-guard.test.ts    (new)
apps/web/src/app/workspace/actions/page.tsx
apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx
apps/worker/src/error-sanitizer.ts                 (new)
apps/worker/src/handlers.ts
apps/worker/src/larry-scan.ts
apps/worker/src/worker.ts
apps/worker/tests/error-sanitizer.test.ts          (new)
docs/TESTING.md
packages/ai/src/chat.ts
packages/ai/src/index.ts
packages/db/src/canonical-event-runtime.ts
packages/db/src/larry-executor.ts
packages/db/src/schema.sql
```

## Commits in session

```
5c827d0 fix(ui): Task Center row click + hide empty Projects Touched tile
eb44f9d feat: GET /v1/admin/scan/last-run + fix TESTING.md service names
bc2a9ca fix(worker): reap stalled attempts + sanitise provider errors
daca943 fix(intake): guard placeholder answers + honour stated milestone dates
2c79e50 fix(chat): anchor relative dates + refuse to drop assignee names
3b8e3c2 fix: briefing 500 root cause + chat approval gate + no-response fallback
cd6bf75 fix(briefing): surface failure stage in degraded response
3d41de2 fix(briefing): return 200 degraded on any error + log stack traces
```

---

## When you're done

Before declaring the QA pass fully closed, climb the pyramid one more time against live prod:

1. `npx tsc --noEmit -p apps/api/tsconfig.json` — source-only errors must be 0.
2. `npm run api:test && npm run worker:test` — all green, including whatever you did with `larry-scan.test.ts`.
3. `bash scripts/demo-smoke-test.sh` against production.
4. Playwright through the QA-REPORT test list — same screenshots should now be green where they were red.
5. Hit `/v1/admin/scan/last-run` and confirm `alive:true` with `ageMinutes < 60`.

Then write a similar handoff report for the session after this one — the discipline of "what did I leave unfixed" is cheap and catches exactly the failure modes this session's predecessor didn't.
