# Larry Core Reliability — Make Every Feature Work

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every broken connection, bad decision, and silent failure in Larry's AI pipeline so that every feature works end-to-end — no placeholders, no silent errors, no hallucinations.

**Architecture:** Four phases targeting the four tiers of issues: (1) wire intelligence after project creation, (2) fix Larry's decision quality, (3) make actions reliable, (4) complete missing pieces. Each phase produces independently testable improvements.

**Tech Stack:** Fastify v5, Vercel AI SDK v6 (`generateObject`), Zod schemas, Postgres, BullMQ, TypeScript

---

## File Map

| File | Responsibility | Phases |
|------|---------------|--------|
| `apps/api/src/routes/v1/project-intake.ts` | Project creation + bootstrap finalization | 1, 3 |
| `packages/ai/src/index.ts` | Bootstrap task generation prompts | 2 |
| `packages/ai/src/intelligence.ts` | System prompt, intelligence engine, schema | 2, 3 |
| `packages/db/src/larry-snapshot.ts` | Project snapshot for AI context | 2 |
| `packages/db/src/larry-executor.ts` | Action execution, task resolution | 3 |
| `apps/worker/src/worker.ts` | Job scheduling, scan interval | 1, 4 |
| `apps/worker/src/larry-scan.ts` | Scheduled intelligence scan | 4 |
| `apps/worker/src/escalation.ts` | Escalation notification delivery | 4 |
| `packages/ai/knowledge/context-gathering.md` | NEW: When/how to ask for more info | 2 |
| `packages/ai/knowledge/task-decomposition.md` | NEW: Breaking down vague goals | 2 |
| `packages/ai/knowledge/dependency-chains.md` | NEW: Critical path analysis | 2 |

---

## Phase 1: Make Larry Wake Up After Project Creation

### Task 1: Wire intelligence trigger after bootstrap finalization (meeting mode)

**Files:**
- Modify: `apps/api/src/routes/v1/project-intake.ts:1-22` (imports)
- Modify: `apps/api/src/routes/v1/project-intake.ts:891-924` (post-task-creation gap)

**Context:** After the task creation loop on line 891, the code immediately goes to storing non-task suggestions and memory entries. There is NO call to `runIntelligence()`. Larry never analyzes the newly created project.

- [ ] **Step 1: Add imports for intelligence and snapshot**

In `apps/api/src/routes/v1/project-intake.ts`, add to the existing imports:

```typescript
// Add to the @larry/db import (line 3-7):
import {
  executeTaskCreate,
  insertProjectMemoryEntry,
  storeSuggestions,
  getProjectSnapshot,
  runAutoActions,
  updateProjectLarryContext,
} from "@larry/db";

// Add to the @larry/ai import (line 9):
import { generateBootstrapTasks, generateBootstrapFromTranscript, runIntelligence } from "@larry/ai";

// Add to @larry/shared import (line 8) if not already there:
import type { LarryAction, IntelligenceConfig } from "@larry/shared";
```

Note: `runAutoActions` and `getProjectSnapshot` may already be available from `@larry/db`. Check the package exports. If `runAutoActions` is in `larry-executor.ts`, import it from there: `import { runAutoActions } from "@larry/db";`

- [ ] **Step 2: Add intelligence trigger after meeting mode task creation**

After line 891 (end of the meeting task creation loop) and before line 893 (non-task action filtering), insert:

```typescript
          // ── Run intelligence on the newly created project ──
          try {
            const aiConfig = buildIntelligenceConfig(fastify.config);
            if (aiConfig && aiConfig.provider !== "mock") {
              const snapshot = await getProjectSnapshot(fastify.db, tenantId, finalizedProjectId);
              const intelligenceResult = await runIntelligence(
                aiConfig,
                snapshot,
                "project_intake_finalized — new project just created from meeting transcript. Analyze the tasks for gaps, risks, missing owners, unrealistic deadlines. If information is missing, generate followUpQuestions. Be proactive."
              );

              if (intelligenceResult.contextUpdate) {
                await updateProjectLarryContext(fastify.db, tenantId, finalizedProjectId, intelligenceResult.contextUpdate);
              }

              if (intelligenceResult.autoActions.length > 0 || intelligenceResult.suggestedActions.length > 0) {
                await runAutoActions(
                  fastify.db,
                  tenantId,
                  finalizedProjectId,
                  "bootstrap",
                  [...intelligenceResult.autoActions, ...intelligenceResult.suggestedActions],
                  undefined,
                  { requesterUserId: actorUserId, sourceKind: "project_intake", sourceRecordId: draft.id }
                );
              }
            }
          } catch (intelligenceError) {
            request.log.warn(
              { err: intelligenceError, tenantId, projectId: finalizedProjectId, draftId: draft.id },
              "post-bootstrap intelligence run failed — project created successfully but initial analysis skipped"
            );
          }
```

- [ ] **Step 3: Verify the code compiles**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30`

Expected: No errors related to project-intake.ts. Fix any import issues.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/project-intake.ts
git commit -m "feat: trigger intelligence analysis after meeting bootstrap finalization

Larry now runs runIntelligence() immediately after creating bootstrap tasks
from a meeting transcript, so users see analysis, risk flags, and suggestions
right away instead of waiting for the 4-hour scheduled scan."
```

---

### Task 2: Wire intelligence trigger after bootstrap finalization (chat/manual mode)

**Files:**
- Modify: `apps/api/src/routes/v1/project-intake.ts:1009-1048` (post-task-creation gap in chat/manual mode)

**Context:** The chat/manual mode has the exact same gap — tasks are created on lines 1001-1009 and then nothing triggers intelligence.

- [ ] **Step 1: Add intelligence trigger after chat/manual mode task creation**

After line 1009 (end of the chat/manual task creation loop) and before line 1011 (non-task action filtering), insert the same intelligence block as Task 1 Step 2. Copy it exactly — same try-catch, same hint text (change "meeting transcript" to "project intake"), same error handling.

```typescript
          // ── Run intelligence on the newly created project ──
          try {
            const aiConfig = buildIntelligenceConfig(fastify.config);
            if (aiConfig && aiConfig.provider !== "mock") {
              const snapshot = await getProjectSnapshot(fastify.db, tenantId, finalizedProjectId);
              const intelligenceResult = await runIntelligence(
                aiConfig,
                snapshot,
                "project_intake_finalized — new project just created from intake form. Analyze the tasks for gaps, risks, missing owners, unrealistic deadlines. If information is missing, generate followUpQuestions. Be proactive."
              );

              if (intelligenceResult.contextUpdate) {
                await updateProjectLarryContext(fastify.db, tenantId, finalizedProjectId, intelligenceResult.contextUpdate);
              }

              if (intelligenceResult.autoActions.length > 0 || intelligenceResult.suggestedActions.length > 0) {
                await runAutoActions(
                  fastify.db,
                  tenantId,
                  finalizedProjectId,
                  "bootstrap",
                  [...intelligenceResult.autoActions, ...intelligenceResult.suggestedActions],
                  undefined,
                  { requesterUserId: actorUserId, sourceKind: "project_intake", sourceRecordId: draft.id }
                );
              }
            }
          } catch (intelligenceError) {
            request.log.warn(
              { err: intelligenceError, tenantId, projectId: finalizedProjectId, draftId: draft.id },
              "post-bootstrap intelligence run failed — project created successfully but initial analysis skipped"
            );
          }
```

- [ ] **Step 2: Verify the code compiles**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/project-intake.ts
git commit -m "feat: trigger intelligence after chat/manual bootstrap finalization

Same intelligence trigger as meeting mode — Larry now analyzes newly
created projects immediately regardless of creation method."
```

---

### Task 3: Add error handling around AI calls in finalize

**Files:**
- Modify: `apps/api/src/routes/v1/project-intake.ts:936-964` (chat mode AI call)
- Modify: `apps/api/src/routes/v1/project-intake.ts:853-881` (meeting mode AI call — verify it already has try-catch)

**Context:** In the chat mode finalize path (line 936-964), if `buildBootstrapFromDraft()` throws (AI timeout, rate limit), the request fails with 500 and the project is left partially created (project row exists but no tasks). The `buildBootstrapFromDraft` function at lines 278-425 already has try-catch with fallback to tokenizer, so we need to verify that fallback actually works and add a safety net at the finalize level.

- [ ] **Step 1: Verify buildBootstrapFromDraft has fallback**

Read `apps/api/src/routes/v1/project-intake.ts` lines 278-425 to confirm the try-catch exists. If it does, the AI timeout issue is already handled at the function level. If not, wrap the call.

- [ ] **Step 2: Add safety wrap at the finalize level for chat mode**

Around lines 936-964, wrap the bootstrap call:

```typescript
        if (draft.mode === "chat" && bootstrapTasks.length === 0) {
          try {
            const aiConfig = buildIntelligenceConfig(fastify.config);
            const bootstrap = await buildBootstrapFromDraft(draft, aiConfig);
            bootstrapTasks = bootstrap.tasks;
            bootstrapActions = bootstrap.actions;
            bootstrapSummary = bootstrap.summary;
            bootstrapSeedMessage = bootstrap.seedMessage;
          } catch (bootstrapError) {
            request.log.error(
              { err: bootstrapError, tenantId, draftId: draft.id },
              "bootstrap task generation failed during finalize — creating project without tasks"
            );
            // Project will still be created, just without bootstrap tasks.
            // The post-creation intelligence trigger (Task 1/2) will analyze it.
          }

          if (bootstrapSummary || bootstrapTasks.length > 0) {
            await fastify.db.queryTenant(
              // ... existing draft update query ...
            );
          }
        }
```

- [ ] **Step 3: Add error handling for the task creation loop**

Wrap the task creation loop (lines 1001-1009) to collect failures:

```typescript
        const taskErrors: string[] = [];
        for (const task of bootstrapTasks) {
          try {
            await executeTaskCreate(fastify.db, tenantId, finalizedProjectId, {
              title: task.title,
              description: task.description ?? null,
              dueDate: task.dueDate ?? null,
              assigneeName: task.assigneeName ?? null,
              priority: task.priority ?? "medium",
            });
          } catch (taskError) {
            const msg = taskError instanceof Error ? taskError.message : String(taskError);
            request.log.warn(
              { err: taskError, tenantId, projectId: finalizedProjectId, taskTitle: task.title },
              `failed to create bootstrap task "${task.title}"`
            );
            taskErrors.push(`${task.title}: ${msg}`);
          }
        }
```

Do the same for the meeting mode loop (lines 883-891).

- [ ] **Step 4: Verify compiles and commit**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30`

```bash
git add apps/api/src/routes/v1/project-intake.ts
git commit -m "fix: add error handling for AI calls and task creation in finalize

Bootstrap failures no longer crash the finalize endpoint. Projects are
created even if AI times out, and individual task creation failures are
logged without blocking other tasks."
```

---

### Task 4: Reduce scheduled scan interval from 4 hours to 30 minutes

**Files:**
- Modify: `apps/worker/src/worker.ts:19-26`

- [ ] **Step 1: Change the repeat interval**

In `apps/worker/src/worker.ts`, line 23, change:

```typescript
// OLD:
    repeat: { every: 4 * 60 * 60 * 1000 },  // 4 hours
// NEW:
    repeat: { every: 30 * 60 * 1000 },  // 30 minutes
```

- [ ] **Step 2: Add retry config to all scheduled jobs**

For each `queue.add()` call (larry.scan, escalation.scan, calendar.webhook.renew), add retry options:

```typescript
await queue.add(
  "larry.scan",
  {},
  {
    repeat: { every: 30 * 60 * 1000 },  // 30 minutes
    jobId: "larry-scan",
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  }
);
```

Do the same for `escalation.scan` and `calendar.webhook.renew`.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/worker.ts
git commit -m "feat: reduce larry scan interval to 30min, add job retry policies

Larry now scans all active projects every 30 minutes instead of every 4 hours.
All scheduled jobs now retry up to 3 times with exponential backoff."
```

---

## Phase 2: Make Larry Smart

### Task 5: Fix snapshot member query — project members only

**Files:**
- Modify: `packages/db/src/larry-snapshot.ts:123-139`

**Context:** The current query fetches ALL tenant members using `FROM memberships m WHERE m.tenant_id = $1`. This means Larry thinks everyone in the organization works on every project. The fix must either filter by project_memberships or by task assignment.

- [ ] **Step 1: Check if project_memberships table exists**

Run: `grep -r "project_memberships\|project_collaborators" /c/Dev/larry/site-deploys/larry-site/packages/db/src/ --include="*.ts" --include="*.sql" | head -20`

This will tell us the correct table name and schema.

- [ ] **Step 2: Update the member query to filter by project**

Replace lines 123-139 in `packages/db/src/larry-snapshot.ts`:

```sql
SELECT
  m.user_id,
  u.display_name,
  u.email,
  m.role,
  COUNT(t.id) FILTER (
    WHERE t.project_id = $2
      AND t.status NOT IN ('completed', 'backlog')
  ) AS active_task_count
FROM memberships m
JOIN users u ON m.user_id = u.id
LEFT JOIN tasks t ON t.assignee_user_id = m.user_id AND t.tenant_id = m.tenant_id
WHERE m.tenant_id = $1
  AND (
    -- Include if they are a project collaborator
    EXISTS (
      SELECT 1 FROM project_memberships pm
      WHERE pm.user_id = m.user_id
        AND pm.project_id = $2
        AND pm.tenant_id = $1
    )
    -- OR if they have tasks assigned on this project
    OR EXISTS (
      SELECT 1 FROM tasks t2
      WHERE t2.assignee_user_id = m.user_id
        AND t2.project_id = $2
        AND t2.tenant_id = $1
    )
  )
GROUP BY m.user_id, u.display_name, u.email, m.role
```

Note: Verify the actual table name from Step 1. It may be `project_memberships` or `project_collaborators`. Adjust accordingly.

- [ ] **Step 3: Also fix active_task_count to include blocked tasks**

In the COUNT FILTER clause, change the exclusion:

```sql
-- OLD:
AND t.status NOT IN ('completed', 'backlog')
-- NEW:
AND t.status NOT IN ('completed')
```

This ensures blocked tasks count toward a person's workload (they still need attention).

- [ ] **Step 4: Verify and commit**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p packages/db/tsconfig.json 2>&1 | head -20`

```bash
git add packages/db/src/larry-snapshot.ts
git commit -m "fix: snapshot member query now filters by project, includes blocked in workload

Larry now only sees team members who are actual project collaborators or
have tasks assigned. Blocked tasks now count toward active workload."
```

---

### Task 6: Add ask-first gate to bootstrap prompts

**Files:**
- Modify: `packages/ai/src/index.ts:670-681` (schema)
- Modify: `packages/ai/src/index.ts:701-725` (system prompt for generateBootstrapTasks)
- Modify: `packages/ai/src/index.ts:772-793` (system prompt for generateBootstrapFromTranscript)

**Context:** The bootstrap prompt currently says "Transform vague intent into specific, assignable work." This is the root cause of Larry generating garbage placeholder tasks. We need to add a `followUpQuestions` field to the schema and tell Larry to ask when input is too vague.

- [ ] **Step 1: Add followUpQuestions to the bootstrap schema**

Replace the `BootstrapResultSchema` (lines 678-681):

```typescript
const BootstrapFollowUpSchema = z.object({
  field: z.string().min(1).max(200),
  question: z.string().min(1).max(500),
});

const BootstrapResultSchema = z.object({
  tasks: z.array(BootstrapTaskSchema).max(10).default([]),
  summary: z.string().min(1).max(500),
  followUpQuestions: z.array(BootstrapFollowUpSchema).max(5).default([]),
});
```

Note: Changed `tasks` from `.min(1)` to `.default([])` — if Larry returns follow-up questions, tasks array can be empty.

- [ ] **Step 2: Update the return type**

Update the function signature return type (line 686):

```typescript
): Promise<{ tasks: BootstrapTask[]; summary: string; followUpQuestions: Array<{ field: string; question: string }> }>
```

Do the same for `generateBootstrapFromTranscript` (line 757).

- [ ] **Step 3: Rewrite the bootstrap system prompt to include ask-first gate**

Replace the system prompt array (lines 701-725) in `generateBootstrapTasks`:

```typescript
  const systemPrompt = [
    "You are Larry, a senior AI project management assistant with 15 years of PM experience.",
    "A user just created a new project and answered intake questions. Your job is to generate 4-8 actionable starter tasks that a real PM would put on their board on day one.",
    "",
    "BEFORE GENERATING TASKS — ASK-FIRST GATE:",
    "Check if the input provides ENOUGH detail to create meaningful tasks. You need at least:",
    "  1. A clear goal or outcome (what does success look like?)",
    "  2. Some indication of scope (what's included/excluded?)",
    "  3. At least one concrete deliverable or workstream",
    "",
    "If 2 or more of these are missing or too vague to act on, return followUpQuestions instead of tasks.",
    "Return 1-3 questions (ONE per missing piece). Each question should help you create better tasks.",
    "",
    "Examples of VAGUE input that needs questions:",
    '  - "Improve onboarding" → Ask: "What aspects of onboarding? (UX flow, documentation, automation, support training?)"',
    '  - "Launch a product" → Ask: "What does launch mean for you? (website live, app store release, beta rollout, marketing campaign?)"',
    '  - "Build the thing" → Ask: "Can you describe the main deliverables and who needs to be involved?"',
    "",
    "Examples of SUFFICIENT input — go ahead and generate tasks:",
    '  - "Build a customer portal with login, dashboard, and billing integration. Launch by April 30."',
    '  - "Plan the Q3 marketing campaign: social media, email sequences, and landing pages for the new product."',
    "",
    "CONTEXT INTERPRETATION — this is critical:",
    '- "ASAP" or "as soon as possible" means within 1 week from today.',
    '- "Urgent" means within 3 business days.',
    '- "Critical" means existential risk — 2-3 days, or escalate if blocked.',
    '- "Everything is ASAP" or "everything is critical" means the user is stressed. Force-rank by dependencies, identify what truly blocks other work, and phase the rest into 1-week sprints.',
    '- If no deadline is given, infer one based on task complexity: simple tasks get 3-5 days, complex ones get 1-2 weeks.',
    '- NEVER leave dueDate as null. Always calculate a concrete YYYY-MM-DD date from today.',
    `- Today's date is ${today}. Calculate all due dates relative to today.`,
    "",
    "TASK GENERATION RULES (only when you have enough detail):",
    "- Each task must be a concrete, actionable work item.",
    "- Titles MUST start with a verb (e.g. 'Define...', 'Set up...', 'Draft...', 'Research...', 'Identify...').",
    "- Each task MUST have a useful description explaining what to do, why it matters, and what 'done' looks like.",
    "- Set priority based on dependency order: tasks that block others are 'high' or 'critical', independent tasks are 'medium', nice-to-haves are 'low'.",
    "- Group related tasks under a workstream name (e.g. 'MVP Development', 'Growth Strategy').",
    "- For multi-deliverable projects, create at least one task per deliverable PLUS cross-cutting tasks (kickoff, stakeholder alignment, risk review).",
    "- Stagger due dates — spread across 1-3 weeks based on priority.",
    "- Also provide a short summary sentence describing what you set up and the implied timeline.",
  ].join("\n");
```

- [ ] **Step 4: Update the transcript prompt similarly**

Replace the system prompt in `generateBootstrapFromTranscript` (lines 772-793) to add the same ask-first gate adapted for transcripts:

```typescript
  const systemPrompt = [
    "You are Larry, a senior AI project management assistant with 15 years of PM experience.",
    "A user uploaded a meeting transcript. Your job is to extract 3-8 real, actionable tasks from commitments made in the meeting.",
    "",
    "BEFORE GENERATING TASKS — TRANSCRIPT QUALITY GATE:",
    "Check if the transcript contains COMMITTED actions. You need:",
    "  1. At least one person agreeing to do something specific",
    "  2. Some context for what the work is about",
    "",
    "If the transcript is too short, unclear, or contains no actionable commitments, return followUpQuestions.",
    "Example: { field: 'details', question: 'The transcript didn\\'t contain clear action items. Can you tell me what was decided in the meeting?' }",
    "",
    "CONTEXT INTERPRETATION:",
    '- "ASAP" means within 1 week. "Urgent" means 2-3 days. "Critical" means 1-2 days.',
    '- "By end of week" means Friday. "Next week" means the following Monday-Friday.',
    "- If someone says they'll do something but no deadline is mentioned, infer one based on task complexity (simple: 3 days, medium: 1 week, complex: 2 weeks).",
    "- NEVER leave dueDate as null. Always calculate a concrete YYYY-MM-DD date.",
    `- Today's date is ${today}. Calculate all due dates relative to today.`,
    "",
    "TASK EXTRACTION RULES:",
    "- Extract only COMMITTED actions — things people agreed to do, not hypotheticals or past work.",
    "- Each task title MUST start with a verb and be specific (e.g. 'Send updated proposal to client by Friday').",
    "- Each task MUST have a description explaining the meeting context and what 'done' looks like.",
    "- If someone was assigned the task, mention their name in the description (e.g. 'Assigned to Sarah').",
    "- Set priority based on what blocks other work: 'high' for blocking items, 'medium' for standard follow-ups.",
    "- Do NOT create tasks from casual conversation, jokes, or off-topic discussion.",
    "- Stagger due dates — not all tasks should have the same deadline.",
    "- Provide a one-sentence summary of the meeting's key outcomes.",
  ].join("\n");
```

- [ ] **Step 5: Update buildBootstrapFromDraft to handle followUpQuestions**

In the `buildBootstrapFromDraft` function (around lines 358-401), update how AI results are processed:

```typescript
// After the generateBootstrapTasks or generateBootstrapFromTranscript call,
// check if followUpQuestions were returned instead of tasks:
const aiResult = await generateBootstrapTasks(aiConfig, { ... });

// If AI asked questions instead of generating tasks, store them as suggestions
if (aiResult.followUpQuestions && aiResult.followUpQuestions.length > 0 && aiResult.tasks.length === 0) {
  // Convert follow-up questions into a suggestion action
  const questionAction: LarryAction = {
    type: "scope_change",
    displayText: "Larry needs more information to create your project tasks",
    reasoning: aiResult.followUpQuestions.map(q => `${q.field}: ${q.question}`).join("\n"),
    payload: {
      description: aiResult.followUpQuestions.map(q => q.question).join("\n\n"),
    },
  };
  actions.push(questionAction);
}
```

- [ ] **Step 6: Update the mock providers to return followUpQuestions: []**

In both mock returns (lines 689-696 and 760-767), add `followUpQuestions: []` to the return object.

- [ ] **Step 7: Verify and commit**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p packages/ai/tsconfig.json 2>&1 | head -20`

```bash
git add packages/ai/src/index.ts apps/api/src/routes/v1/project-intake.ts
git commit -m "feat: add ask-first gate to bootstrap — Larry asks before guessing

Bootstrap prompts now check if input has enough detail before generating
tasks. If 2+ of goal/scope/deliverables are missing, Larry returns
followUpQuestions instead of placeholder tasks."
```

---

### Task 7: Create missing knowledge files

**Files:**
- Create: `packages/ai/knowledge/context-gathering.md`
- Create: `packages/ai/knowledge/task-decomposition.md`
- Create: `packages/ai/knowledge/dependency-chains.md`

- [ ] **Step 1: Create context-gathering.md**

```markdown
# Context Gathering

When to ask for more information vs. act on what you have.

## The Rule
If acting on incomplete information would produce a wrong or misleading result, ask first.
If acting on partial information would still be directionally correct, act and note what's missing.

## When to Ask (return followUpQuestions)
- User wants to CREATE tasks but hasn't specified deliverables, deadlines, or owners
- A deadline is given but the assignee is unknown — ask "Who should own this?"
- An assignee is named but their availability is unknown and they have 5+ active tasks — ask "Sarah has 6 active tasks. Should I assign this to her or suggest someone else?"
- The user says "improve X" or "fix Y" without specifying what's wrong or what success looks like
- A task requires skills or access you can't verify from the snapshot

## When to Act (generate actions without asking)
- The user provides a specific task title, even without deadline or assignee — create it, set reasonable defaults
- Status updates with clear state changes — just execute
- The snapshot has enough data to infer the right action (e.g., overdue task → flag risk)
- Scheduled scans — never ask, always act on what you see

## How to Ask
- ONE question at a time. Never dump 5 questions.
- Frame questions as multiple choice when possible: "Should I assign this to Sarah (2 active tasks) or Marcus (5 active tasks)?"
- Always explain WHY you're asking: "I want to make sure I set the right deadline — when does the client need this?"
- If asking would be annoying (trivial decision), make the call and note it: "I set this to medium priority. Change it if that's wrong."

## What NOT to Ask
- Don't ask about things you can see in the snapshot (task status, team members, deadlines)
- Don't ask confirmation for auto-executable actions (risk flags, reminders)
- Don't ask "are you sure?" — just surface the consequences and let them decide
```

- [ ] **Step 2: Create task-decomposition.md**

```markdown
# Task Decomposition

How to break down vague goals into concrete, assignable work.

## When to Decompose
- A task description mentions multiple deliverables ("build login, dashboard, and billing")
- A task has no clear "done" state ("improve the onboarding experience")
- A task would take more than 2 weeks for one person
- A task title is a goal, not an action ("Q3 marketing" → needs breakdown)

## Decomposition Pattern
1. Identify the distinct deliverables or workstreams
2. For each deliverable, create ONE task with a verb title
3. Add cross-cutting tasks: kickoff/alignment, integration testing, stakeholder review
4. Set dependencies: which tasks block others?
5. Stagger deadlines — not everything due on the same day

## Naming Rules
- Always start with a verb: Define, Build, Draft, Research, Review, Ship, Test, Design
- Be specific: "Design login page wireframes" not "Design stuff"
- Include the deliverable: "Write API documentation for billing endpoints" not "Write docs"

## Priority Assignment
- Critical: Blocks 3+ other tasks, or has an external deadline within 3 days
- High: Blocks 1-2 other tasks, or has a deadline within 1 week
- Medium: Independent work with a reasonable deadline
- Low: Nice-to-have, no downstream dependencies

## Common Anti-Patterns to Avoid
- Creating a task called "Set up project" — too vague
- All tasks at the same priority — force-rank them
- All tasks due on the same day — stagger by dependency order
- Tasks without descriptions — always explain "done" state
```

- [ ] **Step 3: Create dependency-chains.md**

```markdown
# Dependency Chain Analysis

How to identify and manage task dependencies and critical paths.

## Identifying Dependencies
When analyzing a project, ask:
- Which tasks MUST complete before others can start?
- Which tasks share the same resource (person, system, access)?
- Which tasks have external dependencies (client approval, vendor delivery)?

## Critical Path Rules
- The critical path is the longest chain of dependent tasks
- Any delay on the critical path delays the entire project
- Tasks NOT on the critical path have "float" — they can slip without affecting the deadline

## What to Do When You See Blocked Tasks
1. Identify the BLOCKER task (the one everything depends on)
2. Check its status, assignee, and progress
3. If the blocker is at risk (low progress, approaching deadline):
   - Flag it as high risk immediately (auto-execute)
   - Send a reminder to the assignee (auto-execute)
   - Suggest an escalation to the PM if it blocks 3+ tasks (suggested action)
4. Note the dependency chain in your briefing: "Task A blocks B, C, and D. If A slips, all three slip."

## Cascade Impact Assessment
When a task's deadline changes, check:
- Does this task block other tasks?
- Do those downstream tasks still have realistic deadlines?
- If not, suggest deadline adjustments for the affected chain

## Escalation Triggers
Suggest escalation (email_draft or briefing callout) when:
- A blocking task is overdue with no progress
- A person is assigned to 3+ tasks on the critical path
- The same task has been flagged as blocked twice in the last 7 days
- A dependency chain is 4+ levels deep and the root is at risk
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai/knowledge/context-gathering.md packages/ai/knowledge/task-decomposition.md packages/ai/knowledge/dependency-chains.md
git commit -m "feat: add knowledge files for context-gathering, task decomposition, dependency chains

Three new knowledge files that teach Larry when to ask vs act, how to break
down vague goals, and how to analyze dependency chains and critical paths."
```

---

### Task 8: Improve system prompt decision tree for asking vs acting

**Files:**
- Modify: `packages/ai/src/intelligence.ts:639-665` (follow-up question section)

**Context:** The current prompt says "Return followUpQuestions when the user asks to CREATE something but hasn't given enough detail." This is too vague. We need concrete thresholds.

- [ ] **Step 1: Replace the follow-up questions section**

Replace lines 639-665 in `packages/ai/src/intelligence.ts` with a more concrete decision tree:

```typescript
`### Follow-up questions — DECISION TREE

Before generating any CREATE action, run this check:

| User provides... | Action |
|-----------------|--------|
| Task title + assignee + deadline | CREATE immediately |
| Task title + deadline (no assignee) | CREATE with assignee=null, mention "no owner assigned" in briefing |
| Task title only (no deadline, no assignee) | CREATE with inferred deadline, mention defaults in briefing |
| Vague goal ("improve X", "fix Y", "set up Z") | Return followUpQuestions — ask what specifically |
| Multiple items ("add tasks for marketing") | Return followUpQuestions — ask which specific tasks |
| Ambiguous target ("update the task") | Return followUpQuestions — ask which task |

Return followUpQuestions when:
- The request is a GOAL, not a TASK (goals need breakdown, tasks can be acted on)
- Key details are genuinely ambiguous (which task? which person? what scope?)
- The request could apply to multiple entities and you cannot determine which
- The user asks to draft communication but recipient or content is vague

Do NOT return followUpQuestions when:
- The project snapshot provides the missing details (look before asking)
- The request is a status query (answer in briefing)
- You are running on a scheduled scan or login trigger (no user to ask)
- Optional details are missing but you can set reasonable defaults
- The user explicitly says "just do it" or "figure it out"

When followUpQuestions is non-empty, autoActions and suggestedActions MUST be empty arrays.
Put your partial understanding in the briefing: "Got it — I need a couple of details before I set that up."

followUpQuestions format:
  "followUpQuestions": [
    { "field": "deadline", "question": "What deadline should I set for this?" },
    { "field": "assignee", "question": "Who should own this?" }
  ]

Valid field values: "deadline", "assignee", "scope", "recipient", "task_target", "details", "general"

CRITICAL: Ask ONE question at a time when possible. If you need 3 things, pick the most important one first.`,
```

- [ ] **Step 2: Verify and commit**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npx tsc --noEmit -p packages/ai/tsconfig.json 2>&1 | head -20`

```bash
git add packages/ai/src/intelligence.ts
git commit -m "feat: concrete decision tree for when Larry asks vs acts

Replaces vague 'ask when in doubt' with a specific decision table.
Larry now has clear rules for when to create immediately, when to
ask follow-up questions, and when to just answer in the briefing."
```

---

## Phase 3: Make Actions Reliable

### Task 9: Fix resolveTaskByTitle reverse substring matching

**Files:**
- Modify: `packages/db/src/larry-executor.ts:538-551` (Strategy 5)

**Context:** Strategy 5 does `$3 ILIKE '%' || title || '%'` — this matches any task whose title is a SUBSTRING of the search term. So searching for "Implement User Authentication" matches a task called "User". This is backwards.

- [ ] **Step 1: Replace Strategy 5 with Levenshtein-based fuzzy match**

Replace lines 538-551:

```typescript
    // Strategy 5: Fuzzy match using word overlap scoring
    // Instead of reverse substring (which matches "User" to any search containing "User"),
    // score by how many words overlap between the search term and each task title.
    const candidates = await db.queryTenant<{ id: string; title: string }>(
      tenantId,
      `SELECT id, title FROM tasks
       WHERE project_id = $2 AND tenant_id = $1
         AND status NOT IN ('completed')
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId, projectId]
    );

    if (candidates.length > 0) {
      const searchWords = new Set(normalised.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      let bestMatch: { id: string; score: number } | null = null;

      for (const c of candidates) {
        const titleWords = c.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const overlap = titleWords.filter(w => searchWords.has(w)).length;
        const score = titleWords.length > 0 ? overlap / titleWords.length : 0;

        if (score > 0.4 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: c.id, score };
        }
      }

      if (bestMatch) return bestMatch.id;
    }
```

- [ ] **Step 2: Verify and commit**

```bash
git add packages/db/src/larry-executor.ts
git commit -m "fix: replace reverse substring with word-overlap fuzzy matching

Strategy 5 in resolveTaskByTitle was matching any task whose title appeared
as a substring of the search term (e.g., 'User' matching 'Implement User Auth').
Now uses word-overlap scoring with a 40% threshold."
```

---

### Task 10: Fix calendar event execution — draft instead of throw

**Files:**
- Modify: `packages/db/src/larry-executor.ts:1464-1472`

**Context:** Calendar event actions throw an error with "must execute via the API accept flow." This is correct for auto-execution, but the error message is confusing and the action should be rerouted to suggestions, not thrown.

- [ ] **Step 1: Replace throw with reroute to suggestions**

Replace lines 1464-1472:

```typescript
    case "calendar_event_create":
    case "calendar_event_update":
      // Calendar actions require external API integration and user approval.
      // They should never reach executeAction() directly — they must go through
      // the accept flow in the larry routes. If we're here, reroute to suggestions.
      return {
        entity: null,
        rerouted: true,
        reason: `${actionType} requires approval — stored as suggestion`,
      };
```

Note: Check if `executeAction` return type supports this. If not, throw a more descriptive error:

```typescript
      throw new Error(
        `Calendar actions require approval in the Action Centre. ` +
        `Go to Actions → find this event → Accept to create the calendar entry.`
      );
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/larry-executor.ts
git commit -m "fix: calendar actions give clear error instead of cryptic throw

Calendar event create/update now returns a user-friendly message explaining
they need to be approved via the Action Centre."
```

---

### Task 11: Fix collaborator tenant check order

**Files:**
- Modify: `packages/db/src/larry-executor.ts:1073-1114`

- [ ] **Step 1: Move assertTenantMembership before project checks**

In `executeCollaboratorAdd`, move the tenant membership check (currently around line 1094) to be the FIRST validation after userId resolution:

```typescript
export async function executeCollaboratorAdd(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const role = normalizeProjectMembershipRole(payload.role);
  const name = normalizeContextValue(payload.userName) ?? normalizeContextValue(payload.name);
  const userId = normalizeContextValue(payload.userId);
  if (!userId) {
    throw new Error(`Collaborator add failed — could not resolve user "${name}".`);
  }

  // Tenant membership check FIRST — before any project-level logic
  await assertTenantMembership(db, tenantId, userId);

  const existingRole = await getProjectMembershipRoleForUser(db, tenantId, projectId, userId);
  // ... rest of the function unchanged ...
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/larry-executor.ts
git commit -m "fix: check tenant membership before project role logic in collaborator add"
```

---

### Task 12: Fix email validation — surface gaps instead of silent drop

**Files:**
- Modify: `packages/ai/src/intelligence.ts:176-196` (action filter transform)

**Context:** When an email_draft action is missing a valid "to" address, the `actionHasRequiredFields` filter silently drops it with a `console.warn`. Larry never learns why it was dropped and proposes the same email again next scan.

- [ ] **Step 1: Add dropped-action feedback to contextUpdate**

In the `IntelligenceResultSchema.transform()` (around lines 176-196), collect dropped actions and surface them:

```typescript
  .transform((result) => {
    const droppedReasons: string[] = [];

    const filterAction = (action: LarryAction, label: string): boolean => {
      if (!actionHasRequiredFields(action)) {
        const missing = (REQUIRED_PAYLOAD_FIELDS[action.type] ?? [])
          .filter((field) => !isNonEmptyString(action.payload[field]));
        const reason = `Dropped ${label} "${action.type}" — missing: ${missing.join(", ")}`;
        console.warn(`[LarryIntelligence] ${reason}`);
        droppedReasons.push(reason);
        return false;
      }
      return true;
    };

    const autoActions = (result.autoActions ?? []).filter(a => filterAction(a, "auto-action"));
    const suggestedActions = (result.suggestedActions ?? []).filter(a => filterAction(a, "suggestion"));

    // Append dropped-action info to contextUpdate so Larry learns from it
    let contextUpdate = result.contextUpdate ?? null;
    if (droppedReasons.length > 0) {
      const feedback = `\n[System] Actions dropped due to missing fields: ${droppedReasons.join("; ")}`;
      contextUpdate = (contextUpdate ?? "") + feedback;
    }

    return {
      ...result,
      autoActions,
      suggestedActions,
      contextUpdate,
    };
  });
```

- [ ] **Step 2: Add a briefing note when email has no recipient**

In the system prompt email section, add after the existing email rules:

```
If you want to send an email but the team snapshot has no email address for the recipient:
- DO NOT generate an email_draft action (it will be dropped)
- Instead, mention in the briefing: "I'd suggest emailing [person] about [topic], but I don't have their email on file."
- Suggest a collaborator_add or scope_change action to collect the email address
```

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/intelligence.ts
git commit -m "fix: surface dropped actions in contextUpdate instead of silent discard

When actions are dropped due to missing required fields, the reason is now
appended to contextUpdate so Larry can learn from it. Email drafts without
valid recipients are explained in the briefing instead of silently dropped."
```

---

### Task 13: Fix fallback bootstrap tasks — always set due dates

**Files:**
- Modify: `packages/ai/src/index.ts:430-504` (fallback functions)

- [ ] **Step 1: Update fallbackMeetingBootstrap to calculate due dates**

In `fallbackMeetingBootstrap` (around line 430), replace any `dueDate: draft.projectTargetDate` with calculated dates:

```typescript
function fallbackMeetingBootstrap(
  draft: IntakeDraftModel,
  projectName: string,
  transcript: string
): { tasks: BootstrapTask[]; summary: string } {
  const today = new Date();
  const calcDate = (daysFromNow: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  };

  // ... existing regex extraction logic ...

  // For each extracted task, assign a staggered due date:
  return {
    tasks: extractedTasks.map((task, i) => ({
      ...task,
      dueDate: task.dueDate ?? calcDate(3 + i * 2), // 3, 5, 7, 9... days out
      priority: task.priority ?? "medium",
    })),
    summary: `Larry identified ${extractedTasks.length} action items from "${projectName}".`,
  };
}
```

- [ ] **Step 2: Do the same for fallbackTokenizeBootstrap**

Apply the same `calcDate` pattern to `fallbackTokenizeBootstrap` (around line 470).

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/index.ts
git commit -m "fix: fallback bootstrap tasks always get concrete due dates

Fallback (regex/tokenizer) bootstrap tasks now calculate staggered due dates
instead of using null or the project target date."
```

---

## Phase 4: Complete Missing Pieces

### Task 14: Add failure tracking to larry-scan

**Files:**
- Modify: `apps/worker/src/larry-scan.ts`

- [ ] **Step 1: Add failure counter and timing**

```typescript
export async function runLarryScan(): Promise<void> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
  let actionsExecuted = 0;

  // ... existing project loading and processing ...

  // In the catch block for each project:
  } catch (err) {
    failed++;
    console.error(`[larry-scan] Failed to process project ${project.id}:`, err);
  }

  // At the end:
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[larry-scan] completed in ${elapsed}s — processed: ${processed}, failed: ${failed}, actions: ${actionsExecuted}`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/larry-scan.ts
git commit -m "feat: add failure tracking and timing to larry scan

Scan now logs processed/failed/actions counts and elapsed time."
```

---

### Task 15: Add escalation broadcast fallback

**Files:**
- Modify: `apps/worker/src/escalation.ts`

**Context:** Escalation notifications only go to the task assignee. If the task has no assignee, or if the assignee doesn't respond, nobody else is notified.

- [ ] **Step 1: Add PM/owner fallback for unassigned tasks**

After the existing assignee notification logic, add:

```typescript
// If task has no assignee, notify the project owner instead
if (!task.assignee_user_id) {
  const owners = await db.query<{ user_id: string; email: string; display_name: string }>(
    `SELECT pm.user_id, u.email, u.display_name
     FROM project_memberships pm
     JOIN users u ON pm.user_id = u.id
     WHERE pm.project_id = $1 AND pm.tenant_id = $2 AND pm.role = 'owner'
     LIMIT 1`,
    [task.project_id, tenantId]
  );

  if (owners.length > 0) {
    const owner = owners[0];
    await insertNotification(db, tenantId, {
      userId: owner.user_id,
      type: notificationType,
      title: `Unassigned task needs attention: ${task.title}`,
      body: `Task "${task.title}" has no assignee and ${escalationReason}.`,
      projectId: task.project_id,
      taskId: task.id,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/escalation.ts
git commit -m "feat: escalation notifications fall back to project owner for unassigned tasks"
```

---

### Task 16: Implement feedback learning loop

**Files:**
- Modify: `packages/ai/src/intelligence.ts` (buildUserPrompt function)
- Modify: `packages/db/src/larry-snapshot.ts` (add feedback history to snapshot)

**Context:** The system prompt tells Larry to learn from accepted/dismissed patterns, but no code actually feeds this data to Larry. The `larry_events` table has `state` (pending/accepted/dismissed/auto_executed) but this isn't included in the snapshot.

- [ ] **Step 1: Add feedback history to the snapshot query**

In `packages/db/src/larry-snapshot.ts`, add a new query to the parallel fetch:

```typescript
    // Add to the Promise.all array:
    db.query<{ action_type: string; state: string; count: number }>(
      `SELECT action_type, state, COUNT(*)::int AS count
       FROM larry_events
       WHERE tenant_id = $1 AND project_id = $2
         AND state IN ('accepted', 'dismissed')
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY action_type, state
       ORDER BY count DESC`,
      [tenantId, projectId]
    ),
```

- [ ] **Step 2: Include feedback in the ProjectSnapshot type and assembly**

Add to the snapshot type:

```typescript
export interface ProjectSnapshot {
  // ... existing fields ...
  feedbackHistory: Array<{ actionType: string; state: string; count: number }>;
}
```

And in the snapshot assembly, map the query result to the new field.

- [ ] **Step 3: Include feedback in the user prompt**

In `buildUserPrompt` in `intelligence.ts`, add after the existing sections:

```typescript
if (snapshot.feedbackHistory && snapshot.feedbackHistory.length > 0) {
  const feedbackLines = snapshot.feedbackHistory.map(
    f => `  ${f.actionType}: ${f.state} ${f.count} times`
  );
  parts.push(
    `\nPAST CORRECTIONS (last 30 days):\n${feedbackLines.join("\n")}`,
    `Use this to calibrate: reduce suggestions of types that are mostly dismissed, increase types that are mostly accepted.`
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/larry-snapshot.ts packages/ai/src/intelligence.ts
git commit -m "feat: implement feedback learning loop — Larry adapts to accept/dismiss patterns

The project snapshot now includes a 30-day history of accepted vs dismissed
action types. This is fed to the intelligence engine so Larry can calibrate
future suggestions based on what the user actually wants."
```

---

### Task 17: Delete dead mock dashboard components

**Files:**
- Delete: `apps/web/src/components/dashboard/LarryChat.tsx`
- Delete: `apps/web/src/components/dashboard/pages/GanttPage.tsx`
- Delete: `apps/web/src/components/dashboard/pages/AnalyticsPage.tsx`
- Delete: `apps/web/src/components/dashboard/pages/ProjectHub.tsx`
- Delete: `apps/web/src/components/dashboard/pages/MeetingNotesPage.tsx`
- Delete: `apps/web/src/components/dashboard/NotificationPanel.tsx`
- Delete: `apps/web/src/components/dashboard/ActionPanel.tsx`
- Delete: `apps/web/src/components/dashboard/ProjectSelectionScreen.tsx`

**Context:** These components use hardcoded mock data and are NOT imported anywhere in the live workspace routing. They are dead code from early prototyping.

- [ ] **Step 1: Verify none are imported**

Run: `grep -r "from.*components/dashboard/" /c/Dev/larry/site-deploys/larry-site/apps/web/src/app/ --include="*.tsx" --include="*.ts" | head -20`

If any are imported, do NOT delete those. Only delete files with zero imports.

- [ ] **Step 2: Delete confirmed dead files**

```bash
# Only delete files confirmed as unused in Step 1
rm apps/web/src/components/dashboard/LarryChat.tsx
rm apps/web/src/components/dashboard/pages/GanttPage.tsx
# ... etc for each confirmed unused file
```

- [ ] **Step 3: Verify build still passes**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npm run web:build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/components/dashboard/
git commit -m "chore: remove dead mock dashboard components

These components used hardcoded mock data and were never imported in the
live workspace routing. Removing ~3000 lines of dead code."
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] **Create a project via transcript** → Tasks created AND Larry immediately analyzes them (check larry_events table for new entries)
- [ ] **Create a project via chat** → Same immediate analysis
- [ ] **Create a project with vague input** ("improve things") → Larry returns follow-up questions, not placeholder tasks
- [ ] **Check snapshot for a project** → Only project members shown, not all tenant members
- [ ] **Accept an action in Action Centre** → No 422 errors, task resolution works
- [ ] **Check the 30-minute scan** → Worker logs show scan running every 30 minutes
- [ ] **Check escalation for unassigned task** → Project owner gets notified
- [ ] **Dismiss 3 email_draft suggestions** → Next scan, Larry reduces email suggestions

---

## Sub-Project Backlog (Future Plans)

These issues were identified but are out of scope for this plan:

1. **Team member invitation UI** — No invite page exists in the frontend
2. **Notification preferences UI** — No configuration page exists
3. **Generate Report enhancement** — Backend generates DOCX/XLSX/PPTX but reports are data-only, no AI insights
4. **Cross-project intelligence** — Larry only sees one project at a time, can't advise on portfolio conflicts
5. **CSRF middleware** — TODO in middleware.ts, not implemented
