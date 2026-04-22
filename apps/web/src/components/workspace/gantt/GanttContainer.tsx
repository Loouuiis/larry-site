"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryColorMap, ContextMenuAction, ContextMenuState, GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct, contextMenuItemsFor, searchUnDimmedKeys } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";
import { GanttContextMenu, type CategoryOption, type ProjectOption } from "./GanttContextMenu";

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
  // the hovered row (project → Add task, task → Add subtask). Fires on
  // every change; pass a stable setter.
  onHoverChange?: (hoveredKey: string | null) => void;
  // Timeline Slice 2 — if set, view state (collapsed rows, zoom, outline
  // width) persists to localStorage under `larry:gantt:<persistKey>:*`.
  // Callers use "portfolio" for the org timeline and `proj:<id>` for per-
  // project timelines. Omit to keep state ephemeral (tests, previews).
  persistKey?: string;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string }>;
  onTaskBarClick?: (taskId: string, projectId: string) => void;
  milestones?: Array<{ id: string; name: string; date: string; color?: string }>;
  onAddMilestone?: (date: string) => void;
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
  milestones, onAddMilestone,
}: Props) {
  // Timeline Slice 2 — persistence keys. `null` short-circuits every
  // read/write so callers that don't pass persistKey behave as before.
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
  // Timeline Slice 2 — flip the semantic. We used to track "expanded keys"
  // and mutate that set on every tree refetch to keep new rows expanded.
  // Now we track "collapsed keys" instead: absent == expanded, so new rows
  // auto-expand for free and storage only carries the user's collapse
  // decisions. Makes the refetch merge disappear.
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    readPersistedCollapsed(collapsedKey) ?? new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  // Derived: keys the user wants visible, i.e. NOT in `collapsed`. Filtered
  // to currently-valid keys so flattenVisible treats stale collapsed ids
  // as no-ops (and eventually GC via `collapsed` cleanup below).
  const expanded = useMemo(() => {
    const keys = collectAllKeys(root);
    const out = new Set<string>();
    for (const k of keys) if (!collapsed.has(k)) out.add(k);
    return out;
  }, [root, collapsed]);

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

  // Timeline Slice 2 — GC stale collapsed keys when the tree changes. If
  // a user collapsed X and X then gets deleted, X lingers in localStorage
  // forever otherwise. Runs once per tree-change.
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

  // Timeline Slice 2 — persist view state. Writes are fire-and-forget;
  // localStorage.setItem quota errors get swallowed (view still works,
  // just won't survive refresh). Writes happen only when the relevant
  // state actually changes, so no chatty activity on scroll/hover.
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
          dependencies={dependencies}
          onTaskBarClick={onTaskBarClick}
          milestones={milestones}
          onAddMilestone={onAddMilestone}
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

// Timeline Slice 2 — localStorage helpers. Every call is wrapped in
// try/catch because storage can be disabled (private mode, quota,
// unavailable during SSR). A null `key` short-circuits for the non-
// persisted case. Return null on miss so the caller can fall back to
// its default cleanly.
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
  // Clamp: outline width under 120 or over 600 is clearly junk/stale
  // (e.g. from an old resize bug). Fall back to default in that case.
  if (!Number.isFinite(n) || n < 120 || n > 600) return null;
  return n;
}

function collectTasks(root: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  // Timeline Slice 2 — subtask now carries `children`; walk them too so
  // deeply-nested subtask bars still contribute to range/date calcs.
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
