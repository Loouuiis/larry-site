"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CategorySwatchPicker, DEFAULT_SWATCH_HEX } from "./CategorySwatchPicker";

type Mode = "category" | "project" | "task" | "subtask";

interface Props {
  mode: Mode;
  parentProjectId?: string;   // for task
  parentTaskId?: string;      // for subtask
  parentCategoryId?: string;  // for project AND subcategory (category-nested-under-category)
  taskCategoryId?: string;    // for task mode: assigns the new task to this project-scoped category
  scopedProjectId?: string;   // v4 — for category mode: creates a project-scoped category
  // v4 bug #7 — when creating a task FROM the Timeline, both dates must be set
  // or the task would be filtered out of the Gantt anyway (server excludes
  // null-date tasks). Tells the modal to show both fields, block submit until
  // both are filled, and show a helper explaining why.
  requireDates?: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box",
};

export function AddNodeModal({
  mode, parentProjectId, parentTaskId, parentCategoryId, taskCategoryId, scopedProjectId,
  requireDates = false,
  onClose, onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [colour, setColour] = useState<string>(DEFAULT_SWATCH_HEX);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [descOpen, setDescOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const isTaskMode = mode === "task" || mode === "subtask";
  const datesMissing = requireDates && isTaskMode && (!startDate || !dueDate);
  const canSubmit = title.trim().length > 0 && !saving && !datesMissing;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true); setErr(null);
    try {
      if (mode === "category") {
        const payload: Record<string, unknown> = { name: title.trim(), colour };
        // parentCategoryId → subcategory nested under another category.
        // scopedProjectId  → category scoped to a specific project.
        // API enforces single-parent (only one of parentCategoryId / projectId non-null).
        if (parentCategoryId) payload.parentCategoryId = parentCategoryId;
        else if (scopedProjectId) payload.projectId = scopedProjectId;
        const res = await fetch("/api/workspace/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else if (mode === "project") {
        const res = await fetch("/api/workspace/projects", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: title.trim(), categoryId: parentCategoryId ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else if (mode === "task" || mode === "subtask") {
        const body: Record<string, unknown> = {
          projectId: parentProjectId, title: title.trim(),
        };
        if (startDate) body.startDate = startDate;
        if (dueDate) body.dueDate = dueDate;
        if (description.trim()) body.description = description.trim();
        if (mode === "subtask") body.parentTaskId = parentTaskId;
        if (mode === "task" && taskCategoryId) body.categoryId = taskCategoryId;
        const res = await fetch("/api/workspace/tasks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const label =
    mode === "category"
      ? (parentCategoryId ? "New subcategory" : scopedProjectId ? "New category in project" : "New category")
      : mode === "project" ? "New project"
      : mode === "task" ? "New task"
      : "New subtask";

  const placeholder =
    mode === "category"
      ? (parentCategoryId ? "Subcategory name..." : "Category name...")
      : mode === "project" ? "Project name..."
      : "Task title...";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: "var(--surface, #fff)", border: "1px solid var(--border, #eaeaea)", borderRadius: 12, padding: 24, width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{label}</h3>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, cursor: "pointer", color: "var(--text-muted)" }}><X size={14} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>Name *</p>
            <input
              ref={titleRef} type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
          {mode === "category" && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>Colour</p>
              <CategorySwatchPicker value={colour} onChange={setColour} />
            </div>
          )}
          {isTaskMode && (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>
                    Start date{requireDates ? " *" : ""}
                  </p>
                  <input
                    type="date" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>
                    Due date{requireDates ? " *" : ""}
                  </p>
                  <input
                    type="date" value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setDescOpen((v) => !v)}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {descOpen ? "− Description" : "+ Add description"}
                </button>
                {descOpen && (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this task cover? (optional)"
                    rows={3}
                    maxLength={4000}
                    style={{ ...inputStyle, resize: "vertical", marginTop: 6 }}
                  />
                )}
              </div>
              {requireDates && datesMissing && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                  Timeline tasks need both a start date and a due date. Without them the bar has nothing to anchor to, so the task would stay invisible on the Timeline.
                </p>
              )}
            </>
          )}
          {err && <p style={{ color: "#e84c6f", fontSize: 12, margin: 0 }}>{err}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => void handleSave()} disabled={!canSubmit} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: canSubmit ? 1 : 0.5 }}>
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
