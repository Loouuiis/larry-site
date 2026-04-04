# Task Center Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task rows in TaskCenter fully interactive with inline editing for title, status, priority, assignee, and an expandable description area.

**Architecture:** All changes are in `TaskCenter.tsx`. Each field saves independently via PATCH. Expand chevron toggles a description textarea below each row. Dropdowns use a transparent backdrop overlay for click-outside dismissal. No new files or backend changes needed.

**Tech Stack:** React, Next.js, Lucide icons, existing CSS custom properties (`--surface`, `--border`, `--text-1`, etc.)

**Note:** The web app has no test framework (no vitest/jest). Steps include build verification and manual checks instead of unit tests.

---

### Task 1: Add state variables, constants, and PATCH helper

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx:1-110`

- [ ] **Step 1: Add status constants after PRIORITY_COLOURS (line 55)**

Insert after the `PRIORITY_COLOURS` block:

```tsx
const STATUS_DOT_COLOURS: Record<string, string> = {
  backlog: "#6c44f6",
  not_started: "#6c44f6",
  in_progress: "#f59e0b",
  waiting: "#f59e0b",
  blocked: "#ef4444",
  completed: "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
};

const ALL_STATUSES = ["backlog", "not_started", "in_progress", "waiting", "blocked", "completed"];
```

- [ ] **Step 2: Add new state variables inside the component (after line 108, after `titleInputRef`)**

```tsx
  /* ── inline editing state ─────────────────────────────── */

  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<{ taskId: string; field: "status" | "priority" | "assignee" } | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null);
```

- [ ] **Step 3: Add the patchTask helper and toggle functions (after the `cancelCreating` function, before `saveTask`)**

Insert after `cancelCreating` (line 154) and before `saveTask` (line 156):

```tsx
  const patchTask = async (taskId: string, patch: Record<string, unknown>) => {
    const fieldKey = `${taskId}-${Object.keys(patch)[0]}`;
    setSavingField(fieldKey);
    try {
      const res = await fetch(`/api/workspace/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) console.error("Failed to update task:", res.status);
      await refresh();
    } catch (err) {
      console.error("Error updating task:", err);
    } finally {
      setSavingField(null);
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build` (or `npm run build`)
Expected: Build succeeds with no errors. New state variables and helpers are unused warnings only.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add inline editing state and PATCH helper"
```

---

### Task 2: Add expand chevron and description area

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — task row rendering (lines 336-403)

- [ ] **Step 1: Wrap each task row in a container div and add the expand chevron**

Replace the task row `map` block (the `<div key={task.id} ...>` including its children, lines 341-400) with:

```tsx
                    <div key={task.id}>
                      {/* ── main row ─────────────────── */}
                      <div
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={{
                          borderBottom: expandedTasks[task.id] ? "none" : "1px solid var(--border)",
                          cursor: "default",
                          transition: "background 120ms ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                      >
                        {/* expand chevron */}
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="flex items-center justify-center"
                          style={{
                            width: 20,
                            height: 20,
                            flexShrink: 0,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            borderRadius: 4,
                            transition: "background 120ms ease",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                        >
                          {expandedTasks[task.id]
                            ? <ChevronDown size={14} />
                            : <ChevronRight size={14} />}
                        </button>

                        {/* status dot */}
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: group.dotColour,
                            flexShrink: 0,
                          }}
                        />

                        {/* title */}
                        <span
                          className="flex-1 truncate text-[13px]"
                          style={{ color: "var(--text-1)" }}
                        >
                          {task.title}
                        </span>

                        {/* priority badge */}
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            color: pri.fg,
                            background: pri.bg,
                            flexShrink: 0,
                          }}
                        >
                          {capitalize(task.priority)}
                        </span>

                        {/* assignee */}
                        <span
                          className="w-[100px] truncate text-right text-[12px]"
                          style={{ color: task.assigneeName ? "var(--text-2)" : "var(--text-disabled)", flexShrink: 0 }}
                        >
                          {task.assigneeName ?? "\u2014"}
                        </span>

                        {/* due date */}
                        <span
                          className="w-[60px] text-right text-[12px]"
                          style={{ color: task.dueDate ? "var(--text-2)" : "var(--text-disabled)", flexShrink: 0 }}
                        >
                          {formatDueDate(task.dueDate)}
                        </span>
                      </div>

                      {/* ── expanded description ─────── */}
                      {expandedTasks[task.id] && (
                        <div
                          style={{
                            padding: "8px 16px 12px 52px",
                            borderBottom: "1px solid var(--border)",
                            background: "rgba(108,68,246,0.02)",
                          }}
                        >
                          <textarea
                            value={descriptions[task.id] ?? task.description ?? ""}
                            onChange={(e) =>
                              setDescriptions((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const val = descriptions[task.id];
                              if (val !== undefined && val !== (task.description ?? "")) {
                                void patchTask(task.id, { description: val });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setDescriptions((prev) => {
                                  const next = { ...prev };
                                  delete next[task.id];
                                  return next;
                                });
                                (e.target as HTMLTextAreaElement).blur();
                              }
                            }}
                            placeholder="Add a description..."
                            maxLength={4000}
                            rows={3}
                            className="w-full text-[13px] outline-none resize-none transition-colors"
                            style={{
                              background: "var(--surface)",
                              border: "1px dashed var(--border-2)",
                              borderRadius: 6,
                              color: "var(--text-2)",
                              padding: "8px 12px",
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.borderStyle = "solid"; }}
                            onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.borderStyle = "dashed"; }}
                          />
                        </div>
                      )}
                    </div>
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Open a project with tasks. Each row should have a small chevron on the left. Clicking it expands a description textarea below the row. Typing and clicking away saves the description via PATCH. Pressing Esc reverts.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add expand chevron and description area"
```

---

### Task 3: Inline title editing

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — title span in the task row

- [ ] **Step 1: Replace the title span with an editable title**

Replace the title section in the task row (the `{/* title */}` comment and its `<span>`) with:

```tsx
                        {/* title — click to edit */}
                        {editingTitle === task.id ? (
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            onBlur={() => {
                              if (editTitleValue.trim() && editTitleValue.trim() !== task.title) {
                                void patchTask(task.id, { title: editTitleValue.trim() });
                              }
                              setEditingTitle(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                              if (e.key === "Escape") {
                                setEditingTitle(null);
                              }
                            }}
                            autoFocus
                            className="flex-1 text-[13px] outline-none"
                            style={{
                              color: "var(--text-1)",
                              background: "var(--surface)",
                              border: "1px solid var(--brand)",
                              borderRadius: 4,
                              padding: "2px 6px",
                              minWidth: 0,
                            }}
                          />
                        ) : (
                          <span
                            className="flex-1 truncate text-[13px]"
                            style={{
                              color: "var(--text-1)",
                              cursor: "pointer",
                              borderRadius: 4,
                              padding: "2px 6px",
                              transition: "background 120ms ease",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTitle(task.id);
                              setEditTitleValue(task.title);
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                          >
                            {task.title}
                          </span>
                        )}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Click a task title — it becomes an input. Type a new title and press Enter or click away — title updates. Press Esc — reverts to original. Empty title is rejected (original preserved).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add inline title editing"
```

---

### Task 4: Status dropdown on status dot

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — status dot in the task row

- [ ] **Step 1: Replace the status dot span with a clickable button + dropdown**

Replace the `{/* status dot */}` section in the task row with:

```tsx
                        {/* status dot — click for dropdown */}
                        <div className="relative" style={{ flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "status"
                                  ? null
                                  : { taskId: task.id, field: "status" }
                              );
                            }}
                            style={{
                              width: 20,
                              height: 20,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              borderRadius: 4,
                              transition: "background 120ms ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: STATUS_DOT_COLOURS[task.status] ?? group.dotColour,
                              }}
                            />
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "status" && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="absolute left-0 top-full z-50 mt-1 overflow-hidden"
                                style={{
                                  minWidth: 160,
                                  borderRadius: "var(--radius-dropdown, 8px)",
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "var(--shadow-2)",
                                }}
                              >
                                {ALL_STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdown(null);
                                      if (s !== task.status) {
                                        void patchTask(task.id, { status: s });
                                      }
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors"
                                    style={{
                                      borderBottom: "1px solid var(--border)",
                                      color: "var(--text-1)",
                                      background: s === task.status ? "var(--surface-2)" : "transparent",
                                      cursor: "pointer",
                                      border: "none",
                                      borderBlockEnd: "1px solid var(--border)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = s === task.status ? "var(--surface-2)" : ""; }}
                                  >
                                    <span
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: STATUS_DOT_COLOURS[s] ?? "#888",
                                        flexShrink: 0,
                                      }}
                                    />
                                    {STATUS_LABELS[s] ?? s}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Click the status dot on any task. A dropdown appears with all 6 statuses, each with a colored dot. Selecting a different status saves via PATCH and the task moves to the correct group on refresh. Clicking outside closes the dropdown.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add status dropdown on status dot"
```

---

### Task 5: Priority dropdown on priority badge

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — priority badge in the task row

- [ ] **Step 1: Replace the priority badge with a clickable badge + dropdown**

Replace the `{/* priority badge */}` section in the task row with:

```tsx
                        {/* priority badge — click for dropdown */}
                        <div className="relative" style={{ flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "priority"
                                  ? null
                                  : { taskId: task.id, field: "priority" }
                              );
                            }}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              color: pri.fg,
                              background: pri.bg,
                              cursor: "pointer",
                              border: "none",
                              transition: "opacity 120ms ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                          >
                            {capitalize(task.priority)}
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "priority" && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="absolute right-0 top-full z-50 mt-1 overflow-hidden"
                                style={{
                                  minWidth: 130,
                                  borderRadius: "var(--radius-dropdown, 8px)",
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "var(--shadow-2)",
                                }}
                              >
                                {(["low", "medium", "high", "critical"] as const).map((p) => {
                                  const pc = PRIORITY_COLOURS[p];
                                  return (
                                    <button
                                      key={p}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdown(null);
                                        if (p !== task.priority) {
                                          void patchTask(task.id, { priority: p });
                                        }
                                      }}
                                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors"
                                      style={{
                                        color: "var(--text-1)",
                                        background: p === task.priority ? "var(--surface-2)" : "transparent",
                                        cursor: "pointer",
                                        border: "none",
                                        borderBlockEnd: "1px solid var(--border)",
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = p === task.priority ? "var(--surface-2)" : ""; }}
                                    >
                                      <span
                                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                        style={{ color: pc.fg, background: pc.bg }}
                                      >
                                        {capitalize(p)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Click a priority badge. Dropdown shows all 4 priorities with colored pills. Selecting a different priority saves via PATCH. Badge updates on refresh.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add priority dropdown on badge"
```

---

### Task 6: Assignee dropdown

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — assignee span in the task row

- [ ] **Step 1: Replace the assignee span with a clickable element + dropdown**

Replace the `{/* assignee */}` section in the task row with:

```tsx
                        {/* assignee — click for dropdown */}
                        <div className="relative" style={{ flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "assignee"
                                  ? null
                                  : { taskId: task.id, field: "assignee" }
                              );
                            }}
                            className="w-[100px] truncate text-right text-[12px]"
                            style={{
                              color: task.assigneeName ? "var(--text-2)" : "var(--text-disabled)",
                              cursor: "pointer",
                              background: "transparent",
                              border: "none",
                              borderRadius: 4,
                              padding: "2px 6px",
                              transition: "background 120ms ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                          >
                            {task.assigneeName ?? "\u2014"}
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "assignee" && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="absolute right-0 top-full z-50 mt-1 overflow-hidden"
                                style={{
                                  minWidth: 180,
                                  maxHeight: 240,
                                  overflowY: "auto",
                                  borderRadius: "var(--radius-dropdown, 8px)",
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "var(--shadow-2)",
                                }}
                              >
                                {/* Unassign option */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDropdown(null);
                                    if (task.assigneeUserId) {
                                      void patchTask(task.id, { assigneeUserId: null });
                                    }
                                  }}
                                  className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                                  style={{
                                    color: "var(--text-disabled)",
                                    background: !task.assigneeUserId ? "var(--surface-2)" : "transparent",
                                    cursor: "pointer",
                                    border: "none",
                                    borderBlockEnd: "1px solid var(--border)",
                                    fontStyle: "italic",
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = !task.assigneeUserId ? "var(--surface-2)" : ""; }}
                                >
                                  Unassign
                                </button>
                                {members.map((m) => (
                                  <button
                                    key={m.userId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdown(null);
                                      if (m.userId !== task.assigneeUserId) {
                                        void patchTask(task.id, { assigneeUserId: m.userId });
                                      }
                                    }}
                                    className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                                    style={{
                                      color: "var(--text-1)",
                                      background: m.userId === task.assigneeUserId ? "var(--surface-2)" : "transparent",
                                      cursor: "pointer",
                                      border: "none",
                                      borderBlockEnd: "1px solid var(--border)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = m.userId === task.assigneeUserId ? "var(--surface-2)" : ""; }}
                                  >
                                    {m.name}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Click an assignee name (or the dash). Dropdown shows all project members plus "Unassign". Current assignee is highlighted. Selecting a member saves via PATCH. Selecting "Unassign" clears the assignee.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add assignee dropdown"
```

---

### Task 7: Add description textarea to inline creation form

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — inline creation section (lines 405-551)

- [ ] **Step 1: Add description state variable**

Add to the existing inline creation state block (after `newDueDate` state, line 106):

```tsx
  const [newDescription, setNewDescription] = useState("");
```

- [ ] **Step 2: Reset description in `startCreating` and `cancelCreating`**

In `startCreating` (line 139), add after `setNewDueDate("")`:
```tsx
    setNewDescription("");
```

In `cancelCreating` (line 148), add after `setNewDueDate("")`:
```tsx
    setNewDescription("");
```

- [ ] **Step 3: Include description in the saveTask POST body**

In `saveTask`, after the line `if (newDueDate) body.dueDate = newDueDate;` (line 166), add:

```tsx
      if (newDescription.trim()) body.description = newDescription.trim();
```

- [ ] **Step 4: Add the textarea to the creation row**

Insert after the closing `</div>` of the inline creation field row (after line 516, the `</div>` that closes the dashed-border row) and before the keyboard hints `<div>` (line 518):

```tsx
                {/* description for new task */}
                <div style={{ padding: "4px 16px 0" }}>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelCreating(); }}
                    disabled={saving}
                    placeholder="Add a description (optional)..."
                    maxLength={4000}
                    rows={2}
                    className="w-full text-[12px] outline-none resize-none transition-colors"
                    style={{
                      background: "var(--surface)",
                      border: "1px dashed var(--border-2)",
                      borderRadius: 6,
                      color: "var(--text-2)",
                      padding: "6px 10px",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.borderStyle = "solid"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.borderStyle = "dashed"; }}
                  />
                </div>
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds.

- [ ] **Step 6: Manual verification**

Click "+ New task". Below the title/priority/assignee/date row, a description textarea appears. Fill it in, press Enter or click Create. The task is created with the description. Expand the task to confirm the description was saved.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(tasks): add description to inline creation form"
```

---

### Task 8: Final build verification and manual test pass

- [ ] **Step 1: Full build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual test checklist**

Open a project with tasks and verify each interaction:

1. **Expand chevron** — click opens description area, click again closes it
2. **Description** — type in description, blur saves, Esc reverts
3. **Title** — click to edit, Enter saves, Esc cancels, empty rejected
4. **Status dot** — click opens dropdown, select status saves and moves task to correct group
5. **Priority badge** — click opens dropdown, select priority saves and updates badge color
6. **Assignee** — click opens dropdown, select member saves, "Unassign" clears
7. **Create with description** — new task form includes description textarea
8. **Multiple dropdowns** — opening one dropdown closes any other open dropdown (handled by single `openDropdown` state)

- [ ] **Step 3: Commit any cleanup if needed**
