# Task Center: Inline Editing & Expandable Description

**Date:** 2026-04-04
**Status:** Approved
**Scope:** `TaskCenter.tsx` component, inline creation form, PATCH integration

---

## Problem

Task rows in TaskCenter are completely static. Users cannot:
- Mark tasks as done or incomplete
- Edit the task title
- Change who is assigned
- Change priority
- View or edit a description
- Add a description when creating a task

The TaskDetailDrawer exists but is not used in TaskCenter. Instead of wiring the drawer, we adopt **inline editing** (Linear-style) for a more polished, fluid experience.

---

## Design

### Task Row Layout

```
[▶ chevron] [● status dot] [title]  [priority badge] [assignee] [due date]
```

Each field (except due date) is independently editable inline:

| Field | Trigger | Edit Mode | Save |
|-------|---------|-----------|------|
| **Status dot** | Click | Dropdown: backlog, not_started, in_progress, waiting, blocked, completed | On selection → PATCH status |
| **Title** | Click | Inline text input replacing the span | Enter or blur → PATCH title. Esc → cancel |
| **Priority** | Click badge | Dropdown: low, medium, high, critical | On selection → PATCH priority |
| **Assignee** | Click name/dash | Dropdown: project members + "Unassign" | On selection → PATCH assigneeUserId |
| **Due date** | Read-only | — | — |

### Expand Chevron & Description

- A small chevron (`ChevronRight` / `ChevronDown`) on the far left of each task row.
- Click toggles an **expanded area** below the row.
- Expanded area contains a `textarea` for description:
  - Placeholder: "Add a description..."
  - Max 4000 characters (matches backend validation)
  - Loads current description from `task.description`
  - Saves on blur via PATCH. Esc cancels edits.
  - Subtle dashed border, slight background tint (matching the creation row style).

### Inline Creation (Updated)

Add a description `textarea` to the existing inline creation row, between the field row and the Save/Cancel buttons:
- Placeholder: "Add a description..."
- Optional field, not required
- Sent as `description` in the POST body (already supported by API schema)

### Hover Affordance

Editable fields show visual cues on hover:
- `cursor: pointer`
- Subtle background highlight or underline
- 120ms transition
- Minimum 28px effective click height per field for comfortable interaction

### Save Behavior

- Each field saves independently via `PATCH /api/workspace/tasks/{id}` with only the changed field.
- On success: update local state optimistically, then `refresh()` to sync.
- On error: revert to previous value, log error to console.
- No global "Save" button — edits feel instant.

### Status Dropdown

The status dropdown uses colored dots matching the existing group colours:
- `#6c44f6` — backlog, not_started
- `#f59e0b` — in_progress, waiting
- `#ef4444` — blocked
- `#22c55e` — completed

Selecting "completed" marks the task done. Selecting any other status marks it incomplete. After status change, task moves to the appropriate group on next refresh.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` | Add inline editing, expand/collapse, description area, updated creation form |

No backend changes needed — all PATCH fields (title, description, status, priority, assigneeUserId) are already supported.

---

## API Contracts (existing, no changes)

**PATCH** `/api/workspace/tasks/{id}` — accepts any combination of:
```json
{
  "title": "string (1-300)",
  "description": "string (0-4000)",
  "status": "backlog|not_started|in_progress|waiting|completed|blocked",
  "progressPercent": "0-100",
  "dueDate": "YYYY-MM-DD",
  "assigneeUserId": "uuid | null"
}
```

**POST** `/api/workspace/tasks` — already accepts `description` (optional, max 4000).

---

## UX Guidelines Applied

- **Touch targets**: Editable fields have minimum 28px effective height, dropdowns use comfortable padding
- **Hover affordance**: `cursor: pointer` + subtle background transition (120ms)
- **Loading feedback**: Disabled state during save operations
- **Error placement**: Console log only (field reverts silently — matches Linear behavior)
- **Animation**: Expand/collapse uses 150ms ease-out transition
- **Accessibility**: Dropdowns are keyboard-navigable (Enter to open, arrow keys, Esc to close)
- **No emoji icons**: Using Lucide `ChevronRight`/`ChevronDown` for expand toggle
