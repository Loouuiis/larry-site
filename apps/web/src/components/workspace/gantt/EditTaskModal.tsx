"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  taskId: string;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

interface TaskDetail {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeUserId: string | null;
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "#8db2ff", medium: "#fbe187", high: "#f67a79", critical: "#e84c6f",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting",     label: "Waiting / at risk" },
  { value: "blocked",     label: "Blocked / overdue" },
  { value: "completed",   label: "Completed" },
  { value: "backlog",     label: "Backlog" },
];

export function EditTaskModal({ taskId, onClose, onSaved, onDeleted }: Props) {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  // Form state — initialised from fetched task
  const [title, setTitle]             = useState("");
  const [priority, setPriority]       = useState("medium");
  const [status, setStatus]           = useState("not_started");
  const [startDate, setStartDate]     = useState("");
  const [dueDate, setDueDate]         = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [description, setDescription] = useState("");

  // Original values for diffing
  const orig = useRef<TaskDetail | null>(null);

  const [members, setMembers] = useState<Member[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [taskRes, membersRes] = await Promise.all([
          fetch(`/api/workspace/tasks/${taskId}`),
          fetch("/api/workspace/members"),
        ]);
        if (!taskRes.ok) throw new Error(`HTTP ${taskRes.status}`);
        const task = await taskRes.json() as TaskDetail;

        if (!cancelled) {
          orig.current = task;
          setTitle(task.title);
          setPriority(task.priority);
          setStatus(task.status);
          setStartDate(task.startDate ?? "");
          setDueDate(task.dueDate ?? "");
          setAssigneeUserId(task.assigneeUserId ?? "");
          setDescription(task.description ?? "");

          if (membersRes.ok) {
            const mData = await membersRes.json() as { members: Member[] };
            setMembers(mData.members ?? []);
          }
          setLoading(false);
          setTimeout(() => titleRef.current?.focus(), 0);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load task");
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [taskId]);

  async function handleSave() {
    if (saving || !orig.current) return;
    const o = orig.current;
    const body: Record<string, unknown> = {};
    if (title.trim() !== o.title) body.title = title.trim();
    if (priority !== o.priority) body.priority = priority;
    if (status !== o.status) body.status = status;
    const sd = startDate || null;
    const dd = dueDate || null;
    if (sd !== o.startDate) body.startDate = sd;
    if (dd !== o.dueDate) body.dueDate = dd;
    const auid = assigneeUserId || null;
    if (auid !== o.assigneeUserId) body.assigneeUserId = auid;
    const desc = description.trim() || null;
    if (desc !== o.description) body.description = desc;

    if (Object.keys(body).length === 0) { onSaved(); onClose(); return; }

    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/workspace/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const rb = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(rb.error ?? rb.message ?? `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dateErr = startDate && dueDate && dueDate < startDate
    ? "Due date cannot be before the start date."
    : null;

  const canSubmit = title.trim().length > 0 && !saving && !deleting && !dateErr;

  async function handleDelete() {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(true); setErr(null);
    try {
      const res = await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const rb = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(rb.error ?? rb.message ?? `HTTP ${res.status}`);
      }
      onDeleted ? onDeleted() : onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

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
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Edit task</h3>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Loading…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Title */}
            <div>
              <p style={fieldLabelStyle}>Title *</p>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
                placeholder="Task title..."
                style={inputStyle}
              />
            </div>

            {/* Priority */}
            <div>
              <p style={fieldLabelStyle}>Priority</p>
              <div style={{ display: "flex", gap: 6 }}>
                {(["low", "medium", "high", "critical"] as const).map((p) => (
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

            {/* Status */}
            <div>
              <p style={fieldLabelStyle}>Status</p>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={fieldLabelStyle}>Start date</p>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <p style={fieldLabelStyle}>Due date</p>
                <input
                  type="date"
                  value={dueDate}
                  min={startDate || undefined}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ ...inputStyle, borderColor: dateErr ? "#e84c6f" : undefined }}
                />
              </div>
            </div>

            {dateErr && (
              <p style={{ fontSize: 11, color: "#e84c6f", margin: 0 }}>{dateErr}</p>
            )}

            {/* Assignee */}
            <div>
              <p style={fieldLabelStyle}>Assignee <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></p>
              <select value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)} style={selectStyle}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
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

            {err && <p style={{ color: "#e84c6f", fontSize: 12, margin: 0 }}>{err}</p>}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => void handleDelete()}
            disabled={loading || deleting || saving}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "transparent", border: "1px solid var(--pm-red, #e84c6f)", borderRadius: 8, color: "var(--pm-red, #e84c6f)", cursor: "pointer", opacity: (!loading && !saving) ? 1 : 0.4 }}
          >
            {deleting ? "Deleting…" : "Delete task"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!canSubmit || loading}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: (canSubmit && !loading) ? 1 : 0.5 }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
