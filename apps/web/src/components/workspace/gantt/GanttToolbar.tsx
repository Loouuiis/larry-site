"use client";
import { Calendar, ChevronsDownUp, ChevronsUpDown, Plus, Search, Tag } from "lucide-react";
import type { ZoomLevel } from "./gantt-types";

interface Props {
  zoom: ZoomLevel;
  allCollapsed: boolean;
  search: string;
  onZoom: (z: ZoomLevel) => void;
  onToggleCollapseAll: () => void;
  onJumpToToday: () => void;
  onSearch: (s: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  addLabel: string;
  onCategoriesClick?: () => void;
  categoriesOpen?: boolean;
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 6, color: "var(--text-1)", cursor: "pointer",
};

export function GanttToolbar({
  zoom, allCollapsed, search, onZoom, onToggleCollapseAll, onJumpToToday, onSearch,
  onAdd, canAdd, addLabel, onCategoriesClick, categoriesOpen,
}: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {(["week", "month", "quarter"] as const).map((z) => (
          <button key={z} onClick={() => onZoom(z)} style={{
            ...btn, border: 0, borderRadius: 0, height: 28,
            background: zoom === z ? "var(--brand)" : "var(--surface)",
            color: zoom === z ? "#fff" : "var(--text-1)",
          }}>{z[0].toUpperCase()}</button>
        ))}
      </div>

      <button style={btn} onClick={onJumpToToday}><Calendar size={14} />Today</button>
      <button style={btn} onClick={onToggleCollapseAll}>
        {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>

      {onCategoriesClick && (
        <button
          style={{
            ...btn,
            background: categoriesOpen ? "var(--brand)" : "var(--surface)",
            color: categoriesOpen ? "#fff" : "var(--text-1)",
            border: categoriesOpen ? "1px solid var(--brand)" : "1px solid var(--border)",
          }}
          onClick={onCategoriesClick}
        >
          <Tag size={14} />Categories
        </button>
      )}

      <label style={{ ...btn, padding: "0 8px", flex: "0 1 240px" }}>
        <Search size={14} />
        <input value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="Search..." style={{ border: 0, outline: 0, background: "transparent", fontSize: 12, width: "100%" }} />
      </label>

      <div style={{ flex: 1 }} />

      {canAdd && (
        <button style={{ ...btn, background: "var(--brand)", color: "#fff", border: 0 }}
          onClick={onAdd}>
          <Plus size={14} />{addLabel}
        </button>
      )}
    </div>
  );
}
