# Larry Intelligence Plan
# The Autonomous Execution Engine

---

## Three Confirmations Before We Build

### 1. No Placeholders. Zero.
Every layer of this system touches real infrastructure:
- Every chat message calls the real LLM API (OpenAI gpt-4o-mini or Anthropic claude-sonnet)
- Every action the LLM proposes writes a real row to Postgres
- Every auto-executed action mutates real project/task state in the database
- Every briefing is generated fresh by the LLM on login — never cached copy
- The only exception: `MockLlmProvider` stays for local dev when no API key is present, and it is explicitly dev-only, never used in a demo or production environment

If an API key is missing at demo time, the system fails loudly — not silently with fake data.

### 2. This Is a Restructure, Not a Feature Addition
We are not building on top of what exists. We are replacing the execution pipeline end-to-end. Existing code that conflicts with this plan gets deleted, not wrapped. The database schema gets new tables and we drop the ones replaced. The worker loses the agent lifecycle processor for chat. The frontend stops pointing at the old action endpoints.

What stays is what we explicitly decide to keep. Everything else is up for removal.

### 3. Actions Are Inline, Not in a Separate Center
Actions are not a separate page that users navigate to. They are highlights on the project they belong to. When Larry creates a task, it appears in the project. When Larry suggests a deadline change, it surfaces as a callout on that project row. The old Action Center page becomes a secondary history view, not the primary interaction surface.

---

## What Larry Is After This Plan

Larry is a project-aware autonomous agent that lives inside each project and thinks about it continuously.

Three things that must be undeniably true:

**1. You open a project and Larry has already done things.**
Updated risk scores, flagged a blocked task, added a task it extracted from a Slack thread. Not because you asked. Because it runs on a schedule and acts.

**2. You log in and Larry briefs you.**
"Since Tuesday: I moved the auth module to At Risk — 6 days inactive with Friday deadline. I added 3 tasks from your Slack thread. One thing needs your call: Anton wants to push scope by 2 weeks." Plain English. Specific. Actionable.

**3. You type something in chat and Larry acts.**
Not "I've queued your request." Not "Action added to review." But: "Done — I've added the security review task assigned to Joel, deadline 3 days before launch, and flagged it as a dependency on auth." The task is already in the Gantt.

---

## Architecture: Three Services

### `LarryIntelligence` — The Brain (`packages/ai/src/intelligence.ts`)

One function that does one thing: given a complete project snapshot, return what Larry should do.

**Input — `ProjectSnapshot`:**
```typescript
{
  project:   { id, name, description, status, startDate, deadline },
  tasks:     [{ id, title, status, assignee, deadline, progress, dependencies, lastActivityAt }],
  team:      [{ id, name, role, currentTaskCount }],
  recentActivity: [{ type, description, timestamp }],   // last 7 days
  signals:   [{ source, content, timestamp }],          // Slack, calendar, email — optional
  hint:      string | null                              // "user said: X" | "scheduled scan" | "user logged in"
}
```

**Output — `IntelligenceResult`:**
```typescript
{
  briefing:        string,    // plain English — what is happening in this project right now
  autoActions:     Action[],  // execute immediately, no approval needed
  suggestedActions: Action[]  // surface to user as inline highlights, user accepts/dismisses
}
```

**`Action` shape:**
```typescript
{
  type:        ActionType,   // see action types below
  displayText: string,       // "I moved auth module to At Risk"   — past tense if auto-executed
                             // "Move auth module to At Risk"      — imperative if suggested
  reasoning:   string,       // "6 days inactive, deadline Friday" — one sentence max
  payload:     object        // the data the executor needs
}
```

**Auto vs Suggested — the rule:**
The LLM system prompt encodes this directly:
- **Auto-execute:** status updates, risk score recalculation, task creation when explicitly requested via chat, internal reminders, dependency flag updates
- **Suggest (needs user call):** deadline changes, owner reassignment, scope modifications, external emails, project creation from scratch

No policy threshold tables. No confidence scoring system. The LLM applies the rule. If we need to tune it, we tune the system prompt.

**Action types:**
| Type | Auto or Suggested | What it does |
|------|--------------------|--------------|
| `task_create` | Auto (if chat-requested) / Suggested (if inferred) | INSERT into tasks |
| `status_update` | Auto | UPDATE tasks.status + risk_score |
| `risk_flag` | Auto | UPDATE tasks.risk_level + add to larry_events |
| `reminder_send` | Auto | INSERT into notifications |
| `deadline_change` | Suggested | UPDATE tasks.deadline |
| `owner_change` | Suggested | UPDATE tasks.assignee_id |
| `scope_change` | Suggested | UPDATE project or task description |
| `email_draft` | Suggested | INSERT into email_outbound_drafts |
| `project_create` | Suggested | INSERT project + initial tasks |

---

### `LarryExecutor` — The Hands (`apps/api/src/services/larry-executor.ts`)

Takes `IntelligenceResult`, runs the actions, writes to the database.

**For `autoActions`:**
1. Execute the action immediately (real DB write)
2. Insert a `larry_event` row with `event_type = 'auto_executed'`
3. Return what was created/updated

**For `suggestedActions`:**
1. Insert a `larry_event` row with `event_type = 'suggested'`
2. No DB mutation yet — nothing happens until user accepts

**When user accepts a suggestion:**
`POST /v1/larry/events/:id/accept`
1. Load the larry_event
2. Execute the payload (same individual executors as auto)
3. Update event to `event_type = 'accepted'`
4. Return what was created

**When user dismisses:**
`POST /v1/larry/events/:id/dismiss`
1. Update event to `event_type = 'dismissed'`
2. Record why if provided

**Individual action executors (one function each):**
- `executeTaskCreate(projectId, payload)` — INSERT into tasks, return task
- `executeStatusUpdate(taskId, newStatus, reasoning)` — UPDATE task, recalculate risk
- `executeRiskFlag(taskId, level, reasoning)` — UPDATE task risk fields
- `executeReminderSend(userId, taskId, message)` — INSERT notification
- `executeDeadlineChange(taskId, newDeadline)` — UPDATE task deadline
- `executeOwnerChange(taskId, newAssigneeId)` — UPDATE task assignee
- `executeScopeChange(entityId, entityType, description)` — UPDATE description
- `executeEmailDraft(payload)` — INSERT email_outbound_drafts
- `executeProjectCreate(payload)` — INSERT project + seed tasks

Each executor returns the created/updated entity so the caller can confirm what happened.

---

### `LarryBriefing` — The Voice (`apps/api/src/services/larry-briefing.ts`)

Runs on login. Composes the briefing the user sees when they open the app.

**Flow:**
1. Load all active projects for this user
2. For each project: run `getProjectSnapshot()` then `LarryIntelligence.run(snapshot, "user logged in")`
3. Execute all `autoActions` via `LarryExecutor`
4. Collect all `suggestedActions` → store as `larry_events`
5. Compose a single briefing string across all projects
6. Store in `larry_briefings`
7. Return to frontend

**Briefing format (structured):**
```typescript
{
  greeting:   string,    // "Good morning Fergus."
  projects:   [
    {
      projectId:   string,
      name:        string,
      statusLabel: string,   // "At Risk" | "On Track" | "Behind"
      summary:     string,   // "I moved auth to At Risk. Marcus was nudged."
      actionsCount: number,  // how many things Larry auto-did
      needsYou:    boolean,  // true if any suggested actions are pending
      suggestions: SuggestedAction[]
    }
  ],
  totalNeedsYou: number
}
```

This is not a static template. The `greeting` and `summary` fields are LLM-generated. The rest is structured data.

---

## The Four Triggers

Larry's intelligence runs in exactly four situations:

```
TRIGGER 1: SCHEDULE
  → Worker cron: every 4 hours
  → For each active project in each tenant:
      getProjectSnapshot()
      runIntelligence(snapshot, "scheduled scan")
      executeAutoActions()
      storeSuggestions()

TRIGGER 2: LOGIN
  → User hits GET /v1/larry/briefing
  → Check: was a briefing generated in last 4 hours for this user?
  → If yes: return cached briefing (still fresh)
  → If no: run full briefing generation across user's projects
  → Store and return

TRIGGER 3: CHAT
  → User sends POST /v1/larry/chat { projectId, message }
  → getProjectSnapshot(projectId)
  → runIntelligence(snapshot, `user said: "${message}"`)
  → executeAutoActions() immediately
  → storeSuggestions()
  → Return { briefing (LLM response), actionsExecuted, suggestionCount }

TRIGGER 4: SIGNAL
  → Slack message / calendar event / email webhook received
  → getProjectSnapshot(affectedProjectId)
  → runIntelligence(snapshot, `signal: ${signal.source}: "${signal.content}"`)
  → executeAutoActions()
  → storeSuggestions()
```

---

## Data Model

Two new tables replace `extracted_actions`, `agent_runs`, `agent_run_transitions`, `interventions`, and `canonical_events` for the core intelligence loop.

### `larry_events`
```sql
CREATE TABLE larry_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  project_id   UUID NOT NULL REFERENCES projects(id),

  -- What type of lifecycle state this event is in
  event_type   VARCHAR NOT NULL CHECK (event_type IN (
                 'auto_executed', 'suggested', 'accepted', 'dismissed'
               )),

  -- What Larry did or wants to do
  action_type  VARCHAR NOT NULL,
  display_text TEXT NOT NULL,    -- plain English: "I moved auth to At Risk"
  reasoning    TEXT NOT NULL,    -- one sentence: "6 days inactive, deadline Friday"
  payload      JSONB NOT NULL,   -- machine data for execution

  -- Execution
  executed_at  TIMESTAMPTZ,      -- null if suggested, set when executed
  triggered_by VARCHAR NOT NULL, -- 'schedule' | 'login' | 'chat' | 'signal'
  chat_message TEXT,             -- the user's message if triggered by chat

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX larry_events_project_id ON larry_events(project_id);
CREATE INDEX larry_events_tenant_state ON larry_events(tenant_id, event_type);
```

### `larry_briefings`
```sql
CREATE TABLE larry_briefings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  content     JSONB NOT NULL,  -- the structured briefing object
  event_ids   UUID[],          -- which larry_events this briefing references
  seen_at     TIMESTAMPTZ,     -- null until user opens it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX larry_briefings_user ON larry_briefings(user_id, created_at DESC);
```

### What Gets Removed
- `extracted_actions` — replaced by `larry_events`
- `agent_runs` — replaced by `larry_events` (trigger source is a field, not a row)
- `agent_run_transitions` — removed entirely
- `interventions` — removed entirely
- `canonical_events` — removed from the chat path; signal ingestion from Slack/Calendar still uses a lightweight version for audit trail only

---

## API Endpoints

### New endpoints
| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/v1/larry/briefing` | Get or generate login briefing for current user |
| `POST` | `/v1/larry/chat` | Send chat message, get response + actions |
| `GET` | `/v1/larry/events?projectId=&state=` | List larry_events for a project |
| `POST` | `/v1/larry/events/:id/accept` | Accept a suggested action → execute it |
| `POST` | `/v1/larry/events/:id/dismiss` | Dismiss a suggested action |
| `POST` | `/v1/larry/transcript` | Submit meeting transcript → extract actions |

### Removed endpoints (from the old pipeline)
- `POST /v1/agent/runs` — replaced by triggers above
- `GET /v1/agent/actions` — replaced by `GET /v1/larry/events`
- `POST /v1/actions/:id/approve` — replaced by `POST /v1/larry/events/:id/accept`
- `POST /v1/actions/:id/reject` — replaced by `POST /v1/larry/events/:id/dismiss`
- `POST /v1/actions/:id/override` — removed
- `POST /v1/agent/actions/:id/correct` — removed
- `POST /v1/larry/commands` — replaced by `POST /v1/larry/chat`

---

## Implementation Phases

### Phase 1 — `LarryIntelligence` (The Brain)
**Location:** `packages/ai/src/intelligence.ts`

Build the intelligence service from scratch:
1. `getProjectSnapshot(projectId, db)` — assembles the full context object from Postgres
2. `buildSystemPrompt()` — the LLM system prompt, encoding auto vs suggested rules
3. `runIntelligence(snapshot, hint)` — the single LLM call with enforced JSON schema output
4. Schema validation on the output — every field must be present and typed correctly

The JSON schema for the LLM response is the most critical design decision in this phase. It must be tight enough that the executor can trust every field without defensive checks.

Nothing else is built in Phase 1. This is tested by calling it directly with a real project snapshot and confirming the LLM returns valid structured output.

**Definition of done:** Call `runIntelligence()` with a real project that has overdue tasks. LLM returns at least one `autoAction` with `type: 'risk_flag'` and at least one `suggestedAction`. Every field in the response validates against the schema.

---

### Phase 2 — `LarryExecutor` (The Hands)
**Location:** `apps/api/src/services/larry-executor.ts`

Build the executor with the individual action functions:
1. Each action type gets its own function — no switch-case spaghetti
2. Each function writes to the real database and returns the created/updated entity
3. `runAutoActions(projectId, actions[])` — loops over autoActions, calls individual executors, writes larry_events
4. `storeSuggestions(projectId, actions[])` — writes suggested actions to larry_events (no DB mutation)
5. Create the `larry_events` and `larry_briefings` tables via migration

**Definition of done:** Call `runAutoActions()` with a `task_create` action. Task row exists in `tasks` table. `larry_event` row exists with `event_type = 'auto_executed'`. No errors.

---

### Phase 3 — Chat → Intelligence → Execute
**Location:** `apps/api/src/routes/v1/larry.ts` (rewritten)

Replace the entire existing chat command handler:
1. `POST /v1/larry/chat` — single endpoint, replaces `/v1/larry/commands`
2. Calls `getProjectSnapshot()` → `runIntelligence()` → `runAutoActions()` → `storeSuggestions()`
3. Returns `{ message: intelligence.briefing, actionsExecuted: n, suggestionCount: n }`
4. Synchronous. No queue. Sub-3 second response.

Frontend changes: `useLarryChat.ts` updates its send endpoint from `/api/workspace/larry/commands` to `/api/workspace/larry/chat`. Response shape changes to include `actionsExecuted`. That's it.

**Definition of done:** User types "Add a task: design review for the login page" in the chat. Task appears in the project immediately. Chat response confirms it: "Done — I've added 'Design review for login page'." No refresh needed.

---

### Phase 4 — Login Briefing
**Location:** `apps/api/src/services/larry-briefing.ts` + `GET /v1/larry/briefing`

1. `generateBriefing(userId, tenantId)` — runs intelligence for all user's projects, composes briefing
2. `GET /v1/larry/briefing` — returns cached if fresh (< 4 hours), generates otherwise
3. Frontend: on app load, fetch `/api/workspace/larry/briefing`, display in workspace home

**Definition of done:** Log in. Before touching anything, see a briefing that names specific projects and specific things Larry did or is suggesting. Everything in the briefing has a corresponding `larry_event` row in the DB.

---

### Phase 5 — Inline Project Actions
**Location:** `apps/web/src/app/workspace/projects/[projectId]/`

1. `GET /v1/larry/events?projectId=X&state=suggested` — fetch pending suggestions for the project
2. Render inline in the project view as highlighted callouts (not a separate page)
3. Auto-executed actions show as an activity feed: "Larry did: [display_text] — [reasoning]"
4. Suggested actions show as highlighted items: "[display_text]" with Accept / Dismiss
5. Accepting calls `POST /v1/larry/events/:id/accept`, dismissing calls `/:id/dismiss`
6. After accept/dismiss, re-fetch the project snapshot to reflect changes

**Definition of done:** Open a project. See Larry's activity feed in the right rail. See at least one suggestion highlighted inline. Accept it. The project state updates without a full page reload.

---

### Phase 6 — Scheduled Intelligence (Worker)
**Location:** `apps/worker/src/larry-scan.ts`

Add a new recurring job to the worker:
1. `larry.scan` — runs every 4 hours
2. Loads all active projects across all tenants
3. For each: `getProjectSnapshot()` → `runIntelligence()` → `runAutoActions()` → `storeSuggestions()`
4. Remove the old `handleAgentRunIngested` and `processAgentRunLifecycle` from the worker

The worker keeps: escalation scan, calendar renewal.
The worker loses: agent lifecycle processor, canonical event handler.

**Definition of done:** Worker log shows `[larry-scan] Processed 3 projects, executed 2 actions, stored 1 suggestion`. Corresponding `larry_events` rows exist. No old lifecycle jobs running.

---

## What Gets Deleted From the Codebase

When each phase is complete, these files/routes get removed:

**After Phase 3:**
- `apps/api/src/routes/v1/agent.ts` — the entire agent run management route
- `apps/api/src/routes/v1/actions.ts` — the approve/reject/override endpoint file
- `apps/api/src/routes/v1/larry.ts` — rewritten in Phase 3, old version gone

**After Phase 6:**
- `apps/worker/src/lifecycle.ts` — the agent run lifecycle state machine
- `apps/worker/src/handlers.ts` — the old job handlers

**After Phase 2 (migration):**
- `extracted_actions` table — dropped
- `agent_runs` table — dropped
- `agent_run_transitions` table — dropped
- `interventions` table — dropped

**Frontend (after Phase 5):**
- `apps/web/src/app/workspace/actions/ActionCenterPage.tsx` — replaced by inline project events
- `apps/web/src/app/dashboard/useActionCenter.ts` — replaced by `useLarryEvents.ts`
- `apps/web/src/app/api/workspace/actions/` — entire directory removed

---

## The LLM System Prompt (Draft)

This is the single most important file in the system. It encodes Larry's judgment.

```
You are Larry, an autonomous project management agent. You monitor active projects
and take actions to keep them on track.

Given a project snapshot and a context hint, you must return a JSON object with:
- briefing: one paragraph in plain English describing the current project state
- autoActions: actions you will execute immediately without asking
- suggestedActions: actions that need the project owner's approval

RULES FOR AUTO-EXECUTE (you decide, you act):
- Updating task status based on activity or inactivity signals
- Recalculating and updating risk levels
- Creating a task when a user has explicitly asked you to create one
- Sending internal reminders to team members
- Updating dependency flags when upstream tasks complete

RULES FOR SUGGEST (you prepare, human decides):
- Any change to a deadline
- Any change to task ownership or assignee
- Any modification to project scope
- Sending any external email
- Creating a new project
- Any action that affects people outside the current project team

DISPLAY TEXT RULES:
- Auto-executed actions: past tense first person — "I moved auth to At Risk"
- Suggested actions: action-oriented — "Move auth to At Risk"
- Reasoning: one sentence, specific signals — "6 days inactive, deadline Friday"
- Never use jargon. No "confidence scores", no "extracted actions", no "policy gates"
- Write like a smart colleague, not a system log

OUTPUT FORMAT:
Return only valid JSON matching this exact schema. No prose outside the JSON.
```

---

## Non-Negotiables (Carry Into Every Session)

1. **Multi-tenant isolation** — every DB query includes `tenant_id`. No exceptions.
2. **Real data only** — no mock responses, no seeded fake actions in demo flows
3. **LLM errors are surfaced** — if the LLM call fails, return a real error, not a silent fallback with fake data
4. **Every action is attributed** — every `larry_event` records what triggered it (`triggered_by` field)
5. **Plain English always** — `display_text` and `reasoning` are user-facing. No technical terms.
6. **Reversibility** — every auto-executed action can be undone via a compensating action. The executor must support undo for each action type.

---

## Files Removed From This Session

The following planning documents were deleted as they describe the old architecture and old sprint structure, both of which are superseded by this plan:

- `docs/SPRINT-4DAY.md`
- `docs/larry-workspace-expansion-plan-2026-03-27.md`
- `docs/reports/larry-mvp-readiness-2026-03-25.md`
- `docs/WORKSPACE-REDESIGN-PROPOSAL.md`
- `.codex/context.md`
