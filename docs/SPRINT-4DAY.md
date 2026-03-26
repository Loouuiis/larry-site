# Larry — 4-Day MVP Sprint Plan
# March 25–28, 2026
# Revised: 2026-03-26

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
- Persistent Larry chat history — grouped by project in the Chats sidebar
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
- **Floating Larry chat bubble** — removed entirely in Session 1. Larry is accessed only
  through the Chats sidebar section. The bubble is unwanted and clutters the workspace.

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

---

## UI DESIGN DIRECTION — monday.com inspired

All project workspace UI must be built with this aesthetic in mind.
Reference: monday.com's main table view (dark theme, structured, data-dense but clean).

**Key elements to replicate:**
- **Dark navy background** for the workspace — deep blue-grey (#0D1117 or similar),
  not black. The current sidebar is already dark; extend this to the main content area.
- **Task table layout** — not cards. Tasks live in a proper table:
  columns = Task name | Owner (avatar circle) | Status (full-width colored chip) | Due date
- **Section groups** — tasks grouped by phase or status, each group with a colored
  left-border accent, large section header text, and a collapse chevron
- **Status chips** — pill-shaped, full-color background:
  Not Started = grey | In Progress = blue/amber | Done = green | Blocked = red/coral
- **Owner avatars** — small initials circles (2 letters, brand color background)
- **Row interactions** — click any row → TaskDetailDrawer slide-over from the right
- **Add row** — "+ Add task" as a subtle grey row at the bottom of each group
- **Bottom of page** — "+ Add new group" dashed button
- **Progress strip** — thin colored bar at bottom of each group showing status distribution

**What to keep from Larry's existing design:**
- Purple brand accent (#8B5CF6)
- Framer Motion transitions
- The sidebar structure (already dark, already good)
- Topbar with notification bell and user avatar

**What to remove from Larry's existing design:**
- Floating Larry chat bubble (bottom-right) — gone entirely
- Card-based task layout inside project workspace — replaced by table
- Any mock/placeholder data visible to the user

---

## PARALLEL EXECUTION MAP (revised)

```
Day 2 (Mar 26) — TODAY
  Fergus        ── Session 1 (Remove bubble, fix chat history) [morning]
  Anton         ── Session 2 (StartProjectFlow 3 modes) [morning]
  Fergus + Joel ── Session 3 (project_create execution + no placeholders) [afternoon]

Day 3 (Mar 27)
  Anton         ── Session 4 (monday.com table view for ProjectWorkspace) [all day]
  Joel          ── Session 5 (security fixes + task_update execution) [morning]
  Fergus        ── Session 5 action centre source cards [afternoon]
  Fergus + Anton── Session 6 (landing page + dashboard + org invite) [afternoon]

Day 4 (Mar 28)
  Anton + Fergus── Session 7 (Action Centre UX polish + notifications) [morning]
  Joel + Fergus ── Session 8 (Slack + Calendar E2E validation) [morning]
  Fergus        ── Session 9 (E2E test + CI) [afternoon]
  Fergus        ── Session 10 (Final deploy + demo prep) [late afternoon]
```

---
---
---

## SESSION 1 — REMOVE LARRY BUBBLE + FIX CHAT HISTORY (PROJECT-GROUPED)
**Day 2 — March 26 | Owner: Fergus | Est: 1.5h**
**Branch: `feat/s1-chat-history-no-bubble`**

**Goal:** Remove the floating Larry chat bubble entirely. Rewrite the Chats sidebar section
so it shows a real, persistent conversation history grouped by project — not a flat unordered list.

### Part A — Remove the Floating Larry Bubble

**File: `apps/web/src/app/workspace/WorkspaceShell.tsx` (or wherever the bubble is rendered)**

- Find the floating Larry chat button (bottom-right, fixed position)
- Delete it completely — the component, its imports, its state, its toggle logic
- Larry is accessed exclusively through the `/workspace/chats` sidebar link
- Do not replace it with anything else

**File: `apps/web/src/components/dashboard/LarryChat.tsx` (if this is the bubble component)**
- If this file exists solely to power the bubble, delete it
- If it also powers the Chats page, keep it but strip any floating/fixed positioning

### Part B — Chats Page: Project-Grouped Conversation History

**File: `apps/web/src/app/workspace/chats/page.tsx`**

Current state: unordered list of conversations or placeholder.

**New layout:**
```
Chats
├── Alpha Relaunch Campaign        ← project name header (bold, larger)
│   ├── "Define the campaign scope and KPIs"   (thread title, date, preview)
│   └── "Review task priorities for week 2"
├── Acme Corp — Q2 Launch
│   └── "Extract action items from kickoff call"
└── General                        ← conversations not linked to any project
    └── "What can Larry help with?"
```

**Data source:**
- `GET /api/workspace/larry/conversations` already returns conversations with `projectId`
- Group by `projectId` on the frontend; fetch project names from
  `GET /api/workspace/snapshot` or a lightweight `GET /api/workspace/projects`
- "General" section = conversations where `projectId` is null

**Each conversation row shows:**
- Thread title (first user message, truncated to 60 chars) or a generated name
- Date of last message (relative: "2 hours ago", "Yesterday")
- 1-line preview of the last message content

**Clicking a conversation** → opens that conversation's message thread inline
(use the existing message detail view if one exists, or render messages in a right-side panel)

**New conversation button** → "+ New chat" at top, opens a fresh Larry conversation

### Acceptance Criteria
- [ ] Floating Larry bubble is completely gone from all workspace pages
- [ ] Chats page groups conversations under project name headers
- [ ] "General" section shows conversations not linked to a project
- [ ] Clicking a conversation thread opens the message history
- [ ] "+ New chat" starts a fresh conversation
- [ ] No console errors

---

## SESSION 2 — STARTPROJECTFLOW: 3 REAL MODES PROPERLY WIRED
**Day 2 — March 26 | Owner: Anton + Fergus | Est: 2h**
**Branch: `feat/s2-start-project-flow`**

**Goal:** Rewrite `StartProjectFlow.tsx` so all 3 project-creation modes are real, wired,
and demo-ready. No false-promise copy. No broken paths.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Overview of the 3 modes

The flow is: Step 1 (welcome screen with Larry avatar) → Step 2 (choose a mode) →
Step 3 (mode-specific experience) → completion.

Step 2 presents **3 large card tiles** — no voice, no external import.

---

### Mode 1 — Manual Creation

**Step 3 UI: a clean form**
- Project name (required)
- Description / goal (optional textarea, 3 rows)
- Start date (optional date picker)
- Target end date (optional date picker)
- Team (optional — search existing workspace members, add as chips)

**API call:**
```
POST /api/workspace/projects
{ mode: "manual", name, description, startDate, endDate }
```

**On success:** close modal → navigate to `/workspace/projects/:newProjectId`
New project opens with no placeholder data — just empty sections ready for tasks.

---

### Mode 2 — Chat with Larry (Guided Project Setup)

This is **not** a generic free-form chat. Larry leads the user through a structured
intake conversation to understand the project, then proposes a `project_create` action.

**Larry's guided questions (in sequence — ask one at a time):**
1. "What's the name or goal of this project?"
2. "Who's involved — is this a team project or just you?"
3. "What's the target completion date, or is it ongoing?"
4. "Any key milestones or phases you already have in mind?"
5. "Got it. Want me to draft a project structure based on what you've told me?"

On the final answer → Larry responds: "Great. I've put together a project structure.
Review it in the Action Centre and approve to create the project."

**API calls:**
- Each user reply → `POST /api/workspace/larry/message` (or existing conversation endpoint)
- Larry's structured intake ends with a `project_create` proposed action

**On completion:** close modal → show toast:
> "Your project structure is ready — review it in the Action Centre to create it."
Toast links to `/workspace/actions`.

**UX notes:**
- The chat renders inside the modal at Step 3
- Larry messages appear on the left, user replies on the right
- The "Send" button is the only action — no other controls visible
- Show typing indicator while waiting for Larry's response

---

### Mode 3 — Paste Meeting Transcript

**Step 3 UI:**
- Large textarea: placeholder "Paste your meeting transcript or notes here…"
- Below: drag-and-drop zone for `.txt` or `.docx` files (optional, falls back to textarea)
- "Extract actions" button (disabled until content > 50 chars)

**API call:**
```
POST /api/workspace/ingestion/transcript
{ content: transcriptText, projectId?: string }
```

**While processing:** show spinner with "Larry is reading your transcript…"

**On success:** close modal → show toast:
> "Larry found [N] actions — review them in the Action Centre."
Toast links to `/workspace/actions`.

**On error:** show inline error: "Something went wrong — paste failed. Try again."

---

### Copy Rules (applies to all 3 modes)
- No mention of voice, PDF export, external import, or "set up in 2 minutes"
- No "no credit card needed"
- Mode 2 card title: "Chat with Larry" (not "AI-powered setup")
- Mode 3 card title: "Paste a transcript" (not "Import from meeting")

### Acceptance Criteria
- [ ] Manual: project created in DB, workspace opens with real empty project
- [ ] Chat: Larry asks guided questions one at a time, ends with project_create action pending
- [ ] Transcript: extraction runs, toast shows action count, Action Centre populated
- [ ] No false-promise copy in any step
- [ ] Smooth Framer Motion transitions between steps
- [ ] All 3 modes handle errors gracefully

---

## SESSION 3 — project_create EXECUTION + NO PLACEHOLDER CONTENT
**Day 2 — March 26 | Owner: Joel + Fergus | Est: 2.5h**
**Branch: `feat/s3-project-create-execution`**
**⚠️ DEP:SESSION-2 — StartProjectFlow must exist to trigger project_create actions**

**Goal:** Wire the two most critical missing execution paths. First: approving a
`project_create` action must actually create the project and seed tasks in the DB.
Second: ProjectWorkspace must show zero placeholder content — only real API data.

### Part A — project_create Execution on Approval

**File: `apps/api/src/routes/v1/actions.ts`**

After the existing `task_create` execution block (around line 201), add the `project_create`
handler:

```typescript
if (action.actionType === "project_create") {
  const p = action.payload as {
    name: string;
    description?: string;
    tasks?: Array<{
      title: string;
      description?: string;
      dueDate?: string;
      assignee?: string;
    }>;
  };

  // 1. Insert project
  const [newProject] = await fastify.db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO projects (tenant_id, name, description, status, created_by)
     VALUES ($1, $2, $3, 'active', $4)
     RETURNING id`,
    [tenantId, p.name, p.description ?? "", request.user.userId]
  );

  // 2. Seed starter tasks if Larry extracted any
  if (p.tasks?.length) {
    for (const t of p.tasks) {
      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, due_date)
         VALUES ($1, $2, $3, $4, 'not_started', 'medium', $5)`,
        [tenantId, newProject.id, t.title, t.description ?? "", t.dueDate ?? null]
      );
    }
  }

  // 3. Mark action as executed
  await fastify.db.queryTenant(
    tenantId,
    `UPDATE extracted_actions
     SET state = 'executed', executed_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, params.id]
  );

  // 4. Return projectId so frontend can redirect
  return { success: true, state: "executed", projectId: newProject.id };
}
```

Also add `task_update` execution (currently missing — approving a task_update does nothing):
```typescript
if (action.actionType === "task_update" && action.projectId) {
  const p = action.payload as {
    taskId?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    assigneeUserId?: string;
  };
  if (p.taskId && p.status) {
    await fastify.db.queryTenant(
      tenantId,
      `UPDATE tasks
       SET status = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, p.taskId, p.status]
    );
  }
}
```

### Part B — Org Invite Flow (for landing page CTA)

**New file: `apps/api/src/routes/v1/orgs.ts`**

Three endpoints:
- `POST /api/v1/orgs/request` — public, accepts `{ orgName, contactEmail, description }`,
  inserts into `org_invites` with `status = 'pending'`, returns `{ ok: true }`
- `GET /api/v1/admin/orgs/requests` — protected by `Authorization: Bearer ${ADMIN_SECRET}`,
  returns all pending requests
- `POST /api/v1/admin/orgs/:id/approve` — protected same way, creates tenant + admin user
  with temp password, returns `{ tenantId, tempPassword }`

**New migration:** Add `org_invites` table to `packages/db/src/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);
```

### Part C — Remove All Placeholder Content from ProjectWorkspace

**File: `apps/web/src/components/dashboard/ProjectWorkspace.tsx`**

This is the biggest single technical debt in the frontend. The file contains:
- `WORKSPACE_DATA` — a large hardcoded constant (~line 78)
- `ORG_DATA` — a hardcoded org chart constant (~line 186)

Both must be deleted entirely. Replace with real API calls.

**Create hook: `apps/web/src/hooks/useProjectData.ts`**
```typescript
export function useProjectData(projectId: string) {
  // Fetches /api/workspace/snapshot?projectId=:id
  // Returns { project, tasks, health, actions, meetings, loading, error }
  // Re-fetches every 30s
}
```

Wire this hook into all tabs of ProjectWorkspace. For this session, focus on:
- Overview tab: real project name, description, health status, task counts by status
- The remaining tabs (Gantt, Analytics, Documents, Meetings, Org Chart) can show a clean
  loading/empty state rather than mock data — that's acceptable for now. Session 4 finishes them.

A new project must open to an empty workspace with no seeded fake tasks.
If `tasks.length === 0`, show: "No tasks yet — add your first one below."

### Acceptance Criteria
- [ ] Chat with Larry → describe project → approve project_create → project appears in workspace
- [ ] Approving a task_update action actually changes the task's status in DB
- [ ] `WORKSPACE_DATA` constant is fully gone from `ProjectWorkspace.tsx`
- [ ] `ORG_DATA` constant is fully gone from `ProjectWorkspace.tsx`
- [ ] Overview tab shows real project name and task counts from API
- [ ] New project has zero fake tasks — clean empty state only
- [ ] `POST /api/v1/orgs/request` creates a pending invite record
- [ ] `npm run api:test` passes

---

## SESSION 4 — PROJECT WORKSPACE: monday.com-INSPIRED TABLE VIEW
**Day 3 — March 27 | Owner: Anton | Est: 3h**
**Branch: `feat/s4-workspace-table-view`**
**⚠️ DEP:SESSION-3 — useProjectData hook must exist, WORKSPACE_DATA must be gone**

**Goal:** Transform the project workspace from card/mock UI into a structured,
monday.com-inspired table view. This is the primary workspace surface — it must feel
premium, data-dense, and polished. Reference the monday.com screenshot exactly.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Design Reference

Study the monday.com screenshot carefully before writing a line of code:
- Dark navy main content area (match the sidebar's colour — unify the dark theme)
- Tasks in a proper table, not cards
- Grouped sections with a colored left-border accent + collapse toggle
- Columns: Task name, Owner (avatar), Status (colored full-pill chip), Due date, + icon
- Status badges are the visual anchor of every row — they must be vivid and clear
- "Not Started" = grey | "In Progress" = amber/blue | "Done" = green | "Blocked" = red
- Row hover: subtle highlight, no clutter
- Progress strip at the bottom of each group (coloured segments = status distribution)
- "+ Add task" as the last row in each group, grey, subdued
- "+ Add new group" at the very bottom of the task list

### Files to Change

**`apps/web/src/components/dashboard/ProjectWorkspace.tsx`**
- The Overview tab becomes this table view (not a stats dashboard)
- The tab label can stay "Overview" — the table IS the overview
- Remove any remaining card-based task rendering

**New component: `apps/web/src/components/dashboard/TaskTable.tsx`**
- Pure presentational component
- Props: `{ groups: TaskGroup[], onTaskClick, onAddTask, onAddGroup }`
- `TaskGroup = { label, color, tasks: Task[] }`
- Renders the full table including headers, rows, status chips, add-task row

**New component: `apps/web/src/components/dashboard/StatusChip.tsx`**
- Props: `{ status: TaskStatus }`
- Returns a full-width colored pill with the status label
- Used consistently across the entire app (Action Centre, My Work, etc.)

### Grouping Logic

Default grouping = by status. Groups (in order):
1. **In Progress** — amber left border
2. **Not Started** — grey left border
3. **Blocked** — red left border
4. **Done** — green left border (collapsed by default if > 3 items)

If tasks have a `phase` or `category` field set, offer group-by-phase as an alternative.

### Gantt / Timeline Tab

Keep the Timeline tab. Wire it with real task dates:
- Horizontal bars sized by `start_date` → `due_date`
- Same colour coding as status chips
- If a task has no dates, render it in a "No dates set" section at the bottom
- Click a bar → `TaskDetailDrawer` slide-over

### Acceptance Criteria
- [ ] Project workspace shows a real task table (not cards, not mocks)
- [ ] Tasks grouped by status with colored left-border section headers
- [ ] Each row shows Task name, Owner avatar, Status chip, Due date
- [ ] Status chips are vivid, pill-shaped, consistent
- [ ] Collapse/expand toggles work on each group
- [ ] "Done" group collapsed by default if it contains more than 3 tasks
- [ ] "+ Add task" opens an inline input at the bottom of that group
- [ ] Clicking a task row opens `TaskDetailDrawer`
- [ ] Progress strip at bottom of each group
- [ ] Timeline tab renders real tasks as horizontal bars
- [ ] Dark theme applied to main content area (matches sidebar)

---

## SESSION 5 — SECURITY FIXES + ACTION CENTRE SOURCE CARDS
**Day 3 — March 27 | Owner: Joel + Fergus | Est: 2h**
**Branch: `feat/s5-security-action-centre`**

**Goal:** Fix four production security/correctness bugs from the readiness report,
then add source context cards to every Action Centre item.

### Part A — Security & Correctness Fixes

#### 1. Health endpoint — remove config leakage
`apps/web/src/app/api/health/route.ts`
- Return ONLY `{ ok: true }` on success, `{ ok: false }` on failure
- Remove `url`, `hasToken`, `error: String(err)` from all responses
- Currently leaks `TURSO_DATABASE_URL` publicly — this is a production security bug

#### 2. Escalation dedup — fix the broken ON CONFLICT
`packages/db/src/schema.sql`
- The `notifications` table has NO unique constraint, so the existing
  `ON CONFLICT DO NOTHING` in `escalation.ts` is a no-op — duplicates insert every hour
- Add unique constraint:
  ```sql
  ALTER TABLE notifications
    ADD CONSTRAINT uq_notifications_dedup
    UNIQUE (tenant_id, user_id, channel, subject, DATE(created_at));
  ```
- This constraint targets the same columns used by the escalation insert

`apps/worker/src/escalation.ts`
- Change `ON CONFLICT DO NOTHING` to `ON CONFLICT ON CONSTRAINT uq_notifications_dedup DO NOTHING`

#### 3. Reporting idempotency — no insert on every read
`apps/api/src/routes/v1/reporting.ts`
- Before inserting into `risk_snapshots`, check if a row already exists for
  `(tenant_id, project_id, DATE(NOW()))` — skip insert if so
- Same dedup check for any weekly-summary or report_snapshots inserts

#### 4. Calendar renewal — add channelToken
`apps/worker/src/calendar-renewal.ts`
- `renewWatchChannel()` currently sends `{ id, type, address }` to Google's watch API
- The initial registration in `connectors-google-calendar.ts` sends a signed `token` field
- Add `token` to the renewal body matching what the initial registration sends:
  use `webhook_channel_id` as the token value (or read `webhook_channel_token` column if
  it has been added to the schema)
- Without this, renewed channels fail webhook auth and calendar silently stops after 7 days

### Part B — Action Centre Source Context Cards

**File: `apps/api/src/routes/v1/actions.ts`** — `GET /actions`

Ensure the list response includes source data from the agent run:
```typescript
{
  id, actionType, state, payload, confidence, reasoning,
  source: {
    type: "slack" | "transcript" | "calendar" | "larry_chat",
    excerpt: string,       // first 200 chars of the originating message/event
    timestamp: string,
    channelOrTitle: string // e.g. "#dev-updates" or "Monday standup transcript"
  }
}
```
Join `extracted_actions` → `agent_runs` → `canonical_events` to get the source excerpt.

**New component: `apps/web/src/app/workspace/actions/SourceContextCard.tsx`**

Renders inside each action card:
- **What happened:** action title bold (e.g. "Update task: Deploy backend by Friday")
- **Why:** reasoning string (1–3 sentences, collapsible if long)
- **Source:** the raw excerpt in a quote block with source label
  ("From Slack #dev-updates · 2h ago" or "From transcript: Monday standup · Mar 25")
- **Actions:** Reject always visible | Edit payload toggle if applicable

**Action type rendering — ensure these display correctly:**
- `project_create` — project name + task count preview
- `task_update` — task title + old status → new status arrow
- `email_draft` — editable textarea (not read-only), approve sends draft
- `follow_up` — recipient + message preview
- `meeting_invite` — meeting title, proposed time, attendees

### Acceptance Criteria
- [ ] `GET /api/health` returns `{ ok: true }` only — no URLs, tokens, or error strings
- [ ] Escalation job inserts no duplicate notifications for same task on same day
- [ ] `GET /projects/:id/health` does not insert a duplicate snapshot on the same day
- [ ] Calendar renewal sends the channel token in the watch request
- [ ] Every action card shows what / why / source excerpt
- [ ] `email_draft` actions: draft text is inline-editable before approval
- [ ] `npm run api:test` passes

---

## SESSION 6 — LANDING PAGE + DASHBOARD + ORG INVITE FORM
**Day 3–4 — March 27–28 | Owner: Anton + Fergus | Est: 3h**
**Branch: `feat/s6-landing-dashboard`**
**⚠️ DEP:SESSION-3 — org invite API endpoint must exist**

**Goal:** Make the landing page and workspace dashboard world-class. This is the first
surface a pilot customer sees. It must be beautiful, premium, and trust-building.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Design Direction
- Inspired by ossus.librarlabs.com, Stripe Sessions — effects-heavy but tasteful
- **Palette:** white/light background on landing, `#8B5CF6` purple accent, subtle gradients
- **Motion:** Framer Motion — entrance animations, scroll reveals, hover micro-interactions
- **Tone:** serious, intelligent, premium B2B — not another colourful SaaS startup template

### Landing Page (`apps/web/src/app/page.tsx`)

**Must have:**

Hero section:
- Headline: "The autonomous execution layer for project management."
- Subheadline: "Turn meetings, Slack, and calendar into tracked, approved action."
- Full-bleed animated background (subtle grid mesh or gradient, not busy)
- Primary CTA: "Request Access" → smooth scroll to invite form below
- Secondary CTA: "See it in action" → video embed placeholder or screenshot carousel

Stats bar (3 facts):
- "70% of projects fail to meet their goals"
- "$101M wasted per $1B spent on projects"
- "20h/week lost to manual coordination"

How it works (3 steps):
1. Connect your tools (Slack, Calendar)
2. Larry extracts and proposes actions
3. You review and approve — Larry executes

Features strip (4 pillars):
- Slack ingestion
- Meeting transcript extraction
- Action Centre (approval-gated)
- Google Calendar sync

Connector logos row:
- Slack (active)
- Google Calendar (active)
- Email (greyed out — "Coming soon" label)

Invite request form (links to `POST /api/v1/orgs/request`):
- Fields: Org name, Contact email, Brief description of your use case
- Submit → replace form with: "Thanks — we'll review your request and be in touch."
- Form must actually POST to the real endpoint (not a mailto or stub)

Footer:
- Logo, copyright 2026, "Request access" link, minimal

**Must remove:**
- "No credit card needed"
- "Set up in under 2 minutes"
- Any claim of voice input, external import, or PDF export

### Workspace Dashboard (`apps/web/src/app/workspace/page.tsx`, `WorkspaceHome.tsx`)

**Must have:**
- Welcome header: "Good morning, [name]. Here's what needs your attention."
- Prominent "New Project" button — primary purple, opens StartProjectFlow
- Projects grid: real project cards from snapshot API
  - Each card: project name, health chip (Green/Yellow/Red), progress %, "last updated" label
  - Cards use subtle dark glassmorphism or soft shadow — not flat grey boxes
  - Empty state: "No projects yet — start your first one" with large CTA button
- Action Centre summary strip: "[N] actions need your review" → links to `/workspace/actions`
  - If 0 pending: "You're up to date" in green
- Notification bell top-right with live unread badge (from `GET /api/workspace/notifications`)
- Skeleton loading states while data fetches — no blank screen, no spinner on white

**Must not have:**
- Floating Larry bubble (already removed in Session 1)
- Hardcoded project names or metrics

### Acceptance Criteria
- [ ] Landing page: first impression is world-class — hero, stats, how-it-works, features
- [ ] Invite form posts to real API, shows success message
- [ ] Email "Connect": disabled, labelled "Coming soon"
- [ ] No false-promise copy anywhere on the landing page
- [ ] Dashboard welcome header shows real user's name
- [ ] "New Project" is the most prominent action on the dashboard
- [ ] Project cards show real health status from API
- [ ] Action Centre strip shows real pending count
- [ ] Notification bell badge is live
- [ ] Skeleton loading instead of blank screen
- [ ] Page feels premium — not a generic SaaS template

---

## SESSION 7 — ACTION CENTRE UX POLISH + NOTIFICATIONS
**Day 4 — March 28 | Owner: Anton + Fergus | Est: 1.5h**
**Branch: `feat/s7-action-centre-notifications`**

**Goal:** Polish the Action Centre UX and wire the notification dismiss/read flow.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Action Centre UX

**File: `apps/web/src/app/workspace/actions/page.tsx`**

- Use the new `StatusChip` component from Session 4 throughout
- Filter bar: "All | Pending | Approved | Rejected" tabs — real filtering, not cosmetic
- `project_create` actions must show project name + extracted task count preview
- Empty state: "No pending actions — Larry is watching your workspace."

### Larry Chat Polling Indicator

**File: `apps/web/src/app/workspace/useLarryChat.ts`**
- While response is pending (`isLoading = true`): show animated "Larry is thinking…"
  with 3-dot bounce animation
- Polling for new actions: verify it doesn't freeze on error — add a try/catch fallback

### Notification Centre

**Files: `apps/web/src/app/workspace/NotificationBell.tsx`**

- Bell icon shows red badge with unread count (`GET /api/workspace/notifications?unread=true`)
- Click bell → dropdown panel with notification list
- Each notification: icon, message, timestamp, mark-read on click
- "Mark all read" button at top of panel
- 30s auto-refresh

### Acceptance Criteria
- [ ] Action Centre filter tabs work correctly
- [ ] Larry chat shows animated "thinking" indicator
- [ ] Notification bell shows live unread count badge
- [ ] Clicking a notification marks it read and clears from count
- [ ] "Mark all read" works

---

## SESSION 8 — SLACK + CALENDAR END-TO-END VALIDATION
**Day 4 — March 28 | Owner: Joel + Fergus | Est: 2h**
**Branch: `feat/s8-connectors-e2e`**

**Goal:** Validate the full Slack and Calendar pipelines work reliably in production.
Fix whatever breaks. These are the integration demo pillars.

### Slack Validation Steps
1. Send a Slack message referencing a task or project update in the connected workspace
2. Verify `POST /api/v1/connectors/slack/events` receives the event (Railway logs)
3. Verify Slack signature validation passes (not 401)
4. Verify BullMQ job enqueued → worker processes → `extracted_actions` row inserted as pending
5. Action appears in Action Centre
6. Approve → task status updates in DB (requires Session 3's `task_update` execution fix)
7. Slack DM fires to assignee if `slack_user_id` is in users table

### Calendar Validation Steps
1. Connect Google Calendar in workspace settings
2. Confirm `webhook_channel_id` and `webhook_expiration` stored in DB
3. Create a calendar event → verify webhook fires to calendar webhook endpoint
4. Verify `x-goog-channel-token` is validated
5. Event → canonical_event → agent run → action in Action Centre
6. Manually trigger the renewal job — confirm renewed channel still passes webhook auth

### Fix List (only touch files where validation above fails)
- `apps/api/src/routes/v1/connectors-slack.ts`
- `apps/worker/src/worker.ts`
- `apps/api/src/routes/v1/connectors-google-calendar.ts`
- `apps/worker/src/calendar-renewal.ts` (channelToken should be fixed in Session 5)

### Acceptance Criteria
- [ ] Real Slack message → pending action in Action Centre within 60s
- [ ] Approve task update → task status visibly changes in workspace
- [ ] Slack DM fires to assignee on approval
- [ ] Calendar event → action appears in Action Centre
- [ ] Calendar renewal does not break webhook auth
- [ ] No silent failures — all errors logged in Railway worker logs

---

## SESSION 9 — ANALYTICS + DOCUMENTS + MEETINGS TABS (LIVE DATA)
**Day 4 — March 28 | Owner: Anton | Est: 1.5h**
**Branch: `feat/s9-workspace-analytics-docs`**
**⚠️ DEP:SESSION-4 — useProjectData hook must exist**

**Goal:** Wire the remaining ProjectWorkspace tabs to live data.

**⚠️ FRONTEND RULE: Invoke the `frontend-developer` subagent before touching any UI files.**

### Analytics Tab
- Donut chart: task status breakdown (Recharts PieChart)
- Stacked bar by assignee: group tasks by assignee_id, stacked by status
- Health score if present from `/api/workspace/reporting/projects/:id/outcomes`
- "Generate Report" button: visible but disabled, `title="Coming soon"` tooltip

### Documents Tab
- List of meeting note cards: title, date, 2-line summary preview → click to expand
- List of report snapshot cards: "Weekly summary — [date]" → click to expand
- "Upload transcript" button → opens transcript intake inline
- Empty state: "No documents yet — paste a meeting transcript to get started."

### Meetings Tab
- Chronological list: title, date, attendee chips, summary preview
- Click → expand full notes + AI summary
- "Larry extracted [N] actions from this meeting" badge

### Org Chart Tab
- Clean assignee card grid (not a hierarchical tree)
- Each card: initials avatar, name, role, tasks assigned, current task
- Empty state: "No team members assigned yet"

### Acceptance Criteria
- [ ] Analytics tab: donut + stacked bar render with real data
- [ ] Documents tab: lists real meeting notes and report snapshots
- [ ] Meetings tab: lists real meetings for this project
- [ ] Org Chart: shows real assignees or clean empty state
- [ ] "Generate Report" disabled with tooltip
- [ ] Zero mock data remains in ProjectWorkspace

---

<!-- ✅ SESSION 10 — COMPLETE (2026-03-25)
## SESSION 10 (WAS 12) — INTERCHANGEABLE AI MODEL CONFIG
**Status: Done — implemented before sprint started**

MODEL_PROVIDER env var in packages/config/src/index.ts.
Full OpenAI / Anthropic / Gemini provider switching in packages/ai/src/index.ts.
Commit: "Add ability to switch between ai providers"
-->

---

## SESSION 11 — E2E HAPPY PATH TEST + FRONTEND CI
**Day 4 — March 28 | Owner: Fergus + Joel | Est: 1.5h**
**Branch: `feat/s11-e2e-and-ci`**

**Goal:** Add the one E2E happy-path test and a frontend CI job.

### Happy Path E2E Test
File: `apps/api/src/tests/e2e-happy-path.test.ts`

**Scenario — Transcript → Project Created:**
```
1. Seed test tenant + user
2. POST /api/v1/larry with a project description message
3. Poll GET /api/v1/actions until project_create action is pending (timeout: 30s)
4. POST /api/v1/actions/:id/approve
5. GET /api/workspace/projects → assert new project exists
6. Assert agent run state is VERIFIED
```

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
- [ ] Existing backend CI still passes

---

## SESSION 12 — FINAL DEPLOY, SMOKE TEST & DEMO PREP
**Day 4 — March 28 | Owner: Fergus | Est: 1h**
**Branch: directly on master (final deploy checklist — no new code)**

**Goal:** All branches merged. Production verified. Demo data seeded. Secrets rotated.

### Pre-Deploy Checklist
- [ ] All session branches merged to `master` and PRs closed
- [ ] Railway auto-deploys API + Worker — verify both services healthy
- [ ] Vercel auto-deploys frontend — verify `larry-pm.com` loads correctly
- [ ] `GET /api/health` returns `{ ok: true }` only

### Secret Rotation
- [ ] Rotate `JWT_ACCESS_SECRET` in Railway (new 32+ char random string)
- [ ] Rotate `JWT_REFRESH_SECRET` in Railway (different new string)
- [ ] Rotate `SESSION_SECRET` in Vercel
- [ ] Confirm `DEV_SESSION_SECRET` fallback does NOT fire in production

### Demo Data Seed
- [ ] Run seed script against production DB
- [ ] Seed a demo project: "Acme Corp — Q2 Launch" with realistic tasks, phases, assignees
- [ ] Add sample meeting notes + a Slack-extracted action to the demo project
- [ ] Verify `sarah@larry.local` / `DevPass123!` can sign in at `larry-pm.com`

### Smoke Test (run through the demo story)
- [ ] Sign in → dashboard loads with demo project, no floating bubble visible
- [ ] Chats sidebar: conversations grouped under project headers
- [ ] "New Project" opens StartProjectFlow with 3 real modes
- [ ] Paste transcript → actions appear in Action Centre within 15s
- [ ] Approve project_create → project appears with real task table
- [ ] Task table: grouped sections, status chips, no mock data
- [ ] Action Centre: source context cards visible on each action
- [ ] Approve task update → status changes visibly in the table
- [ ] Notification bell shows badge, dismiss works
- [ ] `GET /api/health` returns `{ ok: true }` only — no config strings
- [ ] Email "Connect" shows "Coming soon" (disabled)
- [ ] Landing page invite form submits and shows success message
- [ ] No console errors on any core screen

### Launch Runbook (add to DEPLOYMENT.md)
```
Deploy:     git push origin master → Railway + Vercel auto-deploy
Rollback:   Railway → Deployments → previous → Rollback
            Vercel → Deployments → previous → Promote to Production
Seed:       cd packages/db && npx tsx src/seed.ts
Add user:   POST /api/v1/orgs/request → approve via admin endpoint
Rotate key: Railway → Variables → update JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
            Vercel → Settings → Env Vars → update SESSION_SECRET
Inspect:    Railway logs → filter service "diplomatic-vitality" for worker errors
```

### Acceptance Criteria
- [ ] All 12 sessions complete and branches merged
- [ ] Production smoke test passes all items above
- [ ] Secrets rotated
- [ ] Demo data is live and realistic
- [ ] Larry is ready to demo to a paying pilot customer

---

## DEFERRED BACKLOG (post-launch)

Do not build these in this sprint.

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

*Sprint plan revised: 2026-03-26*
*Deadline: 2026-03-28*
*Sessions: 12 (10 remaining + S10 already complete)*
*Author: Fergus + Claude Code*
