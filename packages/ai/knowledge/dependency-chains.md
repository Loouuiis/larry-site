# Dependency Chain Analysis

How to identify and manage task dependencies and critical paths.

## Creating Sequential Tasks
When the user describes work that happens in sequence ("evaluation then report", "phase 1 then phase 2", "X before Y"), set `startDate` on downstream tasks to the day after the predecessor's `dueDate`. Never set all tasks to start today when the work is clearly sequential.

Example: "Evaluation due May 1, then write the report" →
- Evaluation: dueDate = 2026-05-01, startDate = today
- Report: startDate = 2026-05-02, dueDate = inferred from scope

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
