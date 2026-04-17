"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import type { ProjectCategory } from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR } from "./gantt-types";

interface Props {
  onClose: () => void;
  onChanged: () => Promise<void> | void; // refetch timeline after any mutation
  topOffset?: number;                     // sits below the outline header
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 4,
  borderRadius: 4,
  color: "var(--text-muted, #bdb7d0)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function CategoryManagerPanel({ onClose, onChanged, topOffset = 48 }: Props) {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const creatingRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState(DEFAULT_CATEGORY_COLOUR);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/workspace/categories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { categories: ProjectCategory[] };
      setCategories(body.categories ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRecolour(id: string, colour: string) {
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, colour } : c));
    try {
      const res = await fetch(`/api/workspace/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colour }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
      await load();
    }
  }

  function startRename(c: ProjectCategory) {
    setEditingId(c.id); setEditingName(c.name);
    requestAnimationFrame(() => editInputRef.current?.focus());
  }

  async function saveRename(id: string) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      const res = await fetch(`/api/workspace/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleDelete(c: ProjectCategory) {
    const ok = typeof window !== "undefined" &&
      window.confirm(`Delete category "${c.name}"? Projects will move to Uncategorised.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/workspace/categories/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { setCreating(false); return; }
    try {
      const res = await fetch("/api/workspace/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, colour: newColour }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewName(""); setNewColour(DEFAULT_CATEGORY_COLOUR); setCreating(false);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Category manager"
      style={{
        position: "absolute",
        top: topOffset,
        left: 0,
        width: 280,
        bottom: 0,
        background: "var(--surface, #fff)",
        borderRight: "1px solid var(--border, #f0edfa)",
        zIndex: 10,
        padding: "14px",
        boxShadow: "4px 0 12px rgba(0, 0, 0, 0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--text-2, #4b556b)",
        }}>
          Categories
        </span>
        <button
          onClick={onClose}
          aria-label="Close category manager"
          style={{ ...iconBtnStyle, padding: 6 }}
        >
          <X size={14} />
        </button>
      </div>

      {err && <div style={{ fontSize: 12, color: "#e84c6f" }}>{err}</div>}
      {loading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {categories.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 0",
              borderBottom: "1px solid var(--border, #f0edfa)",
            }}
          >
            <input
              aria-label={`Colour for ${c.name}`}
              type="color"
              value={c.colour ?? DEFAULT_CATEGORY_COLOUR}
              onChange={(e) => void handleRecolour(c.id, e.target.value)}
              style={{
                width: 22, height: 22, border: "none", borderRadius: 4,
                cursor: "pointer", padding: 0, background: "transparent",
                flexShrink: 0,
              }}
            />
            {editingId === c.id ? (
              <input
                ref={editInputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => void saveRename(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRename(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{
                  flex: 1, fontSize: 13, color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2, #f6f2fc)",
                  borderRadius: 4, padding: "2px 6px", outline: "none", minWidth: 0,
                }}
              />
            ) : (
              <span style={{
                flex: 1, fontSize: 13, color: "var(--text-1)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {c.name}
              </span>
            )}
            <button
              onClick={() => startRename(c)}
              aria-label={`Rename ${c.name}`}
              style={iconBtnStyle}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => void handleDelete(c)}
              aria-label={`Delete ${c.name}`}
              style={iconBtnStyle}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {creating ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px", border: "1px solid var(--border)",
          borderRadius: 8, background: "var(--surface-2, #f6f2fc)",
        }}>
          <input
            aria-label="New category colour"
            type="color"
            value={newColour}
            onChange={(e) => setNewColour(e.target.value)}
            style={{ width: 22, height: 22, border: "none", padding: 0, cursor: "pointer", background: "transparent", flexShrink: 0 }}
          />
          <input
            ref={creatingRef}
            autoFocus
            placeholder="Category name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            style={{
              flex: 1, fontSize: 13,
              border: "1px solid var(--border)", borderRadius: 4,
              padding: "2px 6px", outline: "none", minWidth: 0,
              background: "var(--surface, #fff)", color: "var(--text-1)",
            }}
          />
          <button
            onClick={() => void handleCreate()}
            style={{
              background: "#6c44f6", color: "#fff", border: 0,
              borderRadius: 4, padding: "4px 8px", fontSize: 12, cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            width: "100%",
            padding: "10px 0",
            background: "transparent",
            border: "1px dashed var(--border-2, #bdb7d0)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-2, #4b556b)",
            cursor: "pointer",
          }}
        >
          + New category
        </button>
      )}
    </div>
  );
}
