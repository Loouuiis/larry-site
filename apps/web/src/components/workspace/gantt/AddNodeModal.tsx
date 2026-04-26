"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CategorySwatchPicker, DEFAULT_SWATCH_HEX } from "./CategorySwatchPicker";
import type { AvailableTask, DependencyType, TaskDependency } from "./gantt-types";

type Mode = "category" | "project" | "task" | "subtask";
type Priority = "low" | "medium" | "high" | "critical";

interface Props {
  mode: Mode;
  parentProjectId?: string;
  parentTaskId?: string;
  parentCategoryId?: string;
  taskCategoryId?: string;
  scopedProjectId?: string;
  requireDates?: boolean;
  availableTasks?: AvailableTask[];
  onClose: () => void;
  onCreated: (newTaskId?: string) => Promise<void> | void;
  onDependencyCreated?: (taskId: string, dep: TaskDependency) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text-1)",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1,
  color: "var(--text-muted)", margin: 0, marginBottom: 6,
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#8db2ff",
  medium: "#fbe187",
  high: "#f67a79",
  critical: "#e84c6f",
};

const DEP_LABELS: Record<DependencyType, string> = {
  FS: "Finish → Start",
  FF: "Finish → Finish",
  SS: "Start → Start",
  SF: "Start → Finish",
};

const DEP_DESC: Record<DependencyType, { predVerb: string; succVerb: string }> = {
  FS: { predVerb: "finishes", succVerb: "can start" },
  FF: { predVerb: "finishes", succVerb: "can finish" },
  SS: { predVerb: "starts",   succVerb: "can start" },
  SF: { predVerb: "starts",   succVerb: "can finish" },
};

function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeAutoFill(
  predId: string,
  type: DependencyType,
  offsetDays: number,
  tasks: AvailableTask[],
): { startDate: string; dueDate: string } {
  const pred = tasks.find((t) => t.id === predId);
  const result = { startDate: "", dueDate: "" };
  if (!pred) return result;
  const predEnd   = pred.endDate;
  const predStart = pred.startDate;
  switch (type) {
    case "FS": if (predEnd)   result.startDate = isoAddDays(predEnd,   offsetDays); break;
    case "FF": if (predEnd)   result.dueDate   = isoAddDays(predEnd,   offsetDays); break;
    case "SS": if (predStart) result.startDate = isoAddDays(predStart, offsetDays); break;
    case "SF": if (predStart) result.dueDate   = isoAddDays(predStart, offsetDays); break;
  }
  return result;
}

export function AddNodeModal({
  mode, parentProjectId, parentTaskId: presetParentTaskId, parentCategoryId,
  taskCategoryId, scopedProjectId,
  requireDates = false,
  availableTasks = [],
  onClose, onCreated, onDependencyCreated,
}: Props) {
  const [title, setTitle]           = useState("");
  const [colour, setColour]         = useState<string>(DEFAULT_SWATCH_HEX);
  const [startDate, setStartDate]   = useState("");
  const [dueDate, setDueDate]       = useState("");
  const [priority, setPriority]     = useState<Priority>("medium");
  const [description, setDescription] = useState("");
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [dateErr, setDateErr]       = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [members, setMembers]       = useState<Array<{ id: string; name: string }>>([]);

  const [selectedParentTaskId, setSelectedParentTaskId] = useState<string>(presetParentTaskId ?? "");

  const [depOpen, setDepOpen]       = useState(false);
  const [depPredId, setDepPredId]   = useState<string>("");
  const [depType, setDepType]       = useState<DependencyType>("FS");
  const [depOffset, setDepOffset]   = useState(0);
  const [depAutoFilled, setDepAutoFilled] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const isTaskMode = mode === "task" || mode === "subtask";

  useEffect(() => {
    if (!isTaskMode) return;
    let cancelled = false;
    fetch("/api/workspace/members")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { members: Array<{ id: string; name: string }> }) => {
        if (!cancelled) setMembers(d.members ?? []);
      })
      .catch(() => { /* silently skip assignee list on error */ });
    return () => { cancelled = true; };
  }, [isTaskMode]);
  const datesMissing = requireDates && isTaskMode && (!startDate || !dueDate);
  const canSubmit = title.trim().length > 0 && !saving && !datesMissing && !dateErr;

  // Validate that due date is not before start date.
  useEffect(() => {
    if (!startDate || !dueDate) { setDateErr(null); return; }
    setDateErr(dueDate < startDate ? "Due date cannot be before the start date." : null);
  }, [startDate, dueDate]);

  // Dependency candidates: when a parent is chosen, restrict to siblings inside it.
  const depCandidates = selectedParentTaskId
    ? availableTasks.filter((t) => t.parentTaskId === selectedParentTaskId)
    : availableTasks;

  // Auto-fill dates from dependency; clear the field the type doesn't control.
  useEffect(() => {
    if (!depOpen || !depPredId) return;
    const filled = computeAutoFill(depPredId, depType, depOffset, availableTasks);
    if (filled.startDate) setStartDate(filled.startDate);
    if (filled.dueDate)   setDueDate(filled.dueDate);
    // Clear the field this dep type doesn't drive.
    if (depType === "SF" || depType === "FF") setStartDate("");
    if (depType === "FS" || depType === "SS") setDueDate("");
    setDepAutoFilled(!!(filled.startDate || filled.dueDate));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depPredId, depType, depOffset, depOpen]);

  // If parent changes, reset any dep predecessor that is no longer in scope.
  useEffect(() => {
    if (depPredId && !depCandidates.some((t) => t.id === depPredId)) {
      setDepPredId("");
      setDepAutoFilled(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentTaskId]);

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true); setErr(null);
    try {
      if (mode === "category") {
        const payload: Record<string, unknown> = { name: title.trim(), colour };
        if (parentCategoryId) payload.parentCategoryId = parentCategoryId;
        else if (scopedProjectId) payload.projectId = scopedProjectId;
        const res = await fetch("/api/workspace/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await onCreated();
      } else if (mode === "project") {
        const res = await fetch("/api/workspace/projects", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: title.trim(), categoryId: parentCategoryId ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await onCreated();
      } else {
        const body: Record<string, unknown> = {
          projectId: parentProjectId,
          title: title.trim(),
          priority,
        };
        if (startDate) body.startDate = startDate;
        if (dueDate)   body.dueDate   = dueDate;
        if (description.trim()) body.description = description.trim();
        const effectiveParentId = selectedParentTaskId || presetParentTaskId;
        if (effectiveParentId) body.parentTaskId = effectiveParentId;
        if (mode === "task" && taskCategoryId) body.categoryId = taskCategoryId;
        if (assigneeUserId) body.assigneeUserId = assigneeUserId;

        const res = await fetch("/api/workspace/tasks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as { error?: string; message?: string };
          throw new Error(errBody.error ?? errBody.message ?? `HTTP ${res.status}`);
        }
        const created = await res.json() as { id?: string };
        const newId = created.id;

        if (newId && depOpen && depPredId && onDependencyCreated) {
          onDependencyCreated(newId, { dependsOnId: depPredId, type: depType, offsetDays: depOffset });
        }
        await onCreated(newId);
      }
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
      : mode === "task"    ? "New task"
      : "New subtask";

  const placeholder =
    mode === "category"
      ? (parentCategoryId ? "Subcategory name..." : "Category name...")
      : mode === "project" ? "Project name..."
      : "Task title...";

  const selectedPred = availableTasks.find((t) => t.id === depPredId);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative", background: "var(--surface, #fff)",
        border: "1px solid var(--border, #eaeaea)", borderRadius: 12, padding: 24,
        width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{label}</h3>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name */}
          <div>
            <p style={fieldLabelStyle}>Name *</p>
            <input
              ref={titleRef} type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>

          {/* Category colour */}
          {mode === "category" && (
            <div>
              <p style={fieldLabelStyle}>Colour</p>
              <CategorySwatchPicker value={colour} onChange={setColour} />
            </div>
          )}

          {/* ── Task-specific fields ────────────────────────── */}
          {isTaskMode && (
            <>
              {/* Priority */}
              <div>
                <p style={fieldLabelStyle}>Priority</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["low", "medium", "high", "critical"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      style={{
                        flex: 1,
                        padding: "6px 0",
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 6,
                        border: priority === p
                          ? `2px solid ${PRIORITY_COLORS[p]}`
                          : "2px solid var(--border)",
                        background: priority === p
                          ? `${PRIORITY_COLORS[p]}22`
                          : "var(--surface-2)",
                        color: priority === p ? PRIORITY_COLORS[p] : "var(--text-muted)",
                        cursor: "pointer",
                        transition: "all 150ms ease",
                      }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <div>
                <p style={fieldLabelStyle}>Assignee <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></p>
                <select value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)} style={selectStyle}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {/* Parent task picker */}
              {availableTasks.length > 0 && (
                <div>
                  <p style={fieldLabelStyle}>
                    Parent task{" "}
                    <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </p>
                  <select
                    value={selectedParentTaskId}
                    onChange={(e) => setSelectedParentTaskId(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">None — top-level task</option>
                    {availableTasks
                      .filter((t) => t.parentTaskId === null)
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.number}. {t.title}</option>
                      ))}
                  </select>
                  {selectedParentTaskId && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                      Will appear indented under task #{availableTasks.find((t) => t.id === selectedParentTaskId)?.number}.
                    </p>
                  )}
                </div>
              )}

              {/* Dates */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={fieldLabelStyle}>Start date{requireDates ? " *" : ""}</p>
                  <input
                    type="date" value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setDepAutoFilled(false); }}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={fieldLabelStyle}>Due date{requireDates ? " *" : ""}</p>
                  <input
                    type="date" value={dueDate}
                    min={startDate || undefined}
                    onChange={(e) => { setDueDate(e.target.value); setDepAutoFilled(false); }}
                    style={{
                      ...inputStyle,
                      borderColor: dateErr ? "#e84c6f" : undefined,
                    }}
                  />
                </div>
              </div>

              {dateErr && (
                <p style={{ fontSize: 11, color: "#e84c6f", margin: 0 }}>{dateErr}</p>
              )}

              {depAutoFilled && !dateErr && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                  Dates auto-filled from dependency — edit above to override.
                  On the Gantt the dependency will enforce these dates dynamically.
                </p>
              )}

              {requireDates && datesMissing && !dateErr && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                  Timeline tasks need both a start date and a due date — without them the bar has nothing to anchor to.
                </p>
              )}

              {/* Description — always visible */}
              <div>
                <p style={fieldLabelStyle}>Description <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this task cover?"
                  rows={3}
                  maxLength={4000}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {/* Dependencies — only available when a parent task is chosen, so the
                  predecessor is scoped to siblings and orphaned cross-parent arrows
                  cannot be created. */}
              {availableTasks.length > 0 && (
                <div>
                  {!selectedParentTaskId ? (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                      Select a parent task above to add a dependency.
                    </p>
                  ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDepOpen((v) => !v);
                      if (depOpen) { setDepPredId(""); setDepAutoFilled(false); }
                    }}
                    style={{ background: "transparent", border: 0, padding: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    {depOpen ? "− Remove dependency" : "+ Add dependency"}
                  </button>
                  )}

                  {selectedParentTaskId && depOpen && (
                    <div style={{ marginTop: 10, padding: 12, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <p style={{ ...fieldLabelStyle, marginBottom: 4 }}>Predecessor task</p>
                        {depCandidates.length === 0 ? (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                            {selectedParentTaskId
                              ? "No existing subtasks under this parent to depend on yet."
                              : "No tasks available."}
                          </p>
                        ) : (
                          <select value={depPredId} onChange={(e) => setDepPredId(e.target.value)} style={selectStyle}>
                            <option value="">Choose predecessor…</option>
                            {depCandidates.map((t) => (
                              <option key={t.id} value={t.id}>{t.number}. {t.title}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {depPredId && (
                        <>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 2 }}>
                              <p style={{ ...fieldLabelStyle, marginBottom: 4 }}>Type</p>
                              <select value={depType} onChange={(e) => setDepType(e.target.value as DependencyType)} style={selectStyle}>
                                {(["FS", "FF", "SS", "SF"] as DependencyType[]).map((t) => (
                                  <option key={t} value={t}>{DEP_LABELS[t]}</option>
                                ))}
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ ...fieldLabelStyle, marginBottom: 4 }}>Offset (days)</p>
                              <input type="number" value={depOffset}
                                onChange={(e) => setDepOffset(Number(e.target.value))}
                                min={-999} max={999} style={inputStyle}
                              />
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                            <strong>{DEP_LABELS[depType]}</strong>: &quot;{selectedPred?.number}. {selectedPred?.title}&quot;{" "}
                            {DEP_DESC[depType].predVerb} before this task {DEP_DESC[depType].succVerb}.
                            {depOffset > 0 && ` (+${depOffset} day lag)`}
                            {depOffset < 0 && ` (${depOffset} day lead)`}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {err && <p style={{ color: "#e84c6f", fontSize: 12, margin: 0 }}>{err}</p>}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button onClick={() => void handleSave()} disabled={!canSubmit}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: canSubmit ? 1 : 0.5 }}
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
