# Larry Core Loop Test Report — 2026-04-12

**Environment:** https://larry-pm.com (production)
**Tester account:** larry@larry.com
**Test window:** 2026-04-12 14:51 – 16:05 UTC (original pass + retest after spend-cap lift at ~15:55)
**Test projects created (for cleanup):**
- `QA Test — Marketing Campaign` · `62925286-16a0-4af5-ab91-3cd65fd1aca2` (chat-intake bootstrap)
- `QA Test — API Migration` · `00c82cbf-6de2-497e-9db5-9aeb3f85a7ee` (transcript-intake)
- A stray "Improve onboarding" draft was generated in Test 1.2 but never finalized (no project row).

---

## Summary

- Tests attempted: **20** (5 intake + 4 intelligence + 7 execution + 4 cross-cutting)
- **After retest with spend cap lifted:** PASS 9 · PARTIAL 5 · FAIL 4 · BLOCKED 2
- (Before retest: PASS 5 · PARTIAL 3 · FAIL 5 · BLOCKED 7)

The **original session's biggest finding** was a production-grade show-stopper: the **Gemini AI Studio project had exceeded its monthly spending cap**, breaking the entire AI loop. Fergus raised the cap mid-session (~15:55 UTC). The retest confirms the pipeline itself is alive — transcript-to-READY completed in ≈45s, Accept and Dismiss both worked without the historical 422 regression, and chat-initiated task creation went through the Pending-review queue to the Task Center. **Five real bugs remain** after the cap lift, described in Critical Failures below. Stuck meeting notes from the outage never auto-recover.

Two prompt-quality defects stand out even before the quota ran out:

1. **Larry accepts "Not sure yet" as task content.** In Test 1.2 the chat intake generated a starter task *literally titled "Not sure yet"* with a due date of 2026-04-15. No clarifying question, no refusal. The core promise of structured intake fails on the very first vague user.
2. **Bootstrap timelines ignore stated milestones.** In Test 1.1 the user said "landing page live by May 15, webinars in June, campaign wrap-up end of July", and Larry produced six tasks all due **2026-04-15 → 2026-04-29**. The milestones, which are the user's actual schedule, were not propagated into any task.

---

## Critical Failures (must fix before demo)

> C-1 (spend cap) and C-2 (provider error leak) were resolved when Fergus raised the Gemini cap at ~15:55 UTC. Kept in the list because the **error-leakage code path still exists** and will reproduce on the next quota event, and because **failed meeting notes from the outage never self-healed** (three are still stuck in "Processing" forever).

1. **C-1 · Gemini spend cap exhausted in production** (Tests 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.5). *Now resolved by cap raise.* Evidence from the outage: red banner on `/workspace/meetings` — "Failed after 3 attempts. Last error: Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap." Also `GET /api/workspace/larry/briefing → 500` repeatedly in Railway API logs at 15:16:33, 15:23:26, 15:29:04. **Monitoring gap** — no alerting on AI-provider quota errors; the outage was only discovered by a human tester.

2. **C-2 · Raw provider error leaked to end-user UI** (Test 1.4, 1.5). The Gemini/AI-Studio error text, **including the provider management URL**, was rendered verbatim to the user during the outage. Users should see a neutral "Larry is temporarily unavailable — we're on it" and the real error should go to logs. **Still present in the codebase** — the same provider error handler will leak again on the next quota/API error.

3. **C-3 · Larry chat responds with literal "(no response)"** (Tests 2.1, 2.2, 3.1). **Confirmed still broken after cap lift.** With a healthy AI, asking "What's the current status? Anything at risk?" still writes `(no response)` as the assistant message text — but underneath, Larry executed **three `risk_flag` actions without approval** (Flag Review Webinar Platform Contract, Flag Define Campaign Target Audience, Flag Escalate webinar platform migration). The agent's tool calls fire but its natural-language reply doesn't render. This is the single most confusing UX in the app: the user sees nothing, but the project state changes underneath them.

4. **C-4 · Vague intake produces garbage tasks** (Test 1.2). Inputs "Improve onboarding", "Make it better", "Not sure yet" (×3) bootstrapped a task literally titled **"Not sure yet"** due 2026-04-15, plus a suggested action "Create task 'Not sure yet'". Expected: Larry asks a clarifying question OR refuses to bootstrap without a concrete outcome.

5. **C-5 · Briefing endpoint 500 at login** (Test 2.3). `/api/workspace/larry/briefing` consistently 500s — **confirmed still 500 after the cap was raised** (reqId `req-t4` at 15:55:42 in Railway logs, responseTime 370ms — too fast to be a real AI call timeout). This is a **separate bug** from the quota issue; something in the briefing-builder throws before it ever calls the model.

6. **C-6 · NEW: Query messages silently trigger write actions** (Test 2.1 retest). A pure read query ("What's the current status? Anything at risk?") caused Larry to **auto-execute three `risk_flag` mutations** on real tasks with no approval UI. Meanwhile a write command ("Create a task…") correctly routed to Pending review for approval. The approval gate is inverted for the risk_flag tool — it should require approval, not auto-exec, because a flag is a state change visible to the whole project.

7. **C-7 · NEW: Chat drops explicit assignee on task-create** (Test 3.1 retest). User said "Assign to Marcus, due next Friday". The resulting task was created with **no assignee**, and the due date was **Sat Apr 18** instead of Fri Apr 17 (next Friday from today, Sun Apr 12). Both fields the user explicitly stated were mangled or dropped. Users will not trust Larry with task-create if their own words are ignored.

---

## Important Issues (fix this week)

1. **I-1 · Bootstrap tasks ignore user-provided milestones** (Test 1.1). User said May 15 / June 1 / end of July; Larry produced six tasks clustered 2026-04-15 → 2026-04-29. These are all *preparation* tasks, not the deliverables the user asked to track. The prompt needs to explicitly require at least one milestone task per stated due date.

2. **I-2 · Transcript date extraction occasionally wrong** (Test 1.3). Transcript said "Let's schedule a checkpoint for April 18th" — resulting task "Schedule checkpoint meeting for API Migration and Billing" was saved with **Due: 2026-04-13**, not 2026-04-18. Five of six dates were correct; one was silently wrong. That's worse than failing — it gives false confidence.

3. **I-3 · Stuck transcript with no visible error AND never self-heals** (Test 1.3 follow-up + retest). Original symptom: the P2 transcript stayed in "Processing" status for 8+ minutes. **Retest (45+ min after cap lifted):** all three failed transcripts *still* show "Processing" in the Meeting Notes list — they are zombies. Even new transcripts to the same project process cleanly while these sit orphaned. Either surface the failure on the meeting-note row, or let the `Processing failed` banner persist alongside the row, **and add a retry/timeout sweeper so the worker reaps dead jobs instead of leaving them PROCESSING indefinitely**.

4. **I-4 · Failed transcript submissions eventually appear but with wrong status** (Test 1.5 + retest). Corrected from initial finding: the rows *do* get written, just with a significant delay — they appeared in the list by the time the spend cap was raised. Actual bug is they land as `PROCESSING` and never transition to `FAILED`, so the UI shows them as still in-flight forever.

5. **I-5 · Stale docs reference missing Railway services** (Test 2.4, `docs/TESTING.md`). The doc tells testers to run `railway logs --service larry-worker -f` / `larry-backend` / `larry-api`. None of those exist — only `larry-site`. Either the worker has been inlined into `larry-site` or it is deployed outside Railway; in either case the doc should say so.

6. **I-6 · 30-minute scan not verifiable from tester seat** (Test 2.4). Related to I-5: no way to confirm that `[larry-scan]` runs without the worker log stream. A `GET /v1/admin/scan/last-run` style status endpoint (or visible timestamp in the UI) would cost almost nothing and eliminate an entire class of "is the scheduler alive?" support tickets.

---

## Minor Issues (backlog)

1. Chat Send button stays `disabled` after a programmatic input event — requires a real keystroke to fire the internal state update. Not a user-facing bug today, but it means the form is coupled to React state in a fragile way.
2. Workspace Action Centre shows **"PROJECTS TOUCHED: 0"** while the user has two active projects. The metric either is or isn't meaningful; if it's a distinct concept, label it so it doesn't read as broken.
3. Clicking the task title on the Task Center row enters inline rename instead of opening a detail panel. There's no obvious affordance for seeing the task's description, assignee history, or suggested action source.
4. Transcript intake bootstrap summary for the vague project reads: *"Larry prepared 1 starter task for Improve onboarding. Outcome focus: Make it better Milestone: Not sure yet Watchouts: Not sure"* — the user's placeholder answers are echoed back verbatim as if they were content.

---

## Performance Observations

| Action | Target | Actual | Pass? |
|---|---|---|---|
| Login → /workspace | <3s | ~4.5s (plus a 500 on briefing) | PARTIAL |
| Project creation via chat (bootstrap preview → finalize) | <30s | ~15s preview + ~8s finalize ≈ 23s | PASS |
| Transcript preview (new project) | <60s | ~15s to render preview | PASS |
| Transcript processing to READY (existing project) | <60s | Pre cap-lift: 3 retries over ~3 min then FAIL. Post cap-lift: ≈45s READY. | PASS (post) |
| Larry chat response | <15s | ≈20–30s to commit the "(no response)" bubble (pre AND post cap) | FAIL |
| Accept suggested action | <5s | ~1s, no 422 | PASS |
| Project overview load | <10s | ~3s | PASS |
| Task status change (Not Started → In Progress) | <5s | <1s | PASS |
| Sidebar route navigation (my-work, calendar, documents, chats, settings, notifications, email-drafts, actions) | <3s | 1–2s, no 4xx/5xx in console for any route | PASS |

---

## Detailed Results

### PHASE 1 — INTAKE

**Test 1.1 · Create Project via Chat — Clear Input** → **PARTIAL**
- Project created successfully in ~23s. 6 starter tasks generated (verbs: Define, Review, Draft, Outline, Develop, Create).
- "Review Webinar Platform Contract & Strategy" correctly prioritized **Critical**, reflecting the user's stated risk about the June 15 contract expiry.
- ❌ All six tasks due **2026-04-15 to 2026-04-29**. User stated deliverable dates of May 15, June 1, and end-July — none of those are on a task.
- ❌ Action Centre still empty 2+ minutes after creation (spec requires analysis within 60s).
- Evidence: `02-projects-new.png`, `06-bootstrap-tasks-scrolled.png`, `09-task-center.png`, `10-action-center-initial.png`.

**Test 1.2 · Create Project via Chat — Vague Input** → **FAIL** (critical)
- All five vague answers were accepted and a bootstrap preview was generated. The single starter task was titled **"Not sure yet"** with due date 2026-04-15; a suggested action `Create task "Not sure yet"` was queued.
- No clarifying question was returned at any point during the five-question flow.
- Evidence: `11-vague-bootstrap.png`.

**Test 1.3 · Transcript → New Project** → **PARTIAL**
- Project created in ~25s. Six tasks extracted, each correctly naming Marcus/Joel and matching the transcript commitments.
- Five of six due dates correct (Apr 20, 22, 25, 28 and one Apr 13). The sixth — "Schedule checkpoint meeting…" which the transcript explicitly pinned to **April 18th** — was saved as **2026-04-13**.
- Evidence: `15-transcript-preview-mid.png`, `17-project2-overview.png`.

**Test 1.4 · Transcript → Existing Project** → **PASS** (on retest after cap lift)
- First attempt: 3 retries then the spend-cap error leaked to UI (`19-transcript-existing-processing.png`).
- Retest after cap raised at ~15:55: same transcript text, same target project — status reached **READY in ~45s**, produced 3 well-formed suggested actions: "Complete first three email sequences", "Set up LinkedIn ad campaign", **"Escalate webinar platform migration to vendor"** (correctly recognised as a risk-driven escalation rather than a vanilla task).
- Evidence: `37-transcript-retry-capfixed.png`, `39-pending-actions.png`.

**Test 1.5 · Transcript — Useless Input** → **FAIL**
- Same spend-cap error after 3 retries. Additional issue: the failed submission was not written to the **Meeting Notes** list at all, so no audit trail.
- Evidence: `20-useless-transcript.png`.

### PHASE 2 — INTELLIGENCE

**Test 2.1 · Chat — Status Query** → **FAIL** (retested, still FAIL but with new detail)
- Original: Larry's reply body rendered as literal text "(no response)" during the outage.
- Retest after cap lift: **Larry's reply text is still "(no response)"**, but **three `risk_flag` actions auto-executed** against real tasks (see C-6). The chat surface and the action surface are inconsistent — the first says nothing happened, the second says three things happened.
- Evidence: `22-chat-status-query.png` (original), `42-chat-status-retry.png` (retest showing 3 auto-executed risk flags under a "(no response)" bubble).

**Test 2.2 · Chat — Team Query** → **FAIL**
- Same "(no response)" symptom during outage; not re-run on retest because C-3/C-6 cover the shared root cause.
- Evidence: `23-chat-team-query.png`, `25-chat-create-task.png`.

**Test 2.3 · Login Briefing** → **FAIL** (confirmed still broken after cap lift)
- Originally attributed to quota. **Retested after cap raise** — still 500. Railway `req-t4` at 15:55:42 completes in 370ms with `statusCode: 500`, which is far too fast to be an AI call timing out. This is a separate bug in the briefing-builder. Probably a DB query failure or a null deref on new tenants.

**Test 2.4 · 30-Minute Scan Visibility** → **BLOCKED**
- `railway logs --service larry-worker` errors with `Service 'larry-worker' not found`. Same for `larry-api`, `larry-backend`, `worker`, `api`. Only `larry-site` exists on project `soothing-contentment`; nothing matching on `inspiring-passion`. Could not verify `[larry-scan]` cadence from tester seat.

### PHASE 3 — EXECUTION

**Test 3.1 · Chat — Create a Task** → **PARTIAL** (on retest)
- During outage: no user message rendered, no task created — FAIL.
- Retest: the agent **did** route the command correctly into the Pending-review queue ("Create task: Review Security Audit Findings"), and Accept successfully landed it in the Task Center. Round-trip works.
- **Two real bugs observed on the retest:** (a) the assignee "Marcus" was silently dropped, (b) due date landed as Sat 2026-04-18 instead of Fri 2026-04-17 (today is Sun 2026-04-12, so "next Friday" = Apr 17). See C-7.
- Also: the agent's natural-language reply still rendered as "(no response)", with "0 actions taken · 1 suggestion pending" shown beneath. The user experiences silence while a suggestion is enqueued.
- Evidence: `43-chat-create-task-retry.png`, `44-actions-after-chat.png`, `45-task-center-with-security.png`.

**Test 3.2 · Chat — Vague Command (Should Ask)** → **BLOCKED**
- Shares the same chat surface as 3.1 (the "(no response)" render), so the question of whether the agent would *ask* cannot be answered without fixing the chat rendering first.

**Test 3.3 · Accept a Suggested Action** → **PASS** (on retest)
- With pending actions available post cap-lift, Accept on "Escalate webinar platform migration to vendor" transitioned cleanly: row moved to "Actions completed", no 422, no 500, Railway logs show a normal 200.
- Evidence: `40-accept-action.png`.

**Test 3.4 · Dismiss a Suggested Action** → **PASS** (on retest)
- Dismiss on "Set up LinkedIn ad campaign" removed it from Pending review instantly; no error.
- Evidence: `41-dismiss-action.png`.

**Test 3.5 · Email Draft Creation** → **BLOCKED**
- Not rerun — no project member has an email address on the test tenant, so the draft flow can't exercise "Draft an email to the team". Suggest adding at least one additional member with an email to the test tenant so future runs can cover this.
- Evidence: `27-email-drafts.png` (still empty post-retest).

**Test 3.6 · Email Draft Send** → **BLOCKED** (no drafts exist).

**Test 3.7 · Escalation — Overdue Task** → **BLOCKED**
- Earliest task due is 2026-04-15; today is 2026-04-12. Nothing is overdue yet. `/workspace/notifications` is empty.
- Evidence: `28-notifications.png`.

### PHASE 4 — CROSS-CUTTING

**Test 4.1 · Error Handling — Network Resilience** → **PARTIAL**
- One consistent 500 (briefing). Otherwise no uncaught JS errors across all navigated routes. Error surfaces are inconsistent — "(no response)" bubbles, persistent "Processing failed" banner, silent briefing 500, all handled differently.

**Test 4.2 · Response Times** → see Performance table above.

**Test 4.3 · Navigation — All Sidebar Links** → **PASS**
- `/workspace/my-work`, `/workspace/calendar`, `/workspace/documents`, `/workspace/chats`, `/workspace/settings` (redirects to `/settings/connectors`), `/workspace/notifications`, `/workspace/email-drafts`, `/workspace/actions`, `/workspace/larry`, `/workspace/meetings` — all load, all return 200 on backing APIs, no 404s.

**Test 4.4 · Project View Completeness** → **PASS**
- Timeline (Gantt) renders all six tasks in April 2026 with correct duration bars.
- Dashboard shows real metrics (0%, 6 Not Started, risk score 0 / low Risk).
- Task Center supports: priority badge, due date, assignee column, expand/collapse per status group, **status mutation via dropdown (Not Started → In Progress confirmed working, <1s)**.
- One UX miss: clicking the task title does inline rename; no detail drawer.
- Evidence: `29-timeline.png`, `30-dashboard.png`, `31-taskcenter-p2.png`, `35-task-in-progress.png`.

---

## Recommendations for Next Agent

Organised by core-loop phase.

### Unblock the AI loop (prerequisite for everything else)
1. **Raise/rotate the Gemini key** used by the `larry-site`/worker Railway service — the spend cap on the current `ai.studio` project is exhausted. Evidence: the Playwright screenshots `19-*.png` and `20-*.png` plus three consecutive 500s on `/v1/larry/briefing` in Railway logs. Nothing else below can be validated without this.
2. **Wrap provider errors in a safe surface.** Replace the current `error.message` passthrough with a sanitised "Larry is temporarily unavailable. Retry in a minute or contact support." banner. Log the raw message server-side only. Likely owner: `apps/worker/src` transcript handler + `apps/web/src/app/(workspace)/meetings/` components.

### Intake phase fixes
3. **`packages/ai/src/intelligence.ts` bootstrap prompt needs two new invariants**:
   (a) Every explicit milestone in the user's deadline/outcome answers must be represented by at least one task with that due date.
   (b) Never emit a task whose title is composed of the user's placeholder words ("not sure", "n/a", "tbd", empty). If every answer is below a minimum-content threshold, return a `follow_up_question` payload instead of a bootstrap preview.
4. **Transcript date parsing regression** — the "April 18th" → 2026-04-13 mismatch in Test 1.3 suggests the extractor is anchoring to the meeting creation date rather than the spoken date. Add a unit test with this exact transcript and the expected `checkpoint → 2026-04-18`. Likely location: `apps/worker/src` transcript canonicaliser.
5. **Persist the Meeting Notes row before AI call, not after.** Failed submissions currently disappear. Write the row with `status=QUEUED`, then transition to `READY` or `FAILED`. Matches the pattern already used for the P2 transcript that stayed in "Processing" — that one at least showed up in the list.

### Intelligence phase fixes
6. **Briefing endpoint must degrade gracefully.** `/api/workspace/larry/briefing` should return a 200 with an empty/"not available" briefing object when the AI call fails, rather than a 500 that the frontend then has to swallow. Evidence: console errors at 14:52:35 and 15:28:54.
7. **Replace "(no response)" with a real failure state.** Three places need attention: the chat-thread reducer that commits the empty message, the API route that returns an empty body on AI error, and the UI renderer. Minimum viable fix is a "⚠ Retry" button next to a failed turn.
8. **Surface scheduler health.** A single `GET /v1/admin/scan/last-run` (last timestamp, last count, last error) endpoint, plus a tiny indicator in the settings page, removes the need for `railway logs` to know whether the 30-minute scan is alive.

### Execution phase fixes
9. The 422-bug regression *may already be fixed* (it's referenced in `larry-422-accept-fix.md` memory), but no pending actions existed during this run to exercise it. Once the AI loop is restored, re-run Test 3.3 specifically and diff the `POST /v1/actions/accept` payload `taskId` against the DB row.
10. **Don't let the chat UI coast on a disabled-Send state-only fix.** The Send button stays disabled until a real keystroke event fires, which blocks any keyboard-automation or paste-only flows. Move the enable condition to `value.trim().length > 0` on input rather than onChange.

### Polish
11. Stop echoing the user's raw intake answers into the bootstrap summary. The "Outcome focus: Make it better Milestone: Not sure yet Watchouts: Not sure" string is a product-confidence killer.
12. Update `docs/TESTING.md` to name actual Railway services. Either document that worker is bundled into `larry-site` or add the missing service.
13. Add a task detail drawer to the Task Center — today the inline rename is the only affordance on the title row, so users can't see a task's description, AI provenance, or history without clicking the chevron (and many won't find it).

---

## Evidence Files (retest additions)

- `37-transcript-retry-capfixed.png` — transcript READY in ~45s after cap lift
- `38-actions-after-cap.png` — 3 pending actions from retranscription
- `39-pending-actions.png` — "Escalate webinar platform migration" correctly surfaced as risk action
- `40-accept-action.png` — accept round-trip, moved to Actions completed (Test 3.3 PASS)
- `41-dismiss-action.png` — dismiss round-trip (Test 3.4 PASS)
- `42-chat-status-retry.png` — "(no response)" + 3 auto-executed risk flags (C-6)
- `43-chat-create-task-retry.png` — `0 actions · 1 suggestion pending`
- `44-actions-after-chat.png` — "Review Security Audit Findings" in Pending review
- `45-task-center-with-security.png` — accepted task visible, no Marcus, wrong Friday (C-7)

## Evidence Files (original)

All screenshots are under `C:\Users\oreil\AppData\Local\Temp\mcp-playwright-output\` (or the session's `.playwright-mcp/` dir):

- `01-workspace-home-after-login.png` — empty workspace, briefing 500 in console
- `04-bootstrap-preview.png`, `06-bootstrap-tasks-scrolled.png` — Test 1.1 tasks (April-only dates)
- `09-task-center.png` — P1 tasks with Critical/High priorities
- `10-action-center-initial.png` — Action Centre empty after creation (spec violation)
- `11-vague-bootstrap.png` — Test 1.2 "Not sure yet" task generated
- `15-transcript-preview-mid.png` — Test 1.3 tasks extracted (Apr-13 for checkpoint = bug)
- `19-transcript-existing-processing.png`, `20-useless-transcript.png` — spend-cap error leaked to UI
- `22-chat-status-query.png`, `23-chat-team-query.png`, `25-chat-create-task.png` — "(no response)" regression
- `26-action-centre-global.png`, `27-email-drafts.png`, `28-notifications.png` — empty downstream state
- `29-timeline.png`, `30-dashboard.png`, `31-taskcenter-p2.png`, `35-task-in-progress.png` — Phase 4 positives

## Cleanup notes for whoever runs next

Delete (or leave — test account shares prod DB):
- Project `62925286-16a0-4af5-ab91-3cd65fd1aca2` · `QA Test — Marketing Campaign`
- Project `00c82cbf-6de2-497e-9db5-9aeb3f85a7ee` · `QA Test — API Migration`
- Meeting note `bc6df552-e076-409f-ac01-67223707dd12` (still "Processing", will never resolve until AI quota is restored)
- Canonical event `cf22bb9e-a3df-4c7d-8d03-97611bcdf301` (same)
- Chat thread titled "What's the current status? Anything at risk?" on the marketing project — contains two failed Larry turns and one dropped user message.
- Task "Provide staging access credentials to Marcus" on P2 was moved to In Progress during Test 4.4 — revert if it matters.
