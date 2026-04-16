"use client";
import { Calendar, ChevronsDownUp, ChevronsUpDown, Plus, Search } from "lucide-react";
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
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
  background: "var(--surface, #fff)", border: "1px solid var(--border, #eaeaea)",
  borderRadius: 6, color: "var(--text-1)", cursor: "pointer",
};

export function GanttToolbar({ zoom, allCollapsed, search, onZoom, onToggleCollapseAll, onJumpToToday, onSearch, onAdd, canAdd, addLabel }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--border, #eaeaea)", borderRadius: 6, overflow: "hidden" }}>
        {(["week", "month", "quarter"] as const).map((z) => (
          <button key={z} onClick={() => onZoom(z)} style={{
            ...btn, border: 0, borderRadius: 0, height: 28,
            background: zoom === z ? "#6c44f6" : "#fff", color: zoom === z ? "#fff" : "var(--text-1)",
          }}>{z[0].toUpperCase()}</button>
        ))}
      </div>

      <button style={btn} onClick={onJumpToToday}><Calendar size={14} />Today</button>
      <button style={btn} onClick={onToggleCollapseAll}>
        {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>

      <label style={{ ...btn, padding: "0 8px", flex: "0 1 240px" }}>
        <Search size={14} />
        <input value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="Search..." style={{ border: 0, outline: 0, background: "transparent", fontSize: 12, width: "100%" }} />
      </label>

      <div style={{ flex: 1 }} />

      <button style={{ ...btn, background: canAdd ? "#6c44f6" : "#ddd", color: "#fff", border: 0, opacity: canAdd ? 1 : 0.6 }}
        onClick={canAdd ? onAdd : undefined}>
        <Plus size={14} />{addLabel}
      </button>
    </div>
  );
}
