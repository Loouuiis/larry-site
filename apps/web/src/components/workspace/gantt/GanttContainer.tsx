"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryColorMap, ContextMenuAction, ContextMenuState, GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct, contextMenuItemsFor, searchUnDimmedKeys } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";
import { GanttContextMenu, type CategoryOption, type ProjectOption } from "./GanttContextMenu";
import {
  sliceVisibleRows,
  DEFAULT_OVERSCAN,
  isVirtualizeEnabled,
  isVirtualizeFlagEnabled,
  type RowSlice,
} from "./gantt-virtualize";

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
  onContextMenuAction?: (action: ContextMenuAction, args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null; projectId?: string }) => void;
  categoriesForSubmenu?: CategoryOption[];
  projectsForSubmenu?: ProjectOption[];
  onSelectionChange?: (selectedKey: string | null) => void;
  onProjectBarClick?: (projectId: string) => void;
  // Timeline Slice 1 — expose hover so the parent's "Add item" can target
  // the hovered row (project -> Add task, task -> Add subtask). Fires on
  // every change; pass a stable setter.
  onHoverChange?: (hoveredKey: string | null) => void;
  // Timeline Slice 2 — if set, view state (collapsed rows, zoom, outline
  // width) persists to localStorage under `larry:gantt:<persistKey>:*`.
  persistKey?: string;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; type?: "FS" | "FF" | "SS" | "SF" }>;
  onTaskBarClick?: (taskId: string, projectId: string) => void;
}

export function GanttContainer({
  root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add",
  categoryColorMap, rootCategoryColor,
  outlineHeader, outlineHeaderActions, outlineFooter, outlineOverlay,
  onCategoriesClick, categoriesOpen,
  onContextMenuAction, categoriesForSubmenu = [], projectsForSubmenu = [],
  onSelectionChange, onHoverChange, persistKey,
  onProjectBarClick,
  dependencies, onTaskBarClick,
}: Props) {
  const collapsedKey = persistKey ? `larry:gantt:${persistKey}:collapsed` : null;
  const zoomKey      = persistKey ? `larry:gantt:${persistKey}:zoom` : null;
  const outlineKey   = persistKey ? `larry:gantt:${persistKey}:outline` : null;

  const [zoom, setZoom] = useState<ZoomLevel>(() =>
    readPersistedZoom(zoomKey) ?? defaultZoom,
  );
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState<number>(() =>
    readPersistedOutlineWidth(outlineKey) ?? 260,
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    readPersistedCollapsed(collapsedKey) ?? new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const expanded = useMemo(() => {
    const keys = collectAllKeys(root);
    const out = new Set<string>();
    for (const k of keys) if (!collapsed.has(k)) out.add(k);
    return out;
  }, [root, collapsed]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded, { categoryColorMap, rootCategoryColor });
    if (!search.trim()) return base;
    const unDimmed = searchUnDimmedKeys(root, search);
    return base.map((r) => ({ ...r, dimmed: !unDimmed.has(r.key) }));
  }, [root, expanded, search, categoryColorMap, rootCategoryColor]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
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

  useEffect(() => {
    const keys = collectAllKeys(root);
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (keys.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [root]);

  useEffect(() => { writePersisted(collapsedKey, JSON.stringify([...collapsed])); }, [collapsedKey, collapsed]);
  useEffect(() => { writePersisted(zoomKey, zoom); }, [zoomKey, zoom]);
  useEffect(() => { writePersisted(outlineKey, String(outlineWidth)); }, [outlineKey, outlineWidth]);

  const handleSelect = useCallback((k: string | null) => {
    setSelectedKey(k);
    onSelectionChange?.(k);
    if (k?.startsWith("proj:")) {
      onProjectBarClick?.(k.slice(5));
      return;
    }
    if (k) onOpenDetail?.(k);
  }, [onOpenDetail, onSelectionChange, onProjectBarClick]);

  useEffect(() => { onHoverChange?.(hoveredKey); }, [hoveredKey, onHoverChange]);

  const handleContextMenu = useCallback(
    (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => {
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
    (action: ContextMenuAction, payload?: { categoryId?: string | null; projectId?: string }) => {
      if (!contextMenu) return;
      onContextMenuAction?.(action, {
        rowKey: contextMenu.rowKey,
        rowKind: contextMenu.rowKind,
        categoryId: payload?.categoryId,
        projectId: payload?.projectId,
      });
      setContextMenu(null);
    },
    [contextMenu, onContextMenuAction],
  );

  const menuItems = contextMenu
    ? contextMenuItemsFor({ rowKind: contextMenu.rowKind, isUncategorised: contextMenu.isUncategorised })
    : [];

  // Row-windowing. Gated on (a) the public env flag NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE
  // and (b) rows.length > VIRTUALIZE_THRESHOLD. When either condition fails we
  // disable virtualization end-to-end: the slicer short-circuits to disabled,
  // and the outer scroll container keeps `overflow: hidden` so page-scroll
  // ownership is preserved for the typical (small-tenant) case.
  const virtualizationEnabled = isVirtualizeEnabled(rows.length);
  const flagEnabled = isVirtualizeFlagEnabled();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [virtualizationEnabled]);

  const slice: RowSlice = useMemo(() => {
    const heights = rows.map((r) => r.height);
    return sliceVisibleRows({
      heights,
      scrollTop,
      viewportHeight,
      overscan: DEFAULT_OVERSCAN,
      flagEnabled,
    });
  }, [rows, scrollTop, viewportHeight, flagEnabled]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!virtualizationEnabled) return;
    setScrollTop(e.currentTarget.scrollTop);
  }, [virtualizationEnabled]);

  // Keyboard nav: ArrowDown/ArrowUp on the scroll container scrolls by one
  // row-height so the next focus target mounts. Only active under
  // virtualization — in the disabled case every row is in the DOM already.
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!virtualizationEnabled) return;
    const el = scrollRef.current;
    if (!el || rows.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const stepSize = rows[0]?.height ?? 28;
      const delta = e.key === "ArrowDown" ? stepSize : -stepSize;
      el.scrollTop = Math.max(0, el.scrollTop + delta);
    }
  }, [rows, virtualizationEnabled]);

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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        data-gantt-virtualized={virtualizationEnabled ? "true" : "false"}
        style={{
          display: "flex", flex: 1, minHeight: 0,
          border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)",
          // Scroll-ownership flip is gated on virtualizationEnabled. When OFF
          // (the typical <200-row / flag-off tenant) we keep the original
          // `overflow: hidden` so the document continues to own the y-scroll
          // and page-scroll works. When ON, we own the y-scroll inside this
          // container (so the slicer can observe scrollTop) while still hiding
          // x-scroll (the inner Grid owns its own x-scroll).
          ...(virtualizationEnabled
            ? { overflowX: "hidden" as const, overflowY: "auto" as const }
            : { overflow: "hidden" as const }),
        }}
      >
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
          slice={slice}
        />
        <GanttGrid
          ref={gridRef}
          rows={rows} range={range} zoom={zoom}
          hoveredKey={hoveredKey} selectedKey={selectedKey}
          onHoverKey={setHoveredKey}
          onSelectKey={handleSelect}
          onContextMenu={handleContextMenu}
          dependencies={dependencies}
          onTaskBarClick={onTaskBarClick}
          slice={slice}
        />
      </div>

      {contextMenu && (
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          categories={categoriesForSubmenu}
          projects={projectsForSubmenu}
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

function writePersisted(key: string | null, value: string): void {
  if (!key || typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* quota / disabled */ }
}

function readPersistedRaw(key: string | null): string | null {
  if (!key || typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function readPersistedCollapsed(key: string | null): Set<string> | null {
  const raw = readPersistedRaw(key);
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const out = new Set<string>();
    for (const v of arr) if (typeof v === "string") out.add(v);
    return out;
  } catch { return null; }
}

function readPersistedZoom(key: string | null): ZoomLevel | null {
  const raw = readPersistedRaw(key);
  if (raw === "week" || raw === "month" || raw === "quarter") return raw;
  return null;
}

function readPersistedOutlineWidth(key: string | null): number | null {
  const raw = readPersistedRaw(key);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 120 || n > 600) return null;
  return n;
}

function collectTasks(root: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    for (const c of n.children) walk(c);
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
    for (const c of n.children) walk(c, false);
  }
  walk(root, true);
  return out;
}
