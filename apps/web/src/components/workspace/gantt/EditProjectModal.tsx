"use client";
import { useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  projectId: string;
  initialName: string;
  initialStatus: string;
  initialStartDate: string | null;
  initialTargetDate: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
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

export function EditProjectModal({
  projectId,
  initialName,
  initialStatus,
  initialStartDate,
  initialTargetDate,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [name, setName]               = useState(initialName);
  const [status, setStatus]           = useState(initialStatus === "archived" ? "archived" : "active");
  const [startDate, setStartDate]     = useState(initialStartDate ?? "");
  const [targetDate, setTargetDate]   = useState(initialTargetDate ?? "");
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  const dateErr = startDate && targetDate && targetDate < startDate
    ? "Target date cannot be before start date."
    : null;

  const canSubmit = name.trim().length > 0 && !saving && !deleting && !dateErr;

  async function handleSave() {
    if (!canSubmit) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== initialName) body.name = name.trim();
    if (status !== (initialStatus === "archived" ? "archived" : "active")) body.status = status;
    if ((startDate || null) !== initialStartDate) body.startDate = startDate || null;
    if ((targetDate || null) !== initialTargetDate) body.targetDate = targetDate || null;

    if (Object.keys(body).length === 0) { onSaved(); onClose(); return; }

    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/workspace/projects/${projectId}`, {
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

  async function handleDelete() {
    const confirmed = window.prompt(
      `Type the project name "${initialName}" to confirm deletion. This will delete ALL tasks in the project.`,
    );
    if (confirmed === null) return;
    if (confirmed.trim() !== initialName.trim()) {
      setErr("Project name didn't match — deletion cancelled.");
      return;
    }
    setDeleting(true); setErr(null);
    try {
      const res = await fetch(`/api/workspace/projects/${projectId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmProjectName: initialName.trim() }),
      });
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
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Edit project</h3>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name */}
          <div>
            <p style={fieldLabelStyle}>Name *</p>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Project name..."
              style={inputStyle}
            />
          </div>

          {/* Status */}
          <div>
            <p style={fieldLabelStyle}>Status</p>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
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
              <p style={fieldLabelStyle}>Target date</p>
              <input
                type="date"
                value={targetDate}
                min={startDate || undefined}
                onChange={(e) => setTargetDate(e.target.value)}
                style={{ ...inputStyle, borderColor: dateErr ? "#e84c6f" : undefined }}
              />
            </div>
          </div>

          {dateErr && <p style={{ fontSize: 11, color: "#e84c6f", margin: 0 }}>{dateErr}</p>}
          {err && <p style={{ color: "#e84c6f", fontSize: 12, margin: 0 }}>{err}</p>}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => void handleDelete()}
            disabled={saving || deleting}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "transparent", border: "1px solid var(--pm-red, #e84c6f)", borderRadius: 8, color: "var(--pm-red, #e84c6f)", cursor: "pointer", opacity: (!saving) ? 1 : 0.4 }}
          >
            {deleting ? "Deleting…" : "Delete project"}
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
              disabled={!canSubmit}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: canSubmit ? 1 : 0.5 }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
