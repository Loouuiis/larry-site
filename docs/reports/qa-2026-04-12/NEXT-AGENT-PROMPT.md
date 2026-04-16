You are the implementation agent following up on a production QA pass against https://larry-pm.com. The QA agent just finished — their full report is at `docs/reports/qa-2026-04-12/QA-REPORT.md`, and all evidence screenshots are in the same folder. Read the report first, then work through the fixes below.

## Ground rules

- Larry is tested on production (Vercel + Railway). See `docs/TESTING.md` for Playwright MCP, Vercel MCP, and `railway`/`vercel` CLIs. Creds in `.env.test` (gitignored).
- **Climb the testing pyramid** — `tsc --noEmit` → `vitest` → smoke → Playwright. Don't reach for Playwright until you've proved the fix at a lower layer. If you're adding tests, add them where they're missing (there are no frontend unit tests yet — new components with logic deserve a vitest file).
- **Push before verifying.** Fergus doesn't run services locally. Commit to `master`, wait for Railway (2–3 min) and Vercel (~1 min), then verify against the deployed site.
- **Don't diagnose errors from code alone** — reproduce them at the lowest layer that catches them. If you don't have a failing test or a specific log line, you don't have a diagnosis yet.
- Respect the invariants in `CLAUDE.md` (no `namespace` on `@fastify/jwt`, no `output: "standalone"` in `next.config.ts`, all AI calls go through `packages/ai`, canonical-events is the single ingest path).

## Priority order

Three of the findings are higher priority than the rest because they affect every demo. Do these first and in this order:

### 1. C-5 — `/v1/larry/briefing` returns 500 at login (still broken after the spend-cap fix)

- Reproduce: log into https://larry-pm.com with the test account and watch the browser console. You will see `GET /api/workspace/larry/briefing → 500`. Railway `larry-site` logs confirm the 500 responds in ~370ms — far too fast to be an upstream AI call.
- Not a quota bug. The endpoint is almost certainly throwing before it ever reaches the model. Likely suspects: a new-tenant path that null-derefs, a missing feature flag, a DB column that doesn't exist yet, or a Zod schema that rejects the real DB payload.
- Work layer by layer: grep the route, read the handler in `apps/api/src/routes/v1/larry/briefing*`, find the throw, write a failing vitest assertion with the test tenant, fix, push. Then verify in the browser console on the deployed site.

### 2. C-3/C-6 — Larry chat writes "(no response)" *and* auto-executes mutations on read queries

This is the single worst UX in the app right now. Two symptoms, one likely root cause: the agent's `text` output is being lost while its tool calls are persisted and executed.

- Reproduce: log in, open `/workspace/larry`, pick the Marketing Campaign project, ask "What's the current status? Anything at risk?". Observe: the bubble renders `(no response)` as literal text, while three `risk_flag` actions auto-execute on real tasks (see `42-chat-status-retry.png` in the report folder).
- Expected behaviour: the query produces a **natural-language briefing**; no write actions are taken without approval. A query is not a command.
- Two things need to change:
  - **Render path** — find where the agent turn is written to `chat_messages` (or equivalent) and why `text` is empty. Check `packages/ai/src/intelligence.ts` and the Vercel-AI-SDK stream handler. If the SDK returns `text.length === 0` when only tool calls fire, the UI should fall back to a model-generated recap of the tool calls — never literal "(no response)" as body text. Remove that placeholder.
  - **Approval gate** — the `risk_flag` tool is currently auto-executing. It needs to land in Pending review instead. Find the allow-list of auto-exec tools (probably in `packages/ai` or the worker's action-dispatch code) and move `risk_flag` out of it. `status_update`, `owner_change`, `deadline_change` likely belong on the same side as `task_create` — behind approval.
- Cite evidence when you fix: the failing vitest assertion, the diff in the allow-list, and a post-push Playwright screenshot showing a real briefing string in the bubble.

### 3. C-7 — Chat-created tasks drop assignee and mis-read "next Friday"

- Reproduce: in the same chat, send "Create a task to review the security audit findings. Assign to Marcus, due next Friday." The resulting suggestion (and the accepted task in Task Center) has **no assignee** and is due **Sat 2026-04-18**. Today is Sun 2026-04-12 — "next Friday" should be **Fri 2026-04-17**.
- Two issues:
  - The `task_create` tool schema/prompt is not surfacing `assignee` as a required extraction. If the project has no member matching "Marcus" (the test tenant doesn't), the correct behaviour is to return a clarifying question, not to silently drop the field.
  - The date-normaliser for "next Friday" is anchoring wrong. Add unit tests for "today is Sunday Apr 12, 'next Friday' = Apr 17" and "today is Friday, 'next Friday' = the Friday 7 days out". Check whether the issue is in `packages/ai` extraction or in the worker's action applier.

## Next tier (fix this week)

### 4. I-1 — Bootstrap tasks ignore user-provided milestones

Test 1.1 input said "Landing page live by May 15, email sequences running by June 1, webinars in June, campaign wrap-up end of July." All six produced tasks were due **Apr 15–29**. The bootstrap prompt is producing only *preparation* tasks, not the milestones the user cares about.

Fix in `packages/ai/src/intelligence.ts` (or wherever the chat-intake prompt lives). Add an invariant: for every explicit milestone date the user states, emit at least one task with `due_date = that date`. Add a regression test with the Test 1.1 input and assert that tasks with `due_date` in May, June and July exist.

### 5. C-4 — Vague intake produces a task literally named "Not sure yet"

Test 1.2 input was "Improve onboarding" / "Make it better" / "Not sure yet" × 3. The bootstrap generated a starter task titled **"Not sure yet"** due 2026-04-15. Same prompt file. Add a guard: if the user's answers to outcome + deliverables + milestones are empty or placeholder-like (`/^(not sure|n.?a|tbd|idk|i don'?t know|.{0,3})$/i`), return a `follow_up_question` payload and **do not** emit a bootstrap. Test with those exact inputs.

### 6. I-3/I-4 — Failed transcripts stay "Processing" forever

Three meeting notes from the outage are still PROCESSING 45+ minutes later (see `37-transcript-retry-capfixed.png` — look at the stuck rows beneath the new READY one). The worker has no reaper. Add one:
- A BullMQ `stalled` handler or a periodic sweeper that marks any meeting note whose job hasn't heartbeat in N minutes as `FAILED` with an explanatory reason.
- Surface the `FAILED` status on the row (red pill + retry button).
- Clean up the three zombies that exist now: meeting note `bc6df552-e076-409f-ac01-67223707dd12` on project `00c82cbf-…`, plus the two on project `62925286-…`. Either resurrect them via a re-enqueue or delete them.

### 7. C-2 — Provider error text leaks to the end-user UI

The `apps/worker/src` transcript error handler passes `error.message` from Gemini straight to the user. Wrap it: log the raw message server-side, render a neutral "Larry is temporarily unavailable — we'll retry automatically" banner client-side. Do the same in any other place that renders `error.message` from an AI call.

### 8. I-5 — `docs/TESTING.md` references Railway services that don't exist

`larry-worker`, `larry-backend`, `larry-api` all error with `Service 'X' not found`. The only service is `larry-site` on `soothing-contentment`. Either rename in Railway or update the doc to reflect reality. Also answer the question: **where does the worker actually run?** If it's co-deployed with the API in `larry-site`, say so. If not, document where. I-6 follows from this: we need a way to verify the 30-minute scan is alive from a tester seat, even a simple `GET /v1/admin/scan/last-run`.

## Polish

9. Stop echoing the user's placeholder answers into the bootstrap summary ("Outcome focus: Make it better Milestone: Not sure yet").
10. Task Center row: clicking the title should open a detail panel, not enter inline rename. Hide the rename affordance behind a hover action or a menu.
11. Send button in chat stays disabled until a native keystroke fires — move the enable condition onto `value.trim().length > 0` so programmatic input also works.
12. Workspace Action Centre "PROJECTS TOUCHED: 0" while the user has live projects — either compute it or drop it.

## When you think you're done

Run Fergus's full test list again end-to-end on the deployed site before declaring anything complete:

```
docs/reports/qa-2026-04-12/QA-REPORT.md  # what you're fixing
docs/TESTING.md                          # how to verify on production
```

For each fix, the acceptance criteria in the original test stay exactly the same — don't weaken them. A fix is only done when the original test case passes, with the same screenshots the QA agent captured now showing green instead of red.

## Two things NOT to do

- Don't start with a big refactor of `packages/ai`. Every critical failure above is a small, scoped fix. Resist the urge to rewrite the agent framework.
- Don't touch the accept/dismiss action flow unless you see a regression. It works now (no 422, no 500) — the `larry-422-accept-fix.md` memory stands.

## Test artifacts to clean up when you're done

- Project `62925286-16a0-4af5-ab91-3cd65fd1aca2` (QA Test — Marketing Campaign)
- Project `00c82cbf-6de2-497e-9db5-9aeb3f85a7ee` (QA Test — API Migration)
- Three stuck meeting-note rows on those projects
- Chat thread "What's the current status? Anything at risk?" (contains 5 failed turns)
- Task "Provide staging access credentials to Marcus" was moved to In Progress during QA — revert if it matters

Report back with: the vitest assertions you added, the commit SHAs, and Playwright screenshots showing the critical tests now pass.
