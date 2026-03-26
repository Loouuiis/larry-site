# Larry — 4-Day MVP Sprint Plan
# March 25–28, 2026

---

## HOW TO USE THIS PLAN

This document drives every Claude Code session until launch.

**Rules for each session:**
1. Paste this file into a new Claude Code conversation.
2. Say: `"Open the sprint plan and execute the next uncompleted session."`
3. When a session is fully complete and its branch is merged, wrap the entire session
   block in `<!-- DONE ... -->` tags so future agents skip it cleanly.
4. **Every frontend/UI task:** the `frontend-developer` subagent in `.claude/agents/`
   must be invoked before touching any `.tsx`, `.css`, or layout file.
5. Every backend task: read the target file before editing — never edit blind.
6. Each session creates its own feature branch. Branch naming: `feat/sN-short-title`.
   PRs reviewed and merged to `master` before the next dependent session begins.

**Marking a session done:**
```
<!-- ✅ SESSION N — COMPLETE (YYYY-MM-DD)
[original session content]
-->
```

---

## SCOPE — OPTION A: HONEST PILOT MVP

### IN SCOPE FOR LAUNCH
- Standalone workspace for project execution
- Manual + Chat-with-Larry + Transcript-paste project creation — all 3 wired end-to-end
- Slack ingestion → Action Centre → approval → task updates
- Google Calendar watch + webhook (with renewal fix)
- Action Centre with source context cards, approval-gated actions, transparency principles
- Weekly summary / health / risk views (live data)
- Email draft generation as an **output artifact** (outbound only — no inbound email OAuth)
- Persistent Larry chat history
- Org account approval flow (no self-serve; admin manually approves new organisations)
- Beautiful, world-class landing page and workspace dashboard

### EXPLICITLY OUT OF SCOPE (do not build, do not promise)
- Live inbound email OAuth — Email "Connect" button shows "Coming soon" (disabled)
  **TODO (post-launch):** Real Gmail OAuth connector — Issues #14, #15
- Voice input — placeholder mic button only, no functionality
  **TODO (post-launch):** Voice-first project setup — Issue #26
- PDF/PPT export — "Generate Report" button shows "Coming soon"
  **TODO (post-launch):** PDF report endpoint — Issues #23, #29
- External content import (4th project-start mode)
  **TODO (post-launch):** External content import flow — Issue #28
- Manager escalation hierarchy — Issue #19
- Risk scoring behaviour signals — Issue #18
- Dependency completion notifications — Issue #16
- Jira/Asana/ClickUp sync
- Task comment thread UI — Issue #25
- Mobile/responsive layout — Issue #27
- Audit log coverage — Issue #31

---

## DEMO NORTH STAR

The canonical demo that every technical decision must serve:

1. Open `larry-pm.com` → beautiful, world-class landing page
2. Sign in → gorgeous dashboard with a prominent "Create Project" area
3. Create project via **paste meeting transcript** → Larry extracts tasks + structure
4. Action Centre shows extracted actions with source context cards
5. Approve → project appears in workspace with tasks, Gantt, health view
6. Show **Slack integration**: mention a task in Slack → action appears in Action Centre
7. Show **Google Calendar**: meeting scheduled by Larry → synced to project
8. Show Larry drafting an email, scheduling a follow-up call → approval-gated throughout
9. Demo is clean, fast, and never hits a broken surface

---

## TEAM & OWNERSHIP

| Person | Role | Sprint % |
|--------|------|----------|
| **Fergus** | Fullstack lead | 40% |
| **Anton** | Frontend | 30% |
| **Joel** | Backend | 30% |

Joint sessions noted as primary + secondary (e.g. `Fergus + Joel`).

---

## DEPLOYMENT CONTEXT

- **Frontend:** Vercel → `larry-pm.com` (auto-deploys on push to `master`)
- **API + Worker:** Railway — project `soothing-contentment / production`
- **DB + Redis:** Railway managed
- **Status:** Fully live ✓
- **Branch strategy:** feature branch per session → PR → merge to `master`

### Pending before Session 1 starts
- Anton's `dev` branch (sidebar design + mic button cosmetics) should be reviewed
  and merged to `master` before any frontend sessions begin. Frontend sessions
  marked with ⚠️ DEP:ANTON-DEV depend on this.
- The 5 auth/rate-limit commits on local `master` should be pushed to
  `origin/master` by whoever owns that branch.

---

## PARALLEL EXECUTION MAP

Sessions that can run simultaneously across the team:

```
Day 1 (Mar 25)
  Fergus + Joel ── Session 1 (security + calendar fix)
  Joel          ── Session 2 starts after Session 1 done

Day 2 (Mar 26)
  Joel + Fergus ── Session 2 (project_create execution) [morning]
  Anton         ── Session 4 (ProjectWorkspace Overview + Gantt) [morning, after dev branch merged]
  Fergus + Anton── Session 3 (StartProjectFlow) [afternoon, after Session 2]

Day 3 (Mar 27)
  Anton         ── Sessions 5 → 6 → 10 (sequential frontend)
  Joel          ── Sessions 9 → 12 (Calendar + AI model)
  Joel + Fergus ── Session 8 (Slack validation, can interleave with above)
  Anton + Fergus── Session 7 (Action Centre, after Anton finishes Session 6)

Day 4 (Mar 28)
  Anton + Fergus── Session 11 (Landing page + dashboard) [morning]
  Fergus + Joel ── Session 13 (E2E + CI) [parallel with Session 11]
  Fergus        ── Session 14 (Deploy + demo prep) [afternoon]
```

---
---
---

## SESSION 1 — SECURITY & IMMEDIATE FIXES
**Day 1 — March 25 | Owner: Fergus + Joel | Est: 1.5h**
**Branch: `feat/s1-security-fixes`**

**Goal:** Fix the four immediate launch-blocking bugs that require no product decisions —
health endpoint leakage, calendar renewal token, reporting idempotency, escalation spam.

### Issues Addressed
- Readiness report blocker #5: Calendar renewal breaks webhook auth after renewal
- Readiness report blocker #6: `/api/health` leaks `TURSO_DATABASE_URL` + raw errors publicly
- Readiness report #9: Reporting endpoints insert snapshots on every read
- Readiness report #10: Escalation notifications duplicate over time

### Files to Touch

#### 1. Health endpoint — remove config leakage
`apps/web/src/app/api/health/route.ts`
- Return only `{ ok: true }` on success, `{ ok: false }` on failure
- Remove `url`, `hasToken`, and `error: String(err)` from response body
- A public health check must not reveal infrastructure details

#### 2. Calendar renewal — add channelToken
`apps/worker/src/calendar-renewal.ts`
- The initial watch registration in `connectors-google-calendar.ts` sends a signed
  `channelToken`. The renewal job must send the same token.
- Read `webhook_channel_token` from the `google_calendar_installations` row (add
  column to schema if not present, or use `webhook_channel_id` as the token value
  if that's what the initial registration stored).
- Add `token: channelToken` to the Google Calendar watch request body in the renewal.

#### 3. Reporting idempotency — no insert on every read
`apps/api/src/routes/v1/reporting.ts`
- `GET /projects/:id/health` — before inserting into `risk_snapshots`, check if a
  row already exists for `(tenant_id, project_id, DATE(NOW()))`. Skip insert if so.
- `GET /projects/:id/outcomes` and `GET /projects/:id/weekly-summary` — same
  dedup pattern for `report_snapshots`. Check `(tenant_id, project_id, DATE(NOW()))`.

#### 4. Escalation dedup — add unique constraint
`packages/db/src/schema.sql` + new migration
- Add unique constraint on `notifications` table:
  `UNIQUE (tenant_id, task_id, notification_type, DATE(created_at))`
  or equivalent window key that prevents the same escalation firing twice in one day.
- `apps/worker/src/escalation.ts` — verify the `ON CONFLICT DO NOTHING` target
  matches the new unique key.

### Acceptance Criteria
- [ ] `GET /api/health` returns `{ ok: true }` only — no URLs, tokens, or error strings
- [ ] Calendar renewal function sends `channelToken` in the watch request body
- [ ] `GET /projects/:id/health` does not insert a duplicate snapshot on the same day
- [ ] Escalation job does not fire duplicate notifications for the same task on the same day
- [ ] `npm run api:test` still passes after changes

---

## SESSION 2 — project_create EXECUTION + ORG INVITE FLOW
**Day 1–2 — March 25–26 | Owner: Joel + Fergus | Est: 3h**
**Branch: `feat/s2-project-create-execution`**

**Goal:** Wire the single most critical missing execution path: approving a `project_create`
action must actually create a project and seed tasks in the DB. Also implement the org
account approval flow so pilot customers can be onboarded without a self-serve signup.

### Issues Addressed
- [P0] #1 Wire approvals → real task creation in DB
- Readiness report blocker #3: "approving project_create delivers no artifact"
- Readiness report blocker #7: "real workspace onboarding is not there yet"

### Part A — project_create Execution

**File: `apps/api/src/routes/v1/actions.ts`**

After the existing `approved` state update (around line 197 where Slack outbound fires),
add an execution block for `project_create`:

```typescript
if (action.actionType === "project_create") {
  const p = action.payload as {
    name: string;
    description?: string;
    tasks?: Array<{ title: string; description?: string; dueDate?: string; assignee?: string }>;
  };

  // 1. Insert project
  const [newProject] = await fastify.db.queryTenant(tenantId, `
    INSERT INTO projects (tenant_id, name, description, status, created_by)
    VALUES ($1, $2, $3, 'active', $4)
    RETURNING id
  `, [tenantId, p.name, p.description ?? "", userId]);

  // 2. Seed starter tasks
  if (p.tasks?.length) {
    for (const t of p.tasks) {
      await fastify.db.queryTenant(tenantId, `
        INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, due_date)
        VALUES ($1, $2, $3, $4, 'not_started', 'medium', $5)
      `, [tenantId, newProject.id, t.title, t.description ?? "", t.dueDate ?? null]);
    }
  }

  // 3. Return projectId in response so frontend can redirect
  reply.send({ ok: true, state: "approved", projectId: newProject.id });
  return;
}
```

**File: `apps/api/src/routes/v1/larry.ts`**

Verify that `project_create` actions are created with a payload that includes
`name`, `description`, and `tasks[]`. If the LLM prompt doesn't request this
structure, update the system prompt in `packages/ai/src/index.ts` to include it.

### Part B — Org Invite / Approval Flow

**New file: `apps/api/src/routes/v1/orgs.ts`**

Two public endpoints:
- `POST /api/v1/orgs/request` — accepts `{ orgName, contactEmail, description }`,
  inserts into a new `org_invites` table with `status = 'pending'`
- `GET /api/v1/admin/orgs/requests` — protected by `Authorization: Bearer ${ADMIN_SECRET}`,
  returns all pending org invite requests
- `POST /api/v1/admin/orgs/:id/approve` — protected same way, creates the tenant +
  seeds an admin user with a temporary password, returns `{ tenantId, tempPassword }`

**New migration: `packages/db/src/migrations/003_org_invites.sql`**
```sql
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);
```

The existing dev-login + seeded credentials remain untouched for demos.

### Acceptance Criteria
- [ ] Chat with Larry → describe a project → Action Centre shows `project_create` pending
- [ ] Approve in Action Centre → project appears in workspace with starter tasks
- [ ] Approval response includes `projectId` → frontend can redirect to new project
- [ ] `POST /api/v1/orgs/request` creates a pending invite record
- [ ] `POST /api/v1/admin/orgs/:id/approve` creates tenant + admin user
- [ ] Admin endpoints return 401 without valid `ADMIN_SECRET`
- [ ] `npm run api:test` passes

---

## SESSION 3 — STARTPROJECTFLOW: 3 REAL PATHS
**Day 2 — March 26 | Owner: Fergus + Anton | Est: 2h**
**Branch: `feat/s3-start-project-flow`**
**⚠️ DEP:ANTON-DEV — merge Anton's `dev` branch first**

**Goal:** Rewrite `StartProjectFlow.tsx` so all 3 project-start modes map to real backend
paths, and the UI is demo-ready — premium card design, no false-promise copy.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Issues Addressed
- Readiness report blocker #2: "start-a-project flow does not match the promised product"
- [P2] #24 Chat-based project creation UI

### Files to Touch
- `apps/web/src/components/dashboard/StartProjectFlow.tsx` — full rewrite of 3-mode flow
- `apps/web/src/app/api/workspace/projects/route.ts` — accept richer payload per mode

### The 3 Modes

**Mode 1 — Manual Creation**
- Collect: project name, description, optional start/end date
- `POST /api/workspace/projects` with `{ mode: "manual", name, description, startDate, endDate }`
- On success: close modal + navigate to `/workspace/projects/:newProjectId`

**Mode 2 — Chat with Larry**
- Inline Larry chat within the modal — user describes the project
- Sends to `POST /api/workspace/larry/message` → creates `project_create` pending action
- On success: close modal + show toast: "Your project is in the Action Centre — review it to create."
- Toast includes a link to `/workspace/actions`

**Mode 3 — Insert Meeting Transcript**
- Textarea for transcript paste (or file upload for .txt/.docx)
- `POST /api/workspace/ingestion/transcript` with `{ content: transcriptText }`
- Show spinner: "Larry is reading your transcript…"
- On success: close modal + show toast: "Larry found [N] actions — review them in the Action Centre."

### UX Notes
- The 3 modes appear as **large card tiles** on step 2 of the flow
  (step 1 is the existing welcome/Larry avatar screen)
- Each card: icon + mode title + 1-line description
- No mention of "voice", "external import", "no credit card", "set up in 2 minutes"
- Framer Motion transitions between steps — keep existing animation constants

### Acceptance Criteria
- [ ] Manual creation: project immediately appears in workspace
- [ ] Chat path: `project_create` action appears in Action Centre
- [ ] Transcript path: extracted actions appear in Action Centre within ~15s
- [ ] No false-promise copy visible anywhere in the flow
- [ ] Modal transitions are smooth and consistent with existing design

---

## SESSION 4 — PROJECTWORKSPACE: OVERVIEW + GANTT (LIVE DATA)
**Day 2 — March 26 | Owner: Anton + Fergus | Est: 3h**
**Branch: `feat/s4-workspace-overview-gantt`**
**⚠️ DEP:ANTON-DEV — merge Anton's `dev` branch first**
**⚠️ DEP:SESSION-2 — needs project creation to work**

**Goal:** Remove every `WORKSPACE_DATA` and `ORG_DATA` mock object from
`ProjectWorkspace.tsx`. Wire the Overview and Timeline (Gantt) tabs to live data.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Issues Addressed
- [P1] #10 Gantt: expand/collapse hierarchy + task slide-over on bar click
- Readiness report blocker #1: "active project workspace relies on mock-heavy legacy UI"

### Core Change — Data Hook

Create `apps/web/src/hooks/useProjectData.ts`:
```typescript
export function useProjectData(projectId: string) {
  // Fetches /api/workspace/snapshot?projectId=:id
  // Returns { project, tasks, health, actions, meetings, outcomes, loading, error }
  // Re-fetches every 30s (polling)
}
```
This hook is used by all 6 tabs. Build it once here.

### Overview Tab (live data)
Source: `/api/workspace/snapshot?projectId=:id`
- Project name + description (from `projects` table)
- Health status chip: Green / Yellow / Red / Not Started
- Task breakdown: counts by status (not_started / in_progress / completed / at_risk)
- "Needs attention" section: tasks with `status = 'at_risk'` or past due_date
- Recent activity list: latest entries from `agent_runs` or `audit_logs`

### Gantt / Timeline Tab (live data)
Source: tasks array from snapshot
- Render tasks as horizontal timeline bars using position + width from `start_date` / `due_date`
- Task hierarchy: subtasks indented under parent tasks
- Expand/collapse toggle on parent task rows
- Click a bar → `TaskDetailDrawer` slide-over (component already exists at
  `apps/web/src/app/workspace/projects/[projectId]/TaskDetailDrawer.tsx`)
- Status colour coding: Green = completed, Yellow = at_risk, Red = overdue, Grey = not_started
- If tasks have no dates, render them as a flat list with status chips instead of bars

### Acceptance Criteria
- [ ] `WORKSPACE_DATA` constant is fully removed from `ProjectWorkspace.tsx`
- [ ] `ORG_DATA` constant is fully removed from `ProjectWorkspace.tsx`
- [ ] Overview tab shows real project name, health, and task counts
- [ ] Gantt tab renders real tasks from the API
- [ ] Clicking a task bar opens `TaskDetailDrawer` with live task data
- [ ] `useProjectData` hook is used by the component (not inline fetch calls)

---

## SESSION 5 — PROJECTWORKSPACE: ANALYTICS + DOCUMENTS (LIVE DATA)
**Day 2–3 — March 26–27 | Owner: Anton | Est: 2h**
**Branch: `feat/s5-workspace-analytics-docs`**
**⚠️ DEP:SESSION-4 — useProjectData hook must exist**

**Goal:** Wire Analytics and Documents tabs to live data using the shared `useProjectData` hook.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Issues Addressed
- [P1] #11 Dashboard: stacked charts using Recharts
- [P1] #13 Documents page: live content from meeting_notes and report_snapshots

### Analytics Tab (live data)
Sources: tasks from snapshot + `/api/workspace/reporting/projects/:id/outcomes`

- **Donut chart** (already partially wired): task status breakdown — use Recharts `PieChart`
- **NEW Stacked bar — by working area:** group tasks by `category` or `phase` field,
  show each group as a stacked bar split by status. If tasks have no category, group by
  assignee instead.
- **NEW Stacked bar — by assignee:** group tasks by `assignee_id`, stacked by status.
  Show assignee name/initials on axis.
- Health score if present in outcomes response
- "Generate Report" button: render it as disabled with a `title="Coming soon"` tooltip.
  Do not remove the button — it stays visible but inert.

### Documents Tab (live data)
Sources:
- `GET /api/workspace/meeting-notes?projectId=:id` (or from snapshot)
- `GET /api/workspace/reporting/projects/:id/weekly-summary`

- List of **meeting note cards**: title, date, attendee count, 2-line summary preview
  → click to expand full notes
- List of **report snapshot cards**: "Weekly summary — [date]", preview line
  → click to expand
- "Upload transcript" button → opens the transcript intake from `StartProjectFlow`
  Mode 3 inline (not the full modal)
- Polished empty state if no documents yet: Larry avatar + "No documents yet —
  paste a meeting transcript to get started."

### Acceptance Criteria
- [ ] Analytics tab: donut chart + 2 stacked bars render with real task data
- [ ] "Generate Report" button is visible but disabled with "Coming soon" tooltip
- [ ] Documents tab: lists real meeting notes and report snapshots
- [ ] Documents tab: "Upload transcript" triggers extraction
- [ ] Empty states are polished, not raw text

---

## SESSION 6 — PROJECTWORKSPACE: MEETINGS + ORG CHART (LIVE DATA)
**Day 3 — March 27 | Owner: Anton | Est: 2h**
**Branch: `feat/s6-workspace-meetings-orgchart`**
**⚠️ DEP:SESSION-4 — useProjectData hook must exist**

**Goal:** Wire Meetings and Org Chart tabs to live data. These are the last two mock tabs.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Meetings Tab (live data)
Source: `meeting_notes` for this project (via snapshot or dedicated endpoint)

- Chronological list of meetings: title, date, attendee chips, summary preview
- Click row → expand full meeting notes + AI summary
- "Larry extracted [N] actions from this meeting" badge → click filters Action Centre
  to show only actions from that `agent_run_id`
- Inline "Upload transcript" button at the top of the list

### Org Chart Tab (live data)
Source: project members via tasks `assignee_id` + `memberships` table

For MVP, this does **not** need to be a complex hierarchical org tree.
Render as a clean grid of **assignee cards**:
- Avatar (initials in brand-colour circle)
- Full name + role (from `memberships`)
- Tasks assigned: X total, Y completed
- Current task: most recent in-progress task title

If no members are assigned to any task: show "No team members assigned yet" empty state.

### API needs (add if missing)
- `GET /api/workspace/projects/:id/members` — returns `[{ userId, name, role, taskCount, completedCount, currentTask }]`
  Built from a JOIN across `tasks` + `memberships` + `users`.

### Acceptance Criteria
- [ ] Meetings tab: lists real meeting notes for this project
- [ ] Click meeting row → full notes visible, action count badge shows
- [ ] Org Chart tab: shows real assignees with task stats (or clean empty state)
- [ ] Zero mock meeting or org data remains in `ProjectWorkspace.tsx`

---

## SESSION 7 — ACTION CENTRE: SOURCE CONTEXT CARDS + UX POLISH
**Day 3 — March 27 | Owner: Anton + Fergus | Est: 2h**
**Branch: `feat/s7-action-centre-source-cards`**

**Goal:** Add source context cards to every action in the Action Centre, surfacing the
"what / why / signals / override" transparency principles that define Larry's trust model.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Issues Addressed
- [P1] #7 Action Centre: source context cards

### Backend — ensure source data is available
`apps/api/src/routes/v1/actions.ts` — `GET /actions` and `GET /actions/:id` must return:
```typescript
{
  id, actionType, state, payload, confidence, reasoning,
  source: {
    type: "slack" | "transcript" | "calendar" | "larry_chat",
    excerpt: string,      // e.g. first 200 chars of the Slack message
    timestamp: string,
    channelOrTitle: string
  }
}
```
Source data comes from `agent_run_details` JOIN on `agent_runs`. Add to the query if missing.

### Frontend — Source Context Card Component
New component: `apps/web/src/app/workspace/actions/SourceContextCard.tsx`

Renders inside each action card:
- **What happened:** action title in bold (e.g. "Update task: Deploy backend by Friday")
- **Why:** reasoning string from agent run (1–3 sentences, collapsible if long)
- **Signals:** the raw source excerpt in a subtle code/quote block with source label
  (e.g. "From Slack #dev-updates · 2 hours ago")
- **Override:** `Reject` button always visible, `Edit payload` toggle if action is editable

### Action Type Rendering (for demo completeness)
Ensure these render correctly in the Action Centre:
- `project_create` — shows project name + task count preview
- `task_update` — shows task title + old status → new status arrow
- `email_draft` — shows full editable draft inline (textarea, not read-only)
- `follow_up` — shows recipient + message preview
- `meeting_invite` — shows meeting title, proposed time, attendees

### Acceptance Criteria
- [ ] Every action card shows what / why / signals / override
- [ ] `email_draft` actions: draft text is editable inline before approval
- [ ] `meeting_invite` actions: time + attendees visible
- [ ] Source excerpt shows where the action came from
- [ ] Approve / Reject / Edit all update DB state correctly

---

## SESSION 8 — SLACK → TASKS END-TO-END VALIDATION
**Day 3 — March 27 | Owner: Joel + Fergus | Est: 2h**
**Branch: `feat/s8-slack-e2e-validation`**

**Goal:** Validate and fix the full Slack → event → agent run → Action Centre →
approve → task updated flow so it works reliably in production for the demo.

### Issues Addressed
- [P1] #17 Notification delivery — Slack DM on action approval
- Readiness report: "validate a full live Slack workflow in dev/staging"

### Validation Steps (run against production or ngrok local)
1. Send a Slack message in the connected workspace referencing a task or project update
2. Verify `POST /api/v1/connectors/slack/events` receives the event (check Railway logs)
3. Verify Slack signature validation passes (not 401)
4. Verify BullMQ job is enqueued (check Redis queue)
5. Worker picks up → OpenAI extraction → `extracted_actions` row inserted as `pending`
6. Action appears in Action Centre (`GET /api/v1/actions`)
7. Approve → task status updates in DB
8. Verify action state changes to `executed`

### Fix list (only touch files where the above fails)
- `apps/api/src/routes/v1/connectors-slack.ts` — event ingestion + signature
- `apps/worker/src/worker.ts` — job processor + extraction
- `apps/api/src/routes/v1/actions.ts` — `task_update` execution path (update task in DB)

### Slack DM on approval (notification)
The commit `da897ec` partially wired Slack notifications on approval.
Verify:
- When a `task_update` or `follow_up` action is approved, a Slack DM fires to the
  assignee if they have a `slack_user_id` in the `users` table
- If not wired: add a post-approval hook in `actions.ts` that calls `postSlackMessage`

### Acceptance Criteria
- [ ] Real Slack message → pending action in Action Centre within 60s
- [ ] Approve task update → task status changes in the workspace view
- [ ] Slack DM fires to assignee on approval (or is queued)
- [ ] No silent failures — errors are logged clearly in Railway worker logs

---

## SESSION 9 — GOOGLE CALENDAR END-TO-END VALIDATION
**Day 3 — March 27 | Owner: Joel | Est: 1.5h**
**Branch: `feat/s9-calendar-e2e-validation`**

**Goal:** Verify the calendar renewal fix from Session 1 works in practice and validate
the full calendar watch → event → action pipeline for the demo.

### Issues Addressed
- Readiness report blocker #5: Calendar renewal breaks webhook auth after renewal

### Validation Steps
1. Connect Google Calendar in workspace settings
2. Confirm watch registration: `webhook_channel_id` and `webhook_expiration` stored in DB
3. Create a calendar event in the connected Google Calendar
4. Verify webhook fires to `POST /api/v1/connectors/google-calendar/webhook`
5. Verify `x-goog-channel-token` is validated (not rejected)
6. Verify event → `canonical_events` row → agent run → action in Action Centre
7. **Manually trigger renewal job** (add a test endpoint or call directly):
   confirm renewed channel still passes webhook auth

### Files to Fix If Needed
- `apps/worker/src/calendar-renewal.ts` — `channelToken` in renewal (should be done in Session 1)
- `apps/api/src/routes/v1/connectors-google-calendar.ts` — webhook handler

### Acceptance Criteria
- [ ] Calendar connects, watch channel is registered
- [ ] Calendar event → action appears in Action Centre
- [ ] Renewal job fires without breaking webhook auth
- [ ] `channelToken` present in both initial watch and renewal requests

---

## SESSION 10 — NOTIFICATIONS + LARRY CHAT POLISH
**Day 3 — March 27 | Owner: Anton | Est: 1.5h**
**Branch: `feat/s10-notifications-chat`**

**Goal:** Wire notification dismiss/read, fix the Larry chat polling indicator, and ensure
the notification bell shows a live unread count for the demo.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Issues Addressed
- [P0] #5 Wire Larry polling indicator in chat UI
- [P1] #12 Notification centre: dismiss and mark as read

### Larry Chat Polling Indicator
File: `apps/web/src/app/workspace/useLarryChat.ts`
- While a response is pending (`isLoading = true`): show animated "Larry is thinking…"
  with pulsing dots (3-dot bounce animation)
- While a background agent run is in progress: show subtle "Larry is updating your
  project…" status line below the chat input
- Polling for new actions: already present — verify it doesn't freeze on error

File: `apps/web/src/app/workspace/LarryChat.tsx` (or dashboard equivalent)
- Wire the loading state to the visual indicator
- Keep the existing chat history wiring intact

### Notification Centre
Files:
- `apps/web/src/app/workspace/NotificationBell.tsx`
- Backend: `GET /api/workspace/notifications` + `PATCH /api/workspace/notifications/:id`

Frontend behaviour:
- Bell icon shows red badge with unread count (from `GET /api/workspace/notifications?unread=true`)
- Click bell → dropdown panel with notification list
- Each notification: icon, message, timestamp, "Mark read" button (or click row to mark read)
- "Mark all read" button at top of panel
- Notifications auto-refresh every 30s (same polling interval as project data)

Backend (if endpoint missing):
- `GET /api/workspace/notifications` → list from `notifications` table for this tenant/user
- `PATCH /api/workspace/notifications/:id` → `{ read: true }` updates `read_at`
- `POST /api/workspace/notifications/read-all` → bulk update

### Acceptance Criteria
- [ ] Larry chat shows animated "thinking" indicator while response is loading
- [ ] Notification bell shows live unread count badge
- [ ] Clicking a notification marks it read and clears the badge
- [ ] "Mark all read" works
- [ ] No console errors from polling hooks

---

## SESSION 11 — LANDING PAGE + DASHBOARD VISUAL OVERHAUL
**Day 4 — March 28 | Owner: Anton + Fergus | Est: 3h**
**Branch: `feat/s11-landing-dashboard-ui`**

**Goal:** Make the landing page and workspace dashboard world-class. This is the first
surface pilot customers see. It must be beautiful, unique, and trust-building.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**
**⚠️ This is the highest-impact visual session. Take the time to get it right.**

### Design Direction
- **Inspiration:** ossus.librarlabs.com, Stripe Sessions — effects-heavy but not noisy
- **Palette:** white/light background, `#8B5CF6` purple accent, subtle gradients
- **Motion:** Framer Motion — entrance animations, scroll reveals, hover micro-interactions
- **Tone:** premium B2B tool — serious, intelligent, tasteful
- **Typography:** tight tracking, large weights for hero copy

### Landing Page
Files: `apps/web/src/app/page.tsx` and any imported landing sections

**Must have:**
- Hero section: "The autonomous execution layer for project management."
  Subheading: "Turn meetings, Slack, and calendar into tracked, approved action."
  Full-bleed, animated background (subtle grid or gradient mesh)
  Primary CTA: "Request Access" → smooth scroll to invite request form
  Secondary CTA: "See it in action" → video embed placeholder or screenshot carousel
- Stats bar: 70% of projects fail · $101M wasted per $1B · 20h/week lost to coordination
- How it works: 3 steps — Connect your tools → Larry extracts actions → You approve
- Features strip: Slack ingestion, Meeting transcripts, Action Centre, Google Calendar
- Connector logos: Slack, Google Calendar (greyed out = Email "coming soon")
- Footer: minimal — logo, copyright, "Request access" link

**Must remove:**
- "No credit card needed"
- "Set up in under 2 minutes"
- Any claim of voice input, external import, or PDF export

**Invite request form** (links to `POST /api/v1/orgs/request` from Session 2):
- Org name, contact email, description of use case
- Submit → success message: "We'll review your request and be in touch."

### Workspace Dashboard
Files: `apps/web/src/app/workspace/page.tsx`, `WorkspaceHome.tsx`, `WorkspaceShell.tsx`

**Must have:**
- Large, confident welcome: "Good morning, [name]. Here's what needs your attention."
- Prominent "New Project" button — opens `StartProjectFlow` (Session 3)
- Projects grid: real project cards from snapshot API — name, health chip, progress %, last updated
- "Action Centre" summary strip: "[N] actions need your review" → link to `/workspace/actions`
- Larry chat floating button bottom-right (already present — ensure it's polished)
- Notification bell top-right with unread badge (Session 10)

**Visual polish:**
- Cards use subtle glassmorphism or soft shadows — not flat grey boxes
- Health chips use the Green/Yellow/Red colour coding throughout
- Skeleton loading states while data fetches (not blank screen)
- Empty state: "No projects yet — create your first one" with large CTA

### Acceptance Criteria
- [ ] Landing page: first impression is world-class — no placeholder or boilerplate copy
- [ ] Invite request form submits to the real API endpoint
- [ ] Email "Connect" button: visible but disabled, labelled "Coming soon"
- [ ] Dashboard: "New Project" is prominent, opens 3-mode flow
- [ ] Dashboard: real project cards with health status
- [ ] Dashboard: Action Centre count strip shows live count
- [ ] No "No credit card needed", "Set up in 2 minutes", voice/PDF/external-import claims
- [ ] Page feels premium and unique — not like a generic SaaS template

---

## SESSION 12 — INTERCHANGEABLE AI MODEL CONFIG
**Day 3–4 | Owner: Joel | Est: 1h**
**Branch: `feat/s12-ai-model-config`**

**Goal:** Make the AI model swappable via env vars without code changes — so the team
can switch between OpenAI / Anthropic / Gemini for cost or quality reasons.

### Issues Addressed
- [P2] #30 Interchangeable AI model config (MODEL_PROVIDER env var)

### Files to Touch
- `packages/config/src/index.ts` — add `MODEL_PROVIDER` + `AI_MODEL` to env schema
- `packages/ai/src/index.ts` — route request to correct API based on `MODEL_PROVIDER`
- `apps/api/.env.example` + `apps/worker/.env.example` — document the new vars
- `DEPLOYMENT.md` — add `MODEL_PROVIDER` and `AI_MODEL` to Railway env var table

### Implementation
```typescript
// packages/config/src/index.ts
MODEL_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).default("openai"),
AI_MODEL: z.string().default("gpt-4o-mini"),
```

```typescript
// packages/ai/src/index.ts
switch (config.MODEL_PROVIDER) {
  case "openai":    return callOpenAI(prompt, config.AI_MODEL);
  case "anthropic": return callAnthropic(prompt, config.AI_MODEL);
  case "gemini":    return callGemini(prompt, config.AI_MODEL);
}
```

### Acceptance Criteria
- [ ] Default (`MODEL_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`) still works
- [ ] `MODEL_PROVIDER=anthropic` + `AI_MODEL=claude-3-5-sonnet-20241022` routes correctly
- [ ] `.env.example` files document the new vars with comments

---

## SESSION 13 — E2E HAPPY PATH TEST + FRONTEND CI
**Day 4 — March 28 | Owner: Fergus + Joel | Est: 1.5h**
**Branch: `feat/s13-e2e-and-ci`**

**Goal:** Add the one E2E happy-path test and a frontend CI job so the pipeline catches
broken customer journeys before they reach production.

### Issues Addressed
- Readiness report: "test coverage and CI are too thin for launch confidence"

### Happy Path E2E Test
File: `apps/api/src/tests/e2e-happy-path.test.ts`

**Scenario — Transcript → Project Created:**
```
1. Seed a test tenant + user
2. POST /api/v1/larry with a project description message
3. Poll GET /api/v1/actions until a project_create action is pending (timeout: 30s)
4. POST /api/v1/actions/:id/approve
5. GET /api/workspace/projects → assert new project exists with name from step 2
6. Assert agent run state is VERIFIED
```

This test covers: larry ingestion → worker extraction → action creation →
approval execution → project materialised.

### Frontend CI Job
File: `.github/workflows/frontend-ci.yml`
```yaml
name: Frontend CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run web:build
      - run: npx tsc --noEmit -p apps/web/tsconfig.json
```

### Acceptance Criteria
- [ ] E2E happy path test passes locally and in CI
- [ ] Frontend CI job runs on every PR and passes
- [ ] Existing backend CI (`backend-ci.yml`) still passes

---

## SESSION 14 — FINAL DEPLOY, SMOKE TEST & DEMO PREP
**Day 4 — March 28 | Owner: Fergus | Est: 1h**
**Branch: directly on master (final deploy checklist — no new code)**

**Goal:** All branches merged. Production verified. Demo data seeded. Secrets rotated.
Larry is ready to show to a pilot customer.

### Pre-Deploy Checklist
- [ ] All session branches merged to `master` and PRs closed
- [ ] Railway auto-deploys API + Worker on push to `master` — verify both services healthy
- [ ] Vercel auto-deploys frontend — verify `larry-pm.com` loads correctly
- [ ] `GET /api/health` returns `{ ok: true }` only — no config leakage

### Secret Rotation
- [ ] Rotate `JWT_ACCESS_SECRET` in Railway (new 32+ char random string)
- [ ] Rotate `JWT_REFRESH_SECRET` in Railway (different new string)
- [ ] Rotate `SESSION_SECRET` in Vercel (new 32+ char random string)
- [ ] Confirm `DEV_SESSION_SECRET` fallback does NOT fire in production
  (verify `SESSION_SECRET` env var is set in Vercel)

### Demo Data Seed
- [ ] Run `cd packages/db && npx tsx src/seed.ts` against production DB (if seed is safe to re-run)
- [ ] Seed a demo project: "Acme Corp — Q2 Launch" with realistic tasks, phases, assignees
- [ ] Add sample meeting notes + a Slack-extracted action to the demo project
- [ ] Verify demo user `sarah@larry.local` / `DevPass123!` can sign in at `larry-pm.com`

### Smoke Test (run through the demo story)
- [ ] Sign in → dashboard loads with demo project
- [ ] Open demo project → all 6 tabs load with real data
- [ ] Paste a short transcript → actions appear in Action Centre within 15s
- [ ] Approve an action → project updates visibly
- [ ] Action Centre shows source context cards (what / why / signals)
- [ ] Notification bell shows badge, dismiss works
- [ ] Email "Connect" shows "Coming soon" (not functional, not removed)
- [ ] No console errors on any core screen

### Launch Runbook (add to DEPLOYMENT.md)
```
Deploy:     git push origin master → Railway + Vercel auto-deploy
Rollback:   Railway → Deployments → previous → Rollback
            Vercel → Deployments → previous → Promote to Production
Seed:       cd packages/db && npx tsx src/seed.ts
Add user:   POST /api/v1/admin/orgs/request → approve via admin endpoint
Rotate key: Railway → Variables → update JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
            Vercel → Settings → Env Vars → update SESSION_SECRET
Inspect:    Railway logs → filter service "diplomatic-vitality" for worker errors
```

### Acceptance Criteria
- [ ] All 14 sessions complete and branches merged
- [ ] Production smoke test passes all items above
- [ ] Secrets rotated
- [ ] Demo data is live and realistic
- [ ] Larry is ready to demo to a paying pilot customer

---

## DEFERRED BACKLOG (post-launch)

Do not build these in this sprint. Reference them by issue number when resuming.

| Issue | Title | Priority |
|-------|-------|----------|
| #14 | Real Gmail OAuth connector | P1 |
| #15 | Email response monitoring loop | P1 |
| #16 | Dependency completion notification | P1 |
| #17 | Notification delivery — full end-to-end | P1 |
| #18 | Risk scoring: owner behaviour signals | P1 |
| #19 | Manager escalation hierarchy | P1 |
| #23 | Generate report: PDF download button | P2 |
| #25 | Task comment thread UI | P2 |
| #26 | Voice input (beyond placeholder) | P2 |
| #27 | Mobile/responsive layout | P2 |
| #28 | Existing project import flow | P2 |
| #29 | PDF report generation endpoint | P2 |
| #31 | Audit log coverage check | P2 |

---

*Sprint plan generated: 2026-03-25*
*Deadline: 2026-03-28*
*Sessions: 14 (1–14)*
*Author: Fergus + Claude Code*
