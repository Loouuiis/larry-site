"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Mode = "category" | "project" | "task" | "subtask";

interface Props {
  mode: Mode;
  parentProjectId?: string;   // for task
  parentTaskId?: string;      // for subtask
  parentCategoryId?: string;  // for project
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box",
};

export function AddNodeModal({ mode, parentProjectId, parentTaskId, parentCategoryId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [colour, setColour] = useState<string>("#6c44f6");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true); setErr(null);
    try {
      if (mode === "category") {
        const res = await fetch("/api/workspace/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: title.trim(), colour }),
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
        if (dueDate) body.dueDate = dueDate;
        if (mode === "subtask") body.parentTaskId = parentTaskId;
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

  const label = mode === "category" ? "New category" : mode === "project" ? "New project" : mode === "task" ? "New task" : "New subtask";

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
              placeholder={mode === "category" ? "Category name..." : mode === "project" ? "Project name..." : "Task title..."}
              style={inputStyle}
            />
          </div>
          {mode === "category" && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>Colour</p>
              <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} style={{ ...inputStyle, padding: 2, height: 36 }} />
            </div>
          )}
          {(mode === "task" || mode === "subtask") && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: 0, marginBottom: 6 }}>Due date</p>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          )}
          {err && <p style={{ color: "#e84c6f", fontSize: 12, margin: 0 }}>{err}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => void handleSave()} disabled={!title.trim() || saving} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: (!title.trim() || saving) ? 0.5 : 1 }}>
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
