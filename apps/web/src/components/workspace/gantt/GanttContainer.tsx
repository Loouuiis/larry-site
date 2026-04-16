"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";

interface Props {
  root: GanttNode;
  defaultZoom?: ZoomLevel;
  onOpenDetail?: (key: string) => void;
  onAdd?: (context: { selectedKey: string | null }) => void;
  addLabel?: string;
}

export function GanttContainer({ root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add" }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllKeys(root));
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.map((r) => ({ ...r, dimmed: !nodeLabel(r.node).toLowerCase().includes(q) }));
  }, [root, expanded, search]);

  const allCollapsed = expanded.size === 0;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleCollapseAll() {
    if (allCollapsed) setExpanded(collectAllKeys(root));
    else setExpanded(new Set());
  }

  function jumpToToday() {
    if (!gridRef.current) return;
    const pct = dateToPct(new Date(), range);
    const sw = gridRef.current.scrollWidth;
    const vw = gridRef.current.clientWidth;
    gridRef.current.scrollTo({ left: Math.max(0, (pct / 100) * sw - vw / 2), behavior: "smooth" });
  }

  useEffect(() => {
    setExpanded((prev) => {
      const keys = collectAllKeys(root);
      const next = new Set<string>();
      for (const k of prev) if (keys.has(k)) next.add(k);
      return next.size === 0 ? keys : next;
    });
  }, [root]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <GanttToolbar
        zoom={zoom} allCollapsed={allCollapsed} search={search}
        onZoom={setZoom} onToggleCollapseAll={toggleCollapseAll} onJumpToToday={jumpToToday}
        onSearch={setSearch}
        onAdd={() => onAdd?.({ selectedKey })}
        canAdd={Boolean(onAdd)}
        addLabel={addLabel}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0, border: "1px solid var(--border, #eaeaea)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        <GanttOutline
          rows={rows}
          expanded={expanded}
          selectedKey={selectedKey}
          hoveredKey={hoveredKey}
          width={outlineWidth}
          onWidthChange={setOutlineWidth}
          onToggle={toggle}
          onSelect={(k) => { setSelectedKey(k); onOpenDetail?.(k); }}
          onHover={setHoveredKey}
        />
        <GanttGrid
          ref={gridRef}
          rows={rows}
          range={range}
          zoom={zoom}
          hoveredKey={hoveredKey}
          selectedKey={selectedKey}
          onHoverKey={setHoveredKey}
          onSelectKey={(k) => { setSelectedKey(k); if (k) onOpenDetail?.(k); }}
        />
      </div>
    </div>
  );
}

function nodeLabel(n: GanttNode): string {
  if (n.kind === "category" || n.kind === "project") return n.name;
  return n.task.title;
}

function collectTasks(root: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function collectAllKeys(root: GanttNode): Set<string> {
  const out = new Set<string>();
  function keyOf(n: GanttNode): string {
    if (n.kind === "category") return `cat:${n.id ?? "uncat"}`;
    if (n.kind === "project") return `proj:${n.id}`;
    if (n.kind === "task") return `task:${n.id}`;
    return `sub:${n.id}`;
  }
  function walk(n: GanttNode, isRoot: boolean) {
    if (!isRoot) out.add(keyOf(n));
    if (n.kind !== "subtask") for (const c of n.children) walk(c, false);
  }
  walk(root, true);
  return out;
}
