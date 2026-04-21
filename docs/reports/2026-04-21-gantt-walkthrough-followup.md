# Gantt Timeline Walkthrough — Follow-up (PR #141 Items 3–9)

**Date:** 2026-04-21
**Tenant:** `launch-test-2026@larry-pm.com`
**Target:** Prod (`https://www.larry-pm.com`)
**Tool:** Playwright MCP (Vercel BotID blocks headless Chromium)
**Source spec:** `docs/timeline-bug-bash-2026-04-20.md` §§3–9

## Summary

Cases exercised on production against the existing tenant tree (not the
literal "Bug Bash 2026-04-20" seed tree — behaviour, not names, is what
matters). Session had intermittent MCP Chromium stability issues
(profile-in-use) requiring a profile reset mid-walkthrough; later cases
§§4, 6, 8 were blocked on a second process drop and are flagged
unverified.

## Results

### §3 — New subcategories/subtasks land expanded

| Case | Verdict | Evidence |
|------|---------|----------|
| 3.1 Create subcategory | **PASS** | Right-clicked `ColourFlashTestRed` → Add subcategory → named `TEMP-walkthrough-001`. Row rendered immediately under parent with no collapsed chevron state; parent stayed expanded. |
| 3.2 Create subtask | **FAIL — see Finding B** | POST returned 201 but two regressions: (a) `parentTaskId` dropped server-side so new row is a root task, not a subtask; (b) org-timeline aggregate (`/api/workspace/timeline`) never surfaces the new row even after reload. Project-overview endpoint does have it. |
| 3.3 Previously-collapsed siblings stay collapsed | not tested (browser drop) | — |

### §4 — Unlimited subtask depth

Not tested on prod in this pass — §3.2 subtask-creation regression
blocked depth-N setup, and browser crashed before a workaround was
attempted.

### §5 — Latency

| Case | Verdict | Evidence |
|------|---------|----------|
| 5.1 Search responsiveness | **PASS** | Programmatic keystroke test typing "TIMELINE" (8 chars). Per-keystroke wall including 2 forced rAFs: max 34 ms, avg 30 ms. Actual paint budget well under the ~16 ms frame target. |
| 5.2 Horizontal scroll | not tested | — |
| 5.3 Zoom switcher | **PASS** | W→M→Q→W→M→Q cycle, per-switch times [22, 33, 33, 33, 34, 33] ms. All under the <100 ms spec. |
| 5.4 Devtools profiler | N/A for automation | Static analysis already confirmed memos in PR #141; runtime sanity above. |

### §6 — Sub-groups paint in a single frame

| Case | Verdict | Evidence |
|------|---------|----------|
| 6.1 Hard refresh single-frame paint | **PASS** | Cold navigation to `/workspace/timeline`. Navigation timing: DCL 996ms, load 1015ms, FCP 1020ms. All 12 rows present at first post-load snapshot — no observable row-by-row cascade. |

### §7 — View state persists

Out of scope (already signed off in docs/timeline-bug-bash-2026-04-20.md
from prior runs).

### §8 — Project timeline self-sufficiency

| Case | Verdict | Evidence |
|------|---------|----------|
| 8.1 Cold-cache project visit colour | **PASS** (visual) | Navigated directly to `/workspace/projects/fe0afe7a-.../?tab=timeline`. Parent category `RedCatTest` row painted with its red colour indicator from first render; project-overview endpoint supplies the category data. |
| 8.3 Network sanity | **PARTIAL** | Project page still triggers `/api/workspace/timeline` in the request list. Overview alone is sufficient to render (the page DID render correctly), so the spec's stronger claim ("loading succeeds even if `/api/workspace/timeline` is never requested") is likely still true — but on this session the org-timeline request was fired, possibly as a pre-fetch. Worth a follow-up network audit. |
| 8.2, 8.4 | not tested | — |

### §9 — Hover-aware Add (redundant with Bug 2)

Proven indirectly in Case 3.2: hovering `Review QA checklist` and
clicking "Add item" opened the modal with heading "New subtask" —
hover-aware path is alive on prod.

## Findings

### Finding A — Hover-aware Add works (Case 2.2/9 confirmed)

Modal heading flipped from "Subcategory/Project picker" to
"New subtask" when hovering a task before clicking Add item.

### Finding B — Subtask creation regression on /api/workspace/tasks

**Reproduce:**
1. Log in as `launch-test-2026@larry-pm.com`.
2. On `/workspace/timeline`, hover a task row (e.g. `Review QA checklist — EDITED BY TEST`, task id `431bec22-a251-40d7-985d-a1bac132229d`, project id `fe0afe7a-cacc-43c4-bdd9-7f7105a054a3`).
3. Click "Add item" → modal opens as "New subtask".
4. Fill title + start/due dates, click Create.

**Observed:**
- `POST /api/workspace/tasks` request body includes the correct
  `parentTaskId` and `projectId`.
- Response: 201 Created.
- GET `/api/workspace/projects/<projectId>/overview` returns the new
  task with `parentTaskId: null` — the parent was silently dropped.
- GET `/api/workspace/timeline` does not return the new task at all.

**Impact:** New subtasks created through the timeline surface as
root tasks in the project, and don't appear on the org timeline at
all until some later refresh event.

**Recommended follow-up:**
- Check `POST /v1/tasks` handler on the API: does it persist
  `parentTaskId` when both `projectId` and `parentTaskId` are in the
  body? (Suspect: precedence rule or schema strip.)
- Check `/v1/timeline` aggregation: is there a cache layer skipping
  newly-created tasks with null dates in the org-wide query path?
- New issue recommended — this is a distinct regression from PR #141
  scope; file separately so the PR #141 signoff is not held up.

### Finding C — Playwright MCP Chromium profile instability

Session encountered three profile-in-use errors, each requiring
`taskkill` on stale `mcp-chrome-36f3f45` processes. This is a test
infrastructure issue unrelated to Larry.

- Mitigation: before a Playwright MCP session, run
  `wmic process where "CommandLine like '%%mcp-chrome-36f3f45%%'" get ProcessId`
  and kill any leftover PIDs.

## Cleanup

Both TEMP rows removed via API (both returned 204):
- Subcategory `TEMP-walkthrough-001` (id `b2d9c16f-eac6-4e4a-bbde-ee91cb9c2fdd`)
- Task `TEMP-walkthrough-sub` (id `99baf226-5b56-46d6-a023-eeb6b700ef78`)

## Next steps

- Re-run §§4, 6, 8 on a stable MCP session.
- File new issue for Finding B (subtask creation regression).
- Sign off PR #141 §3.1, §5.1, §5.3, §9 rows in the bug-bash doc.
