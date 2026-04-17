"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryColorMap, GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct, injectInlineAdds } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";

interface Props {
  root: GanttNode;
  defaultZoom?: ZoomLevel;
  onOpenDetail?: (key: string) => void;
  onAdd?: (context: { selectedKey: string | null }) => void;
  addLabel?: string;
  categoryColorMap?: CategoryColorMap;
  rootCategoryColor?: string;
  onInlineAdd?: (ctx: { mode: "category" | "project" | "task" | "subtask"; parentKey: string | null }) => void;
  outlineHeader?: ReactNode;
  outlineHeaderActions?: ReactNode;
  outlineFooter?: ReactNode;
  outlineOverlay?: ReactNode;
}

export function GanttContainer({
  root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add",
  categoryColorMap, rootCategoryColor,
  onInlineAdd, outlineHeader, outlineHeaderActions, outlineFooter, outlineOverlay,
}: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState(260);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllKeys(root));
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded, { categoryColorMap, rootCategoryColor });
    const withSearch = (!search.trim())
      ? base
      : (() => {
          const q = search.toLowerCase();
          return base.map((r) => r.kind === "node"
            ? { ...r, dimmed: !nodeLabel(r.node).toLowerCase().includes(q) }
            : r);
        })();
    return onInlineAdd ? injectInlineAdds(withSearch, expanded) : withSearch;
  }, [root, expanded, search, categoryColorMap, rootCategoryColor, onInlineAdd]);

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
      <div style={{ display: "flex", flex: 1, minHeight: 0, border: "1px solid var(--border, #f0edfa)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
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
          onInlineAdd={onInlineAdd}
          header={outlineHeader}
          headerActions={outlineHeaderActions}
          footer={outlineFooter}
          overlay={outlineOverlay}
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
