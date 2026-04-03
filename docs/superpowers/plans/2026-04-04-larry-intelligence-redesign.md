# Larry Intelligence Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Larry from a single-shot JSON generator into a reasoning-first, project-expert AI that coordinates AND executes work.

**Architecture:** 6-phase rollout. Phase 1 (DB + types) unblocks all others. Phase 2 (prompt rewrite) is the brain transplant. Phase 3 (executor) adds task self-completion. Phases 4-6 refine chat, monitoring, and briefing. Each phase produces working software.

**Tech Stack:** TypeScript, Fastify v5, Next.js 16, PostgreSQL 16, Zod validation, OpenAI/Anthropic/Gemini LLM APIs.

**Spec:** `docs/superpowers/specs/2026-04-04-larry-intelligence-redesign.md`

---

## Task 1: Database Migrations — Project Context + Task Executor Fields

**Files:**
- Create: `packages/db/src/migrations/012_larry_context.sql`
- Create: `packages/db/src/migrations/013_task_larry_completion.sql`
- Modify: `packages/db/src/schema.sql`

- [ ] **Step 1: Create project context migration**

Create `packages/db/src/migrations/012_larry_context.sql`:

```sql
-- Larry project context: persistent per-project knowledge file
ALTER TABLE projects ADD COLUMN IF NOT EXISTS larry_context TEXT;

COMMENT ON COLUMN projects.larry_context IS
  'Markdown context file Larry maintains — project understanding, patterns, decisions, risks';
```

- [ ] **Step 2: Create task executor fields migration**

Create `packages/db/src/migrations/013_task_larry_completion.sql`:

```sql
-- Larry as executor: tasks Larry completes himself
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to_larry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by_larry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS larry_document_id UUID REFERENCES larry_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_larry_assigned ON tasks(project_id) WHERE assigned_to_larry = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_larry_completed ON tasks(project_id) WHERE completed_by_larry = TRUE;
```

- [ ] **Step 3: Update schema.sql with new columns**

Add `larry_context TEXT` to the projects table definition (after `updated_at`, around line 130).
Add `assigned_to_larry`, `completed_by_larry`, `larry_document_id` to the tasks table definition (after `updated_at`, around line 225).

- [ ] **Step 4: Run migrations**

```bash
cat packages/db/src/migrations/012_larry_context.sql | docker exec -i larry-postgres psql -U postgres -d larry
cat packages/db/src/migrations/013_task_larry_completion.sql | docker exec -i larry-postgres psql -U postgres -d larry
```

- [ ] **Step 5: Verify**

```bash
docker exec larry-postgres psql -U postgres -d larry -c "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='larry_context'"
docker exec larry-postgres psql -U postgres -d larry -c "SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name IN ('assigned_to_larry','completed_by_larry','larry_document_id')"
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrations/012_larry_context.sql packages/db/src/migrations/013_task_larry_completion.sql packages/db/src/schema.sql
git commit -m "feat: add larry_context column and task executor fields"
```

---

## Task 2: Shared Types — Update LarryAction, IntelligenceResult, ProjectSnapshot

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add new fields to LarryAction interface**

Find the `LarryAction` interface (around line 156) and replace it:

```typescript
export interface LarryAction {
  type: LarryActionType;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
  selfExecutable?: boolean;
  offerExecution?: boolean;
  executionOutput?: {
    docType: "email_draft" | "letter" | "memo" | "report" | "note" | "other";
    title: string;
    content: string;
    emailRecipient?: string;
    emailSubject?: string;
  } | null;
}
```

- [ ] **Step 2: Add new fields to IntelligenceResult interface**

Find `IntelligenceResult` (around line 165) and replace it:

```typescript
export interface IntelligenceResult {
  thinking?: string;
  briefing: string;
  autoActions: LarryAction[];
  suggestedActions: LarryAction[];
  followUpQuestions?: LarryClarification[];
  contextUpdate?: string | null;
}
```

- [ ] **Step 3: Add larryContext to ProjectSnapshot**

Find `ProjectSnapshot` (around line 319) and add `larryContext` field:

```typescript
export interface ProjectSnapshot {
  project: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    status: string;
    riskScore: number;
    riskLevel: string;
    startDate: string | null;
    targetDate: string | null;
  };
  tasks: ProjectTaskSnapshot[];
  team: ProjectTeamMember[];
  recentActivity: ProjectActivityEntry[];
  signals: ProjectSignal[];
  memoryEntries?: ProjectMemoryEntry[];
  larryContext?: string | null;
  generatedAt: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add executor fields to LarryAction, thinking/contextUpdate to IntelligenceResult, larryContext to ProjectSnapshot"
```

---

## Task 3: Update getProjectSnapshot to Include Larry Context

**Files:**
- Modify: `packages/db/src/larry-snapshot.ts`

- [ ] **Step 1: Add larry_context to the project query**

In `getProjectSnapshot()` (line 72+), find the SQL query that loads the project row. Add `larry_context AS "larryContext"` to the SELECT columns.

- [ ] **Step 2: Pass larryContext through to the returned snapshot**

In the return object assembly, add `larryContext: projectRow.larryContext ?? null` to the snapshot.

- [ ] **Step 3: Export a function to persist context updates**

Add at the bottom of the file:

```typescript
export async function updateProjectLarryContext(
  db: Db,
  tenantId: string,
  projectId: string,
  context: string,
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE projects SET larry_context = $2, updated_at = NOW() WHERE tenant_id = $1 AND id = $3`,
    [tenantId, context, projectId],
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/larry-snapshot.ts
git commit -m "feat: include larry_context in project snapshot and add update function"
```

---

## Task 4: System Prompt Rewrite — Larry's Brain

This is the most critical task. The entire system prompt in `packages/ai/src/intelligence.ts` gets rewritten.

**Files:**
- Modify: `packages/ai/src/intelligence.ts`

- [ ] **Step 1: Update Zod schemas for new response fields**

Find the `LarryActionSchema` (line 52) and `IntelligenceResultSchema` (line 64). Replace both:

```typescript
const LarryActionSchema = z.object({
  type: LarryActionTypeEnum,
  displayText: z.string().min(1).transform((s) => s.slice(0, 500)),
  reasoning: z.string().min(1).transform((s) => s.slice(0, 400)),
  payload: z.record(z.string(), z.unknown()),
  selfExecutable: z.boolean().optional().default(false),
  offerExecution: z.boolean().optional().default(false),
  executionOutput: z
    .object({
      docType: z.enum(["email_draft", "letter", "memo", "report", "note", "other"]),
      title: z.string().min(1),
      content: z.string().min(1),
      emailRecipient: z.string().optional(),
      emailSubject: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const IntelligenceResultSchema = z.object({
  thinking: z.string().optional(),
  briefing: z.string().min(1).transform((s) => s.slice(0, 2000)),
  autoActions: z.array(LarryActionSchema).default([]),
  suggestedActions: z.array(LarryActionSchema).default([]),
  followUpQuestions: z.array(FollowUpQuestionSchema).default([]),
  contextUpdate: z.string().nullable().optional(),
});
```

- [ ] **Step 2: Rewrite buildSystemPrompt()**

Replace the entire `buildSystemPrompt()` function (lines 73-319) with the new prompt. The new prompt follows this structure:

1. **Identity** (who Larry is — direct, opinionated senior PM)
2. **Reasoning framework** (think before acting, always — use the `thinking` field)
3. **Project context** (how to read and update the context file)
4. **Coordinator + Executor role** (5 execution modes, decision matrix, when to do vs delegate)
5. **Action types and payloads** (same 16 types, same payload schemas — no changes here)
6. **Auto-execute vs approval rules** (same rules — no changes)
7. **How Larry talks** (briefing style, push-back behaviour, follow-up questions)
8. **Learning** (corrections, user rules, context updates)
9. **Special modes** (meeting transcripts, login briefings, scheduled scans)
10. **Output format** (JSON schema — last, not first)

The full prompt text is specified in the design spec at `docs/superpowers/specs/2026-04-04-larry-intelligence-redesign.md`, sections 2-4 and section 9. The agent implementing this task MUST read that spec file first.

Key elements that MUST be in the new prompt:
- Larry's identity paragraph (direct, opinionated, project-obsessed)
- The 6-step reasoning framework (context → intent → state → conflict check → completeness → consequences → decision)
- Instructions to use the `thinking` field for reasoning
- Instructions to return `contextUpdate` when Larry learns something new
- The coordinator + executor instructions (selfExecutable, offerExecution, executionOutput)
- The 12 edge case rules from the spec
- Intent classification section (create vs modify vs query vs vague)
- All existing action types and payload schemas (unchanged)
- All existing auto-execute and approval rules (unchanged)

- [ ] **Step 3: Update buildUserPrompt() to include project context**

In `buildUserPrompt()` (line 323), add the larry context injection after the PROJECT section and before TASKS:

```typescript
// After the project description line, add:
...(snapshot.larryContext
  ? [
      "",
      "LARRY'S PROJECT CONTEXT (your accumulated knowledge about this project):",
      snapshot.larryContext,
    ]
  : []),
```

- [ ] **Step 4: Update parseIntelligenceResponse to handle new fields**

The Zod schema update in Step 1 handles this automatically. Verify the `parseIntelligenceResponse` function (around line 517) passes through the new fields.

- [ ] **Step 5: Update runIntelligence to return new fields**

In the `runIntelligence` function (line 789), ensure the returned object includes `thinking` and `contextUpdate` from the parsed result.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/intelligence.ts
git commit -m "feat: rewrite Larry system prompt — identity, reasoning framework, coordinator+executor"
```

---

## Task 5: Executor Logic — Self-Completing Tasks

**Files:**
- Modify: `packages/db/src/larry-executor.ts`

- [ ] **Step 1: Add self-execution handler to runAutoActions**

In `runAutoActions()` (around line 1218), after inserting the `larry_event` record and calling `executeAction()`, add logic to handle `selfExecutable` actions:

```typescript
// After executeAction() succeeds for a self-executable action:
if (action.selfExecutable && action.executionOutput) {
  // Create the larry_document
  const [doc] = await db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO larry_documents (tenant_id, project_id, larry_event_id, title, doc_type, content, email_recipient, email_subject, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
     RETURNING id`,
    [
      tenantId,
      projectId,
      eventId,
      action.executionOutput.title,
      action.executionOutput.docType,
      action.executionOutput.content,
      action.executionOutput.emailRecipient ?? null,
      action.executionOutput.emailSubject ?? null,
    ],
  );

  // If the action created a task, link the document and mark completed by Larry
  if (action.type === "task_create" && entity && typeof entity === "object" && "id" in entity) {
    await db.queryTenant(
      tenantId,
      `UPDATE tasks SET completed_by_larry = TRUE, larry_document_id = $2, status = 'completed', completed_at = NOW(), progress_percent = 100 WHERE tenant_id = $1 AND id = $3`,
      [tenantId, doc.id, (entity as { id: string }).id],
    );
  }
}
```

- [ ] **Step 2: Add self-execution handling to storeSuggestions**

In `storeSuggestions()` (around line 1604), store the `selfExecutable`, `offerExecution`, and `executionOutput` fields in the event's `payload` so the Action Centre can display them:

When building the payload for the `larry_event` INSERT, merge the executor fields:

```typescript
const eventPayload = {
  ...action.payload,
  _selfExecutable: action.selfExecutable ?? false,
  _offerExecution: action.offerExecution ?? false,
  _executionOutput: action.executionOutput ?? null,
};
```

- [ ] **Step 3: Add "Let Larry do it" endpoint**

In `apps/api/src/routes/v1/larry.ts`, add a new route `POST /events/:id/let-larry-execute`. This endpoint:
1. Loads the event
2. Checks it has `_executionOutput` in its payload
3. Creates the `larry_document` from the output
4. If the event was a `task_create`, finds the linked task, sets `completed_by_larry = TRUE`, links the document
5. Marks the event as accepted

- [ ] **Step 4: Add frontend proxy for let-larry-execute**

Create `apps/web/src/app/api/workspace/larry/events/[id]/let-larry-execute/route.ts` following the same proxy pattern as the accept/dismiss/modify routes.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/larry-executor.ts apps/api/src/routes/v1/larry.ts "apps/web/src/app/api/workspace/larry/events/[id]/let-larry-execute/route.ts"
git commit -m "feat: Larry self-execution — create documents, link to tasks, mark complete"
```

---

## Task 6: Context Persistence — Save Larry's Learning

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`
- Modify: `apps/api/src/services/larry-briefing.ts`

- [ ] **Step 1: Persist contextUpdate after chat intelligence runs**

In the chat endpoint (`POST /chat`, around line 1827+), after `runIntelligence()` returns, check for `contextUpdate`:

```typescript
// After const result = await runIntelligence(config, snapshot, hint);
if (result.contextUpdate && projectId) {
  await updateProjectLarryContext(fastify.db, tenantId, projectId, result.contextUpdate);
}
```

Import `updateProjectLarryContext` from `packages/db/src/larry-snapshot.ts` at the top of the file.

- [ ] **Step 2: Persist contextUpdate after briefing intelligence runs**

In `larry-briefing.ts`, in the `generateBriefing()` function (line 108+), after each project's `runIntelligence()` call, persist the context update:

```typescript
if (result.contextUpdate) {
  await updateProjectLarryContext(db, tenantId, project.id, result.contextUpdate);
}
```

- [ ] **Step 3: Persist contextUpdate after scheduled scans**

Find where the worker calls `runIntelligence()` for scheduled scans. Add the same context persistence pattern. Check `apps/worker/src/larry-scan.ts` or similar.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/larry.ts apps/api/src/services/larry-briefing.ts
git commit -m "feat: persist Larry context updates after chat, briefing, and scan intelligence runs"
```

---

## Task 7: Simplify Clarification Engine

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`

- [ ] **Step 1: Strip detectClarificationNeed to thin pre-filter**

Replace the entire `detectClarificationNeed` function (lines 314-422) with a minimal version that only catches truly bare requests:

```typescript
function detectClarificationNeed(input: {
  message: string;
  tasks: Array<{ id: string; title: string }>;
}): { question: string; reason: string } | null {
  const trimmed = input.message.trim();

  // Only catch truly empty or single-word requests that can't possibly
  // contain enough information for the LLM to work with.
  // Everything else goes to Larry's reasoning engine.
  if (trimmed.length < 3) {
    return {
      question: "I'm here. What would you like me to help with?",
      reason: "message_too_short",
    };
  }

  return null;
}
```

The LLM's reasoning framework (Section 2 of the new prompt) now handles:
- Intent classification (create vs modify vs query)
- Ambiguity detection
- Missing detail identification
- Task target resolution

- [ ] **Step 2: Remove unused helper functions**

Remove these functions that are no longer called:
- `requiresTaskTargetClarification` (line 272)
- `findMentionedTaskIds` (line 282)
- `isCollaboratorMutationIntent` (line 260)
- `isNoteMutationIntent` (line 268)

Keep:
- `hasMutationIntent` — still useful for audit logging
- `MUTATING_VERB_PATTERN`, `DATE_HINT_PATTERN` — may be used elsewhere

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/larry.ts
git commit -m "refactor: strip clarification engine to thin pre-filter, let LLM handle intent"
```

---

## Task 8: Action Centre UX — Executor Display Modes

**Files:**
- Modify: `apps/web/src/app/workspace/actions/page.tsx`
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`

- [ ] **Step 1: Add letLarryExecute to the hook**

In `useLarryActionCentre.ts`, add a `letLarryExecute` function alongside accept/dismiss/modify:

```typescript
const letLarryExecute = useCallback(
  async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, { method: "POST" });
      if (response.ok) {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        await Promise.all([load(), onMutate()]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  [load, onMutate],
);
```

Return it from the hook.

- [ ] **Step 2: Update workspace actions page with 3 display modes**

In `actions/page.tsx`, update the event card rendering to detect executor events from the payload:

```typescript
const isCompletedByLarry = event.payload?._selfExecutable === true && event.eventType !== "suggested";
const canLetLarryDoIt = event.payload?._offerExecution === true && event.eventType === "suggested";
const hasDocument = event.payload?._executionOutput != null;
```

For **completed by Larry** events, show:
- "Larry completed" badge (green)
- "View document" link
- Accept / Modify / Dismiss buttons

For **offer execution** events, show:
- "Let Larry do it" button (purple, prominent) alongside Accept / Modify / Dismiss

For regular coordinator events, show existing Accept / Modify / Dismiss.

- [ ] **Step 3: Update project-level action centre tab**

Apply the same 3-mode display to the `ProjectActionCentreTab` component in `ProjectWorkspaceView.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts apps/web/src/app/workspace/actions/page.tsx "apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx"
git commit -m "feat: Action Centre shows Larry-completed, offer-to-execute, and coordinator modes"
```

---

## Task 9: Updated Login Briefing

**Files:**
- Modify: `apps/api/src/services/larry-briefing.ts`

- [ ] **Step 1: Update the hint passed to runIntelligence for briefings**

In `generateBriefing()`, update the hint to instruct Larry to produce a prioritised, specific briefing:

```typescript
const hint = [
  "user logged in",
  "Generate a LOGIN BRIEFING. Lead with what matters most RIGHT NOW.",
  "Prioritise: (1) things that need the user's attention today, (2) risks forming, (3) progress updates.",
  "Be specific — name tasks, people, deadlines. Don't just count tasks.",
  pendingClause,
  guidanceHint,
].filter(Boolean).join("\n");
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/larry-briefing.ts
git commit -m "feat: updated login briefing with prioritised, specific hints"
```

---

## Task 10: TypeScript Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Check packages/ai**

```bash
cd C:/Users/oreil/documents/larry-site && npx tsc --noEmit --project packages/ai/tsconfig.json
```

- [ ] **Step 2: Check packages/shared**

```bash
npx tsc --noEmit --project packages/shared/tsconfig.json
```

- [ ] **Step 3: Check apps/api (ignore pre-existing test/worker errors)**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep "error TS" | grep -v "tests/" | grep -v "worker/"
```

- [ ] **Step 4: Check apps/web (ignore pre-existing test errors)**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep "error TS" | grep -v "tests/"
```

- [ ] **Step 5: Fix any errors found, commit**

---

## Dependency Graph

```
Task 1 (DB migrations) ──────┐
                              ├──→ Task 4 (System Prompt Rewrite)
Task 2 (Shared types) ───────┤
                              ├──→ Task 5 (Executor Logic)
Task 3 (Snapshot update) ─────┤
                              ├──→ Task 6 (Context Persistence)
                              │
                              ├──→ Task 7 (Clarification Simplification)
                              │
                              └──→ Task 8 (Action Centre UX)

Task 9 (Briefing) ← depends on Task 4 (needs new prompt)
Task 10 (Verification) ← depends on ALL tasks
```

**Parallelisable groups:**
- Group A (no dependencies): Tasks 1, 2, 3 — can run simultaneously
- Group B (depends on A): Tasks 4, 5, 6, 7 — Task 4 is critical path, 5-7 can run after 4
- Group C (depends on B): Tasks 8, 9
- Group D (depends on all): Task 10
