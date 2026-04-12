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
