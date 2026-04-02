# Task Center — Design Spec

## Problem

The Task Center tab in the project workspace shows a "coming in next phase" placeholder, even though the backend already has a full tasks table, API routes (`GET /v1/tasks`, `POST /v1/tasks`, `PATCH /v1/tasks/:id`), and the Overview tab already fetches and counts these tasks via `useProjectData`. Users cannot manually create or view tasks from the Task Center.

## Solution

Replace the Task Center placeholder with a standalone `TaskCenter` component that:
1. Renders tasks grouped into 4 collapsible status sections
2. Provides per-group inline row creation (Linear/Notion style)

## Architecture

**New file:** `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx`

Receives `tasks: WorkspaceTask[]`, `projectId: string`, `refresh: () => Promise<void>` as props from `ProjectWorkspaceView`. No new hooks or API routes needed — uses existing infrastructure.

## Status Groups

| Group | DB Statuses | Dot Colour | Default State |
|-------|------------|------------|---------------|
| Not Started | `backlog`, `not_started` | `#6c44f6` (purple) | Expanded |
| In Progress | `in_progress`, `waiting` | `#f59e0b` (amber) | Expanded |
| Blocked | `blocked` | `#ef4444` (red) | Expanded |
| Completed | `completed` | `#22c55e` (green) | Collapsed |

Each group shows a header with: collapse chevron, group name, task count badge, and "+ New task" button.

Empty groups still render with "(0)" count and the "+ New task" button.

## Inline Task Creation

- Click "+ New task" in any group → dashed-border row appears at the bottom of that group
- Title input is auto-focused
- Tab cycles through: title → priority dropdown → assignee dropdown → due date picker
- Enter saves (title required; priority defaults to "medium", assignee and date default to null)
- Esc cancels and removes the row
- The created task inherits the status of the group it was created in (e.g. creating in "In Progress" sends `status: "in_progress"`)
- After creation: calls `POST /v1/tasks` then `refresh()` to re-fetch all project data (keeps overview counts in sync)

## Task Row Layout

Each task row displays (left to right):
- Status dot (colour matches group)
- Title (flex: 1)
- Priority badge (Low=green, Medium=blue, High=amber, Critical=red)
- Assignee name or "—"
- Due date as "MMM DD" or "—"

## Priority Badge Colours

| Priority | Text | Background |
|----------|------|------------|
| Low | `#22c55e` | `rgba(34,197,94,0.1)` |
| Medium | `#3b82f6` | `rgba(59,130,246,0.1)` |
| High | `#f59e0b` | `rgba(245,158,11,0.1)` |
| Critical | `#ef4444` | `rgba(239,68,68,0.1)` |

## Empty State

When a project has zero tasks, show a centered empty state with:
- ListChecks icon (from lucide-react)
- "No tasks yet" heading
- "Create your first task to start tracking work for this project." subtitle
- "+ New task" button (CTA colour) that opens inline creation in a "Not Started" section

## Type Alignment

The frontend `TaskStatus` type (`not_started | on_track | at_risk | overdue | completed`) doesn't match the backend DB statuses (`backlog | not_started | in_progress | waiting | completed | blocked`). The Task Center component will work with the backend statuses directly since that's what `useProjectData` returns from the API. Group mapping logic uses the backend values.

## API Integration

- **Create task:** `POST /api/workspace/tasks` → proxied to `POST /v1/tasks` with body `{ projectId, title, priority, assigneeUserId?, dueDate?, status? }`
- **Refresh:** Call existing `refresh()` from `useProjectData` after creation
- **Team members for assignee dropdown:** Fetch from existing project collaborators data or `/api/workspace/projects/[id]/team`

## Styling

Uses existing CSS variables: `--surface`, `--surface-2`, `--border`, `--border-2`, `--text-1`, `--text-2`, `--text-muted`, `--text-disabled`, `--cta`, `--radius-card`. No new CSS tokens needed.

## Scope

- Task Center tab only. Timeline, Files, and Settings remain as placeholders.
- No drag-and-drop reordering.
- No task detail/edit view (future work).
- No bulk operations.
