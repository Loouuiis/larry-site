"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import type { ProjectCategory } from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR } from "./gantt-types";

interface Props {
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const DRAWER_WIDTH = 320;

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 4,
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function CategoryManagerPanel({ onClose, onChanged }: Props) {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
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
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        zIndex: 200,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--text-2)",
        }}>
          Categories
        </span>
        <button onClick={onClose} aria-label="Close" style={{ ...iconBtnStyle, padding: 6 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {err && <div style={{ fontSize: 12, color: "#e84c6f", padding: "4px 0" }}>{err}</div>}
        {loading && <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Loading…</div>}

        {categories.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 4px",
              height: 48,
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
                  flex: 1, fontSize: 14, color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  borderRadius: 4, padding: "4px 6px", outline: "none", minWidth: 0,
                }}
              />
            ) : (
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-1)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {c.name}
              </span>
            )}
            <button onClick={() => startRename(c)} aria-label={`Rename ${c.name}`} style={iconBtnStyle}>
              <Pencil size={12} />
            </button>
            <button onClick={() => void handleDelete(c)} aria-label={`Delete ${c.name}`} style={iconBtnStyle}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {/* Uncategorised — system row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 4px", height: 48, opacity: 0.7,
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%",
            background: "var(--text-muted)",
            flexShrink: 0,
          }} />
          <span style={{
            flex: 1, fontSize: 14, fontStyle: "italic", color: "var(--text-2)",
          }}>
            Uncategorised
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, textTransform: "uppercase",
            color: "var(--text-muted)", letterSpacing: "0.04em",
          }}>
            system
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        {creating ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px", border: "1px solid var(--border)",
            borderRadius: 8, background: "var(--surface-2)",
          }}>
            <input
              aria-label="New category colour"
              type="color"
              value={newColour}
              onChange={(e) => setNewColour(e.target.value)}
              style={{ width: 22, height: 22, border: "none", padding: 0, cursor: "pointer", background: "transparent", flexShrink: 0 }}
            />
            <input
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
                padding: "4px 6px", outline: "none", minWidth: 0,
                background: "var(--surface)", color: "var(--text-1)",
              }}
            />
            <button
              onClick={() => void handleCreate()}
              style={{
                background: "var(--brand)", color: "#fff", border: 0,
                borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 500,
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
              height: 40,
              background: "var(--brand)",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New category
          </button>
        )}
      </div>
    </div>
  );
}
