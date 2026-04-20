"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryColorMap, ContextMenuAction, ContextMenuState, GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct, contextMenuItemsFor, searchUnDimmedKeys } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";
import { GanttContextMenu, type CategoryOption } from "./GanttContextMenu";

interface Props {
  root: GanttNode;
  defaultZoom?: ZoomLevel;
  onOpenDetail?: (key: string) => void;
  onAdd?: (context: { selectedKey: string | null; hoveredKey: string | null }) => void;
  addLabel?: string;
  categoryColorMap?: CategoryColorMap;
  rootCategoryColor?: string;
  outlineHeader?: ReactNode;
  outlineHeaderActions?: ReactNode;
  outlineFooter?: ReactNode;
  outlineOverlay?: ReactNode;
  // v3
  onCategoriesClick?: () => void;
  categoriesOpen?: boolean;
  onContextMenuAction?: (action: ContextMenuAction, args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null }) => void;
  categoriesForSubmenu?: CategoryOption[];
  onSelectionChange?: (selectedKey: string | null) => void;
  // Timeline Slice 1 — expose hover so the parent's "Add item" can target
  // the hovered row (project → Add task, task → Add subtask). Fires on
  // every change; pass a stable setter.
  onHoverChange?: (hoveredKey: string | null) => void;
}

export function GanttContainer({
  root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add",
  categoryColorMap, rootCategoryColor,
  outlineHeader, outlineHeaderActions, outlineFooter, outlineOverlay,
  onCategoriesClick, categoriesOpen,
  onContextMenuAction, categoriesForSubmenu = [],
  onSelectionChange, onHoverChange,
}: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState(260);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllKeys(root));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded, { categoryColorMap, rootCategoryColor });
    if (!search.trim()) return base;
    // v4 Slice 5 — ancestor-aware dimming: a row stays un-dimmed if itself,
    // any ancestor, or any descendant matches. Keeps the match's context
    // chain legible instead of fading it out.
    const unDimmed = searchUnDimmedKeys(root, search);
    return base.map((r) => ({ ...r, dimmed: !unDimmed.has(r.key) }));
  }, [root, expanded, search, categoryColorMap, rootCategoryColor]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    if (!gridRef.current) return;
    const pct = dateToPct(new Date(), range);
    const sw = gridRef.current.scrollWidth;
    const vw = gridRef.current.clientWidth;
    gridRef.current.scrollTo({ left: Math.max(0, (pct / 100) * sw - vw / 2), behavior: "smooth" });
  }, [range]);

  // Timeline Slice 1 — track the previous tree's keys so we can tell which
  // rows are brand-new on a data refetch. Previously any key not in `prev`
  // was dropped, which meant a freshly-created subcategory/subtask landed
  // collapsed and looked missing. Now new keys auto-expand; user-collapsed
  // keys stay collapsed as long as they survive.
  const prevKeysRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = collectAllKeys(root);
    const prevKeys = prevKeysRef.current;
    prevKeysRef.current = keys;
    // First mount — useState already seeded `expanded` with all keys.
    if (prevKeys === null) return;
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (keys.has(k)) next.add(k);
      for (const k of keys) if (!prevKeys.has(k)) next.add(k);
      return next.size === 0 ? keys : next;
    });
  }, [root]);

  const handleSelect = useCallback((k: string | null) => {
    setSelectedKey(k);
    onSelectionChange?.(k);
    if (k) onOpenDetail?.(k);
  }, [onOpenDetail, onSelectionChange]);

  useEffect(() => { onHoverChange?.(hoveredKey); }, [hoveredKey, onHoverChange]);

  const handleContextMenu = useCallback(
    (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => {
      // v4 Slice 5 — no context menu on the synthetic Uncategorised bucket.
      // Previously it opened with a single disabled-sentinel item which read
      // like an error; the row's italic typography already tells users it's
      // not editable.
      if (rowKey === "cat:uncat") return;
      if (rowKind === "subtask" || rowKind === "task" || rowKind === "project" || rowKind === "category") {
        setContextMenu({
          rowKey,
          rowKind,
          isUncategorised: false,
          x: e.clientX,
          y: e.clientY,
        });
      }
    },
    [],
  );

  const handleMenuSelect = useCallback(
    (action: ContextMenuAction, payload?: { categoryId: string | null }) => {
      if (!contextMenu) return;
      onContextMenuAction?.(action, {
        rowKey: contextMenu.rowKey,
        rowKind: contextMenu.rowKind,
        categoryId: payload?.categoryId,
      });
      setContextMenu(null);
    },
    [contextMenu, onContextMenuAction],
  );

  const menuItems = contextMenu
    ? contextMenuItemsFor({ rowKind: contextMenu.rowKind, isUncategorised: contextMenu.isUncategorised })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <GanttToolbar
        zoom={zoom} search={search}
        onZoom={setZoom} onJumpToToday={jumpToToday}
        onSearch={setSearch}
        onAdd={() => onAdd?.({ selectedKey, hoveredKey })}
        canAdd={Boolean(onAdd)}
        addLabel={addLabel}
        onCategoriesClick={onCategoriesClick}
        categoriesOpen={categoriesOpen}
      />
      <div style={{
        display: "flex", flex: 1, minHeight: 0,
        border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden",
      }}>
        <GanttOutline
          rows={rows} expanded={expanded}
          selectedKey={selectedKey} hoveredKey={hoveredKey}
          width={outlineWidth} onWidthChange={setOutlineWidth}
          onToggle={toggle}
          onSelect={handleSelect}
          onHover={setHoveredKey}
          onContextMenu={handleContextMenu}
          header={outlineHeader}
          headerActions={outlineHeaderActions}
          footer={outlineFooter}
          overlay={outlineOverlay}
        />
        <GanttGrid
          ref={gridRef}
          rows={rows} range={range} zoom={zoom}
          hoveredKey={hoveredKey} selectedKey={selectedKey}
          onHoverKey={setHoveredKey}
          onSelectKey={handleSelect}
          onContextMenu={handleContextMenu}
        />
      </div>

      {contextMenu && (
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          categories={categoriesForSubmenu}
          onSelect={handleMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
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
