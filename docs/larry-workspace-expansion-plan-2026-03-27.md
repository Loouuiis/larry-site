# Larry Workspace Expansion Plan

Date: 2026-03-27

## Goal

Extend Larry from a separate chat surface into a workspace-native execution layer that can:

1. Be reached from every project and major workspace surface.
2. Turn prompts into task creation or task closure actions, auto-executing when confidence and policy allow.
3. Make the Action Centre explicit about what will happen on approval, whether that is creating a task, closing a task, drafting an email, or creating a project.

## What Exists Today

- Project-scoped Larry conversations already exist in the API and database.
  - `apps/api/src/routes/v1/larry.ts`
  - `packages/db/src/schema.sql`
- The new workspace chat clients already load and persist Larry conversation history.
  - `apps/web/src/app/workspace/useLarryChat.ts`
  - `apps/web/src/app/workspace/chats/page.tsx`
- Larry commands already create agent runs and can create `project_create` actions.
  - `apps/api/src/routes/v1/larry.ts`
- Approved actions already execute real mutations for:
  - `task_create`
  - `status_update`
  - `project_create`
  - `email_draft`
  - `apps/api/src/routes/v1/actions.ts`
- The Action Centre already has source context plumbing from `agent_runs`, `canonical_events`, and meeting notes.
  - `apps/api/src/routes/v1/agent.ts`
  - `apps/web/src/app/workspace/actions/SourceContextCard.tsx`
- There is already a pattern for fire-and-forget AI follow-up after task creation that we can reuse as a model for prompt-driven task intake.
  - `apps/web/src/app/api/workspace/tasks/route.ts`

## Gaps To Close

### 1. Larry is not yet truly "inside every project"

- The shell currently routes Larry entry points to `/workspace/chats` instead of mounting the chat surface inside the active workspace.
  - `apps/web/src/app/workspace/WorkspaceShell.tsx`
- Project pages still render the legacy `ProjectWorkspace` surface without the new Larry panel mounted.
  - `apps/web/src/app/workspace/projects/[projectId]/ProjectPageClient.tsx`
  - `apps/web/src/components/dashboard/ProjectWorkspace.tsx`

### 2. Prompt-driven task execution is only partially productized

- The backend pipeline can already extract and execute actions, but the Larry command flow does not yet feel purpose-built for "create a task", "close this task", or "update this project from chat".
- `status_update` execution requires a resolvable `taskId`, so prompt-driven task closure needs stronger project context and task resolution than it has today.
  - `apps/api/src/routes/v1/actions.ts`
  - `apps/api/src/routes/v1/larry.ts`
  - `packages/ai/src/index.ts`

### 3. Action Centre clarity is good, but not yet decisive enough

- Source context exists, but the Action Centre still needs sharper action summaries and approval copy for:
  - task creation
  - task closure
  - task status updates
  - project creation
  - email draft execution
- The UI should make the post-approval outcome obvious before the user clicks.
  - `apps/web/src/app/workspace/actions/ActionCenterPage.tsx`
  - `apps/web/src/app/workspace/actions/SourceContextCard.tsx`

## Archive Notes Worth Carrying Forward

From `C:\Users\oreil\Downloads\Larry\Larry`:

- `General/ToDo.xlsx` still calls out:
  - "How to transfer existing projects into Larry"
  - "Is it possible to extract from a meeting?"
- The tech sheet in that same workbook marks "Wire approvals -> real task creation" as completed, which matches the current backend implementation.
- `Product/User Experience Story.xlsx` reinforces the core value proposition:
  - Larry extracts tasks from conversations
  - Larry keeps status accurate
  - Larry prepares follow-ups and escalations
  - humans stay focused on direction and approval, not coordination admin

That means the right near-term move is not inventing a new Larry concept. It is making the existing Larry loop visible and dependable everywhere in the workspace.

## Existing GitHub Issues Relevant To This Work

- Already satisfied by current code:
  - `#1 [P0] Wire approvals -> real task creation in DB`
  - `#6 [P1] Persistent Larry chat history -> wire useLarryChat.ts to conversations API`
- Still relevant and should remain open:
  - `#24 [P2] Chat-based project creation UI`
  - `#28 [P2] Existing project import flow (design / mockup for demo)`
- Not closed yet because the implementation is still split between legacy and new chat surfaces:
  - `#5 [P0] Wire Larry polling indicator in chat UI`

## Recommended Delivery Sequence

### Phase 1: Put Larry in the workspace shell

Outcome:
- Larry is reachable from every project page without leaving context.

Ship:
- Mount the modern Larry chat surface in `WorkspaceShell`.
- Auto-pass `projectIdFromPath` into Larry chat.
- Keep `/workspace/chats` as the full history page, but make the shell chat the default day-to-day entry point.
- Add a clear "continue in full chat" affordance if needed.

### Phase 2: Make prompt-driven task actions reliable

Outcome:
- Users can ask Larry to create or close tasks from project context.

Ship:
- Strengthen Larry command context with project task data, not just project summary counts.
- Resolve task closure requests into real `taskId`-backed `status_update` payloads.
- Keep high-confidence low-impact task creation auto-executed.
- Route ambiguous or high-impact requests into the Action Centre.

### Phase 3: Make Action Centre decisions obvious

Outcome:
- Users know exactly what approval will do.

Ship:
- Action titles that read like outcomes, not categories.
- Before/after payload previews where applicable.
- Approval CTA labels tied to the action:
  - `Create task`
  - `Mark complete`
  - `Create project`
  - `Send draft`
- Post-approval feedback and deep links to created entities.

### Phase 4: Verify the end-to-end loop

Outcome:
- Confidence that Larry works across the real workspace.

Ship:
- API tests for:
  - prompt -> action -> approve -> task create
  - prompt -> action -> approve -> task close
  - ambiguous prompt -> approval pending
- One UI check covering project-scoped chat from a project page into Action Centre refresh.

## Worker Prompt 1: Larry Everywhere In The Workspace

You own the Larry entry experience across workspace surfaces.

Scope:
- `apps/web/src/app/workspace/WorkspaceShell.tsx`
- `apps/web/src/app/workspace/LarryChat.tsx`
- `apps/web/src/app/workspace/useLarryChat.ts`
- `apps/web/src/app/workspace/chats/page.tsx`
- `apps/web/src/app/workspace/WorkspaceChromeContext.tsx`

Goal:
- Make Larry available from every project and major workspace page without forcing a route change to `/workspace/chats`.

Requirements:
- Mount the modern Larry chat panel in the workspace shell so it is available on home, project, meetings, documents, and my-work surfaces.
- Preserve automatic project scoping using the active `projectId` from the current route.
- Reuse the existing conversations API and do not create a second chat state model.
- Keep `/workspace/chats` as the richer history view, but make the shell entry feel first-class.
- Ensure a user opening Larry from a project sees obvious project context in the panel.
- If a draft message is pushed from elsewhere in the shell, it should appear in the active Larry composer without losing conversation history.

Non-goals:
- Do not change backend action execution rules.
- Do not redesign the Action Centre.

Verification:
- Open Larry from `/workspace`.
- Open Larry from `/workspace/projects/:id`.
- Confirm project-scoped conversations persist and reload.
- Confirm `larry:refresh-snapshot` behavior still works after sending a command.

Important:
- You are not alone in the codebase. Do not revert unrelated changes.
- Prefer integrating with the current workspace chat implementation instead of reviving older mock chat components.

## Worker Prompt 2: Prompt -> Task Execution Pipeline

You own the backend Larry command pipeline for prompt-driven task creation and task closure.

Scope:
- `apps/api/src/routes/v1/larry.ts`
- `apps/api/src/routes/v1/actions.ts`
- `packages/ai/src/index.ts`
- `apps/worker/src/lifecycle.ts`
- `apps/api/tests/*` as needed

Goal:
- Make Larry reliably turn project-scoped prompts into real `task_create` or `status_update` actions, auto-executing when policy allows and falling back to approval when confidence is low or task resolution is ambiguous.

Requirements:
- Improve Larry command context so the model can reason over the current project's live tasks, not just aggregate counts.
- Support prompts like:
  - "Create a task for the launch checklist to confirm pricing copy by Tuesday"
  - "Mark the security review as complete"
  - "Close the onboarding task for Alex"
- Ensure status/closure flows resolve to a real `taskId` before execution.
- Keep auto-execution only for low-risk, high-confidence actions.
- When Larry is not confident the task exists or should exist, create a pending approval item instead of silently executing.
- Return clearer response text from the Larry command route so the UI can tell the user whether the action was auto-executed or sent to the Action Centre.

Non-goals:
- Do not redesign the workspace chat UI.
- Do not rewrite Action Centre presentation.

Verification:
- Add tests for prompt -> task create -> executed or pending.
- Add tests for prompt -> task closure -> executed or pending.
- Add at least one ambiguous prompt test that remains approval-gated.

Important:
- You are not alone in the codebase. Do not revert unrelated changes.
- Prefer backward-compatible changes to the current command route and action schema.

## Worker Prompt 3: Action Centre Outcome Clarity

You own the Action Centre experience for Larry-created actions.

Scope:
- `apps/web/src/app/workspace/actions/ActionCenterPage.tsx`
- `apps/web/src/app/workspace/actions/SourceContextCard.tsx`
- `apps/web/src/app/dashboard/useActionCenter.ts`
- `apps/web/src/app/dashboard/types.ts`

Goal:
- Make every pending action unmistakably clear about what approval will do.

Requirements:
- Rewrite action summaries so they describe the exact outcome, not just the action type.
- Cover the important cases explicitly:
  - task creation
  - task closure / status update to completed
  - project creation
  - email draft send
  - follow-up send
- Show the key payload fields inline before approval:
  - task title
  - assignee
  - due date
  - target status
  - email recipient / subject
- Update CTA labels so they match the action:
  - `Create task`
  - `Mark complete`
  - `Create project`
  - `Send draft`
- If approval returns a `taskId`, `projectId`, or `draftId`, surface success feedback that confirms what was created or updated.

Non-goals:
- Do not change backend approval business logic.
- Do not change the chat shell.

Verification:
- Review at least one action row for each supported action type.
- Confirm approval removes the row and the UI communicates the concrete outcome.

Important:
- You are not alone in the codebase. Do not revert unrelated changes.
- Keep the UI grounded in the real payload and source data already returned by the API.

