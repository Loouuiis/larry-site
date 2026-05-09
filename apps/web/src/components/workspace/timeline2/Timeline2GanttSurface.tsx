"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Link2,
  ListTodo,
  Milestone,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  Timeline2Branch,
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
  Timeline2UserPreferences,
} from "@larry/shared";
import {
  addDays,
  DEPENDENCY_LABELS,
  diffDays,
  formatDate,
  KIND_LABELS,
  nodeToDraft,
  normalizeText,
  STATUS_COLORS,
  type NodeSheetState,
} from "./timeline2-ui";
import { PersonAvatar, PriorityBadge, StatusBadge } from "./Timeline2Primitives";
import {
  buildRange,
  changedNodeIds,
  clamp,
  dependencyCount,
  monthSegments,
  relationPreview,
  reorderColumns,
  TIMELINE_GANTT_COLUMN_KEYS,
  timelineColumnResizeBounds,
  type DependencyDirection,
  type ResizableColumnKey,
  type TimelineColumnKey,
} from "./timeline2-gantt-helpers";
import {
  DEFAULT_COLUMN_ORDER,
  DEFAULT_COLUMN_WIDTHS,
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_TASK_NAME_COLUMN_WIDTH,
  MAX_OUTLINE_WIDTH,
  MIN_OUTLINE_WIDTH,
  readSessionNumber,
  readSessionOrder,
  readSessionOutlineWidths,
  taskNameColumnResizeBounds,
  writeSessionNumber,
  writeSessionOrder,
  writeSessionOutlineWidths,
} from "./timeline2-gantt-prefs";
import {
  buildTimelineGanttVisibleRows,
  isTimeline2SyntheticProjectRootId,
  searchableTimelineGanttRow,
  type TimelineGanttVisibleRow,
} from "./timeline-render-types";
import { validateTimelineSnapshot } from "./timeline2-snapshot-validation";
import { useTimeline2UiStore } from "./timeline2-store";

interface PositionedRow extends TimelineGanttVisibleRow {
  y: number;
}

/** Outline + Gantt band height — room for task title + subtitle/meta without clipping. */
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 56;

const OPTIONAL_TIMELINE_OUTLINE_COLUMNS = TIMELINE_GANTT_COLUMN_KEYS.filter((key) => key !== "task_name");

function RowKindGlyph({ kind }: { kind: TimelineGanttVisibleRow["kind"] }) {
  if (kind === "milestone") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: "#dbe5ec", color: "#516170" }}>
        <Milestone size={11} />
      </span>
    );
  }
  if (kind === "group") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: "#e8f4ea", color: "#3d7a4f" }}>
        <FolderKanban size={11} />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: "#eef2f7", color: "#5a6b7a" }}>
      <ListTodo size={11} />
    </span>
  );
}

function OutlineProgressMeter({ row }: { row: TimelineGanttVisibleRow }) {
  const pct = clamp(row.displayProgress, 0, 100);
  const tone = STATUS_COLORS[row.displayStatus];
  const fillWide = pct >= 99.5;
  return (
    <div className="flex min-w-0 w-full items-center gap-2 px-0.5">
      <span className="w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>
        {Math.round(pct)}%
      </span>
      <div className="relative h-2 min-w-[52px] flex-1 max-w-[104px] overflow-hidden rounded-full" style={{ background: tone.soft }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: fillWide ? "100%" : `${pct}%`,
            background: tone.bar,
          }}
        />
      </div>
    </div>
  );
}

/** Phase 0 diagnostic: max outline rows logged in dev at Gantt boundary. */
const PHASE0_GANTT_ROW_LOG_LIMIT = 12;

function OutlineGuide({ row, hasChildren, collapsed, onToggle }: {
  row: TimelineGanttVisibleRow;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="flex shrink-0 items-stretch self-stretch">
      {row.ancestorHasNext.map((hasNext, index) => (
        <span key={`${row.id}-guide-${index}`} className="relative h-full min-h-[44px] w-[16px]">
          {hasNext && <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2" style={{ background: "#c9d6e0" }} />}
        </span>
      ))}
      {row.depth > 0 && (
        <span className="relative h-full min-h-[44px] w-[16px]">
          <span className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2" style={{ background: "#c9d6e0" }} />
          <span className="absolute left-1/2 top-1/2 h-px w-[16px]" style={{ background: "#c9d6e0" }} />
          {!row.isLastSibling && <span className="absolute left-1/2 top-1/2 bottom-0 w-px -translate-x-1/2" style={{ background: "#c9d6e0" }} />}
        </span>
      )}
      {hasChildren ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className="flex h-full min-h-[44px] w-6 shrink-0 items-center justify-center rounded-sm hover:bg-white"
          aria-label={`Toggle ${row.name}`}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : (
        <span className="flex h-full min-h-[44px] w-6 shrink-0 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#9fb0bd" }} />
        </span>
      )}
    </span>
  );
}

function ConnectorPath({
  rowByNodeId,
  dateStart,
  dayWidth,
  fromNodeId,
  toNodeId,
}: {
  rowByNodeId: Map<string, PositionedRow>;
  dateStart: string;
  dayWidth: number;
  fromNodeId: string;
  toNodeId: string;
}) {
  const from = rowByNodeId.get(fromNodeId);
  const to = rowByNodeId.get(toNodeId);
  if (!from || !to) return null;
  const fromDue = from.displayDueDate ?? from.displayStartDate;
  const toStart = to.displayStartDate ?? to.displayDueDate;
  if (!fromDue || !toStart) return null;
  const x1 = Math.max(0, diffDays(dateStart, fromDue)) * dayWidth + dayWidth - 4;
  const x2 = Math.max(0, diffDays(dateStart, toStart)) * dayWidth + 8;
  const y1 = from.y + ROW_HEIGHT / 2;
  const y2 = to.y + ROW_HEIGHT / 2;
  const mid = Math.max(x1 + 22, (x1 + x2) / 2);
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function Timeline2GanttSurface({
  projectDisplayName,
  nodes,
  tree,
  dependencies,
  branches,
  dependencyMode,
  onDependencyModeChange,
  onCreateDependency,
  onDeleteDependency,
  onUpdateNode,
  onOpenSheet,
  onOpenAi,
  focusDependencyNodeId,
  onFocusDependencyHandled,
  persistKey,
  preferences,
  onSavePreferences,
}: {
  /** Workspace project title — synthetic project root row (display-only). */
  projectDisplayName: string;
  nodes: Timeline2Node[];
  tree: Timeline2Node[];
  dependencies: Timeline2Dependency[];
  branches: Timeline2Branch[];
  dependencyMode: boolean;
  onDependencyModeChange: (next: boolean) => void;
  onCreateDependency: (input: {
    fromNodeId: string;
    toNodeId: string;
    relation?: Timeline2DependencyRelation;
    lagDays?: number;
  }) => Promise<unknown>;
  onDeleteDependency: (dependencyId: string) => Promise<unknown>;
  onUpdateNode: (nodeId: string, patch: { startDate?: string | null; dueDate?: string | null }) => Promise<unknown>;
  onOpenSheet: (state: NodeSheetState) => void;
  onOpenAi: () => void;
  focusDependencyNodeId?: string | null;
  onFocusDependencyHandled?: () => void;
  persistKey: string;
  preferences: Timeline2UserPreferences;
  onSavePreferences: (preferences: Timeline2UserPreferences) => Promise<unknown>;
}) {
  const paneWidthKey = `larry:timeline2:${persistKey}:outline-width`;
  const columnOrderKey = `larry:timeline2:${persistKey}:outline-order`;
  const columnWidthsKey = `larry:timeline2:${persistKey}:outline-widths`;
  const dayWidthKey = `larry:timeline2:${persistKey}:day-width`;

  const collapsedNodeIds = useTimeline2UiStore((state) => state.collapsedNodeIds);
  const setCollapsedNodeIds = useTimeline2UiStore((state) => state.setCollapsedNodeIds);
  const toggleCollapsedNodeId = useTimeline2UiStore((state) => state.toggleCollapsedNodeId);
  const dragState = useTimeline2UiStore((state) => state.dragState);
  const setDragState = useTimeline2UiStore((state) => state.setDragState);
  const [dayWidth, setDayWidth] = useState<number>(() => readSessionNumber(dayWidthKey, 38, 28, 52));
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [relation, setRelation] = useState<Timeline2DependencyRelation>("finish_to_start");
  const [lagDays, setLagDays] = useState(0);
  const [direction, setDirection] = useState<DependencyDirection>("unblocks");
  const [search, setSearch] = useState("");
  const [dependencySaving, setDependencySaving] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState<number>(() => readSessionNumber(paneWidthKey, DEFAULT_OUTLINE_WIDTH, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
  const [columnOrder, setColumnOrder] = useState<TimelineColumnKey[]>(() => readSessionOrder(columnOrderKey));
  const [visibleColumns, setVisibleColumns] = useState<string[]>(OPTIONAL_TIMELINE_OUTLINE_COLUMNS);
  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumnKey, number>>(
    () => readSessionOutlineWidths(columnWidthsKey).resizable,
  );
  const [taskNameColumnWidth, setTaskNameColumnWidth] = useState<number>(
    () => readSessionOutlineWidths(columnWidthsKey).taskName,
  );
  const hydratedPrefsKeyRef = useRef<string | null>(null);
  const dragMetaRef = useRef<{
    originX: number;
    mode: "move" | "resize_start" | "resize_end";
    nodeId: string;
    startDate: string | null;
    dueDate: string | null;
  } | null>(null);

  const proposedChanges = useMemo(() => changedNodeIds(branches), [branches]);
  const collapsed = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);
  const visibleGanttRows = useMemo(
    () =>
      buildTimelineGanttVisibleRows({ nodes, tree, dependencies }, collapsed, {
        projectDisplayName,
      }),
    [collapsed, dependencies, nodes, projectDisplayName, tree],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const dateRange = useMemo(() => buildRange(nodes, dayWidth), [nodes, dayWidth]);
  const months = useMemo(() => monthSegments(dateRange.days), [dateRange.days]);
  const totalWidth = Math.max(760, dateRange.days.length * dayWidth);
  const todayOffset = diffDays(dateRange.start, dateRange.today);
  const positionedRows: PositionedRow[] = visibleGanttRows.map((row, index) => ({ ...row, y: index * ROW_HEIGHT }));
  const rowByNodeId = new Map(positionedRows.map((row) => [row.id, row]));

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const integrity = validateTimelineSnapshot(
      { nodes, tree, dependencies },
      { label: persistKey },
    );
    if (!integrity.ok) {
      console.warn("[Timeline2 validateTimelineSnapshot]", {
        persistKey,
        errors: integrity.errors,
        warnings: integrity.warnings,
      });
    } else if (integrity.warnings.length > 0) {
      console.info("[Timeline2 validateTimelineSnapshot] warnings", {
        persistKey,
        warnings: integrity.warnings,
      });
    }

    const depIo = new Map<string, { in: number; out: number }>();
    for (const node of nodes) {
      depIo.set(node.id, { in: 0, out: 0 });
    }
    for (const dependency of dependencies) {
      const from = depIo.get(dependency.fromNodeId);
      const to = depIo.get(dependency.toNodeId);
      if (from) from.out += 1;
      if (to) to.in += 1;
    }
    const sample = visibleGanttRows.slice(0, PHASE0_GANTT_ROW_LOG_LIMIT).map((row) => {
      const io = depIo.get(row.id) ?? { in: 0, out: 0 };
      return {
        wbs: row.wbs,
        depth: row.depth,
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.name.length > 80 ? `${row.name.slice(0, 80)}…` : row.name,
        status: row.status,
        rollupHealth: row.displayStatus,
        progress: row.progress,
        displayProgress: row.displayProgress,
        startDate: row.startDate,
        dueDate: row.dueDate,
        rollupStart: row.displayStartDate,
        rollupDue: row.displayDueDate,
        assigneeCount: row.assignees.length,
        isCriticalPath: row.isCriticalPath,
        dependencyFanIn: io.in,
        dependencyFanOut: io.out,
      };
    });
    const renderProbe = visibleGanttRows
      .slice(0, PHASE0_GANTT_ROW_LOG_LIMIT)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        progress: row.progress,
        displayProgress: row.displayProgress,
        status: row.status,
        displayStatus: row.displayStatus,
        startDate: row.startDate,
        dueDate: row.dueDate,
        displayStartDate: row.displayStartDate,
        displayDueDate: row.displayDueDate,
        isProgressDerived: row.isProgressDerived,
        isDatesDerived: row.isDatesDerived,
      }));
    console.info("[Timeline2 Gantt Phase0] visible-row sample", {
      persistKey,
      visibleRowCount: visibleGanttRows.length,
      flatNodeCount: nodes.length,
      dependencyEdgeCount: dependencies.length,
      sample,
      renderProbe,
    });
  }, [collapsed, dependencies, nodes, persistKey, tree, visibleGanttRows]);
  const sourceNode = sourceNodeId ? nodeById.get(sourceNodeId) ?? null : null;
  const searchText = normalizeText(search);
  const previewNodeId = hoveredCandidateId;
  const resolvedColumnWidth = (key: ResizableColumnKey) =>
    columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key];

  const activeColumns = columnOrder.filter((key) => key === "task_name" || visibleColumns.includes(key));
  const [taskNameMinW, taskNameMaxW] = taskNameColumnResizeBounds();
  const outlineTaskWidth = clamp(taskNameColumnWidth, taskNameMinW, taskNameMaxW);
  const totalOutlineWidth = activeColumns.reduce(
    (sum, key) => sum + (key === "task_name" ? outlineTaskWidth : resolvedColumnWidth(key as ResizableColumnKey)),
    0,
  );
  const gridTemplateColumns = activeColumns
    .map((key) => (key === "task_name" ? `${outlineTaskWidth}px` : `${resolvedColumnWidth(key as ResizableColumnKey)}px`))
    .join(" ");

  useEffect(() => {
    writeSessionNumber(paneWidthKey, outlineWidth);
  }, [outlineWidth, paneWidthKey]);

  useEffect(() => {
    writeSessionNumber(dayWidthKey, dayWidth);
  }, [dayWidth, dayWidthKey]);

  useEffect(() => {
    writeSessionOrder(columnOrderKey, columnOrder);
  }, [columnOrder, columnOrderKey]);

  useEffect(() => {
    writeSessionOutlineWidths(columnWidthsKey, { resizable: columnWidths, taskName: taskNameColumnWidth });
  }, [columnWidths, columnWidthsKey, taskNameColumnWidth]);

  useEffect(() => {
    if (!dependencyMode) {
      setSourceNodeId(null);
      setHoveredCandidateId(null);
      setSearch("");
      setDirection("unblocks");
      setRelation("finish_to_start");
      setLagDays(0);
      setDependencySaving(false);
    }
  }, [dependencyMode]);

  useEffect(() => {
    if (!focusDependencyNodeId) return;
    onDependencyModeChange(true);
    setSourceNodeId(focusDependencyNodeId);
    setHoveredCandidateId(null);
    setSearch("");
    setDirection("unblocks");
    setRelation("finish_to_start");
    setLagDays(0);
    onFocusDependencyHandled?.();
  }, [focusDependencyNodeId, onDependencyModeChange, onFocusDependencyHandled]);

  useEffect(() => {
    if (hydratedPrefsKeyRef.current === persistKey) return;
    hydratedPrefsKeyRef.current = persistKey;
    setColumnOrder(
      preferences.columnOrder.length > 0
        ? preferences.columnOrder.filter((value): value is TimelineColumnKey => DEFAULT_COLUMN_ORDER.includes(value as TimelineColumnKey))
        : DEFAULT_COLUMN_ORDER,
    );
    setVisibleColumns(() => {
      const vis = preferences.visibleColumns.filter((value): value is ResizableColumnKey =>
        (OPTIONAL_TIMELINE_OUTLINE_COLUMNS as ReadonlyArray<string>).includes(value),
      );
      return vis.length > 0 ? vis : [...OPTIONAL_TIMELINE_OUTLINE_COLUMNS];
    });
    setOutlineWidth(clamp(preferences.outlineWidth, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
    setDayWidth(clamp(preferences.dayWidth, 28, 52));
    setColumnWidths(() => {
      const w = preferences.columnWidths ?? {};
      const next: Record<ResizableColumnKey, number> = { ...DEFAULT_COLUMN_WIDTHS };
      (Object.keys(DEFAULT_COLUMN_WIDTHS) as ResizableColumnKey[]).forEach((key) => {
        const raw = Number(w[key]);
        if (Number.isFinite(raw) && raw > 0) {
          const [mn, mx] = timelineColumnResizeBounds(key);
          next[key] = clamp(raw, mn, mx);
        }
      });
      return next;
    });
    const tnRaw = Number(preferences.columnWidths.task_name);
    const [tnMin, tnMax] = taskNameColumnResizeBounds();
    setTaskNameColumnWidth(
      Number.isFinite(tnRaw) && tnRaw >= tnMin ? clamp(tnRaw, tnMin, tnMax) : DEFAULT_TASK_NAME_COLUMN_WIDTH,
    );
    setCollapsedNodeIds(preferences.collapsedNodeIds);
  }, [persistKey, preferences, setCollapsedNodeIds]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void onSavePreferences({
        ...preferences,
        columnOrder,
        visibleColumns,
        columnWidths: { ...preferences.columnWidths, ...columnWidths, task_name: taskNameColumnWidth },
        outlineWidth,
        dayWidth,
        collapsedNodeIds,
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [
    collapsedNodeIds,
    columnOrder,
    columnWidths,
    dayWidth,
    taskNameColumnWidth,
    visibleColumns,
    onSavePreferences,
    outlineWidth,
    preferences,
  ]);

  useEffect(() => {
    if (!dragState || !dragMetaRef.current) return;
    const onMove = (event: PointerEvent) => {
      const meta = dragMetaRef.current;
      if (!meta) return;
      const deltaDays = Math.round((event.clientX - meta.originX) / dayWidth);
      let previewStartDate = meta.startDate;
      let previewDueDate = meta.dueDate;
      if (meta.mode === "move") {
        previewStartDate = shiftIso(meta.startDate, deltaDays);
        previewDueDate = shiftIso(meta.dueDate, deltaDays);
      } else if (meta.mode === "resize_start" && meta.startDate) {
        const nextStart = shiftIso(meta.startDate, deltaDays);
        if (nextStart && meta.dueDate && nextStart <= meta.dueDate) {
          previewStartDate = nextStart;
        }
      } else if (meta.mode === "resize_end" && meta.dueDate) {
        const nextDue = shiftIso(meta.dueDate, deltaDays);
        if (nextDue && meta.startDate && nextDue >= meta.startDate) {
          previewDueDate = nextDue;
        }
      }
      setDragState({
        ...dragState,
        previewStartDate,
        previewDueDate,
      });
    };
    const onUp = () => {
      const meta = dragMetaRef.current;
      const finalDragState = dragState;
      dragMetaRef.current = null;
      setDragState(null);
      if (
        meta &&
        finalDragState &&
        (finalDragState.previewStartDate !== finalDragState.startDate ||
          finalDragState.previewDueDate !== finalDragState.dueDate)
      ) {
        void onUpdateNode(finalDragState.nodeId, {
          startDate: finalDragState.previewStartDate,
          dueDate: finalDragState.previewDueDate,
        });
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dayWidth, dragState, onUpdateNode, setDragState]);

  const openRowSheet = (row: TimelineGanttVisibleRow) => {
    const node = nodeById.get(row.id);
    if (!node) return;
    onOpenSheet({
      mode: "edit",
      nodeId: node.id,
      draft: nodeToDraft(node),
    });
  };

  const shiftIso = (iso: string | null, deltaDays: number) => {
    if (!iso) return null;
    return addDays(new Date(`${iso}T00:00:00Z`), deltaDays).toISOString().slice(0, 10);
  };

  function startBarDrag(
    event: React.PointerEvent,
    row: TimelineGanttVisibleRow,
    mode: "move" | "resize_start" | "resize_end",
    startDate: string | null,
    dueDate: string | null,
  ) {
    if (row.kind !== "task" || dependencyMode || !startDate || !dueDate || isTimeline2SyntheticProjectRootId(row.id)) return;
    event.preventDefault();
    event.stopPropagation();
    dragMetaRef.current = {
      originX: event.clientX,
      mode,
      nodeId: row.id,
      startDate,
      dueDate,
    };
    setDragState({
      nodeId: row.id,
      mode,
      startDate,
      dueDate,
      previewStartDate: startDate,
      previewDueDate: dueDate,
    });
  }

  function previewEdgeFor(nodeId: string | null) {
    if (!sourceNode || !nodeId) return null;
    return direction === "blocked_by"
      ? { fromNodeId: nodeId, toNodeId: sourceNode.id }
      : { fromNodeId: sourceNode.id, toNodeId: nodeId };
  }

  const previewEdge = previewEdgeFor(previewNodeId);
  const previewDependency = useMemo(() => {
    if (!sourceNode || !previewNodeId) return null;
    const previewNode = nodeById.get(previewNodeId) ?? null;
    if (!previewNode) return null;
    return relationPreview(relation, sourceNode.title, previewNode.title, direction);
  }, [direction, nodeById, previewNodeId, relation, sourceNode]);

  const previewPath = previewEdge ? ConnectorPath({
    rowByNodeId,
    dateStart: dateRange.start,
    dayWidth,
    fromNodeId: previewEdge.fromNodeId,
    toNodeId: previewEdge.toNodeId,
  }) : null;

  const connectorPaths = dependencies.flatMap((dependency) => {
    const d = ConnectorPath({
      rowByNodeId,
      dateStart: dateRange.start,
      dayWidth,
      fromNodeId: dependency.fromNodeId,
      toNodeId: dependency.toNodeId,
    });
    if (!d) return [];
    const sourceRelated = dependency.fromNodeId === sourceNodeId || dependency.toNodeId === sourceNodeId;
    return [{ id: dependency.id, d, sourceRelated }];
  });

  async function commitDependencyChange(candidateId: string) {
    if (isTimeline2SyntheticProjectRootId(candidateId)) return;
    if (!sourceNode || dependencySaving) return;
    const edge = previewEdgeFor(candidateId);
    if (!edge) return;
    const existing = dependencies.find(
      (dependency) => dependency.fromNodeId === edge.fromNodeId && dependency.toNodeId === edge.toNodeId,
    ) ?? null;
    setDependencySaving(true);
    try {
      if (existing && existing.relation === relation) {
        await onDeleteDependency(existing.id);
      } else if (existing) {
        await onDeleteDependency(existing.id);
        await onCreateDependency({
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          relation,
          lagDays,
        });
      } else {
        await onCreateDependency({
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          relation,
          lagDays,
        });
      }
      onDependencyModeChange(false);
    } finally {
      setDependencySaving(false);
    }
  }

  function resetLayout() {
    setOutlineWidth(DEFAULT_OUTLINE_WIDTH);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setVisibleColumns(OPTIONAL_TIMELINE_OUTLINE_COLUMNS);
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    setTaskNameColumnWidth(DEFAULT_TASK_NAME_COLUMN_WIDTH);
    setDayWidth(38);
    setCollapsedNodeIds([]);
  }

  function startPaneResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = outlineWidth;
    const onMove = (moveEvent: MouseEvent) => {
      setOutlineWidth(clamp(startWidth + (moveEvent.clientX - startX), MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startColumnResize(event: React.MouseEvent<HTMLSpanElement>, key: ResizableColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startColWidth = resolvedColumnWidth(key);
    const startPaneWidth = outlineWidth;
    const [min, max] = timelineColumnResizeBounds(key);
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextColWidth = clamp(startColWidth + delta, min, max);
      const applied = nextColWidth - startColWidth;
      setColumnWidths((prev) => ({
        ...prev,
        [key]: nextColWidth,
      }));
      setOutlineWidth(clamp(startPaneWidth + applied, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startTaskNameColumnResize(event: React.MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startTask = taskNameColumnWidth;
    const startPane = outlineWidth;
    const [minT, maxT] = taskNameColumnResizeBounds();
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextTask = clamp(startTask + delta, minT, maxT);
      const applied = nextTask - startTask;
      setTaskNameColumnWidth(nextTask);
      setOutlineWidth((prev) => clamp(startPane + applied, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderOutlineCell(row: PositionedRow, column: TimelineColumnKey) {
    if (column === "task_name") {
      const links = dependencyCount(row.id, dependencies);
      return (
        <div className="min-w-0">
          <div className="flex min-h-full min-w-0 items-stretch gap-1 py-1">
            <OutlineGuide
              row={row}
              hasChildren={row.hasStructuralChildren}
              collapsed={collapsed.has(row.id)}
              onToggle={() => toggleCollapsedNodeId(row.id)}
            />
            <span
              className="flex w-9 shrink-0 items-center justify-center self-stretch text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {row.wbs}
            </span>
            <span className="flex w-7 shrink-0 items-center justify-center self-stretch">
              <RowKindGlyph kind={row.kind} />
            </span>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
              <span
                className={`block leading-snug break-words line-clamp-2 ${row.kind === "group" ? "text-[12px] font-semibold" : "text-[12px] font-medium"}`}
                style={{ color: "var(--text-1)" }}
              >
                {row.name}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
                <span>{KIND_LABELS[row.kind]}</span>
                {row.rollupDescendantCount > 0 && <span>{row.rollupDescendantCount} below</span>}
                {links > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold"
                    style={{ background: "#f1f5f9", color: "#475569" }}
                    title={`${links} dependency links`}
                  >
                    <Link2 size={9} />
                    {links}
                  </span>
                )}
                {dependencyMode && sourceNode && row.id !== sourceNode.id && (
                  <span style={{ color: "#5d7286" }}>
                    {dependencies.some((dependency) => {
                      const edge = previewEdgeFor(row.id);
                      return edge
                        ? dependency.fromNodeId === edge.fromNodeId && dependency.toNodeId === edge.toNodeId
                        : false;
                    })
                      ? "linked"
                      : "candidate"}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      );
    }
    if (column === "status") {
      const badge = <StatusBadge status={row.displayStatus} />;
      if (row.kind !== "task" || row.hasStructuralChildren) {
        return (
          <span className="inline-flex cursor-default select-none opacity-95" title="Roll-up status — edit leaf tasks">
            {badge}
          </span>
        );
      }
      return badge;
    }
    if (column === "priority") {
      return (
        <div className="flex min-w-0 justify-center overflow-hidden">
          <span className="scale-90">
            <PriorityBadge priority={row.displayPriority} />
          </span>
        </div>
      );
    }
    if (column === "progress") {
      return <OutlineProgressMeter row={row} />;
    }
    if (column === "start_date") {
      const derivedDates = row.isDatesDerived;
      return (
        <span
          className={`block w-full truncate text-center text-[11px] font-medium ${derivedDates ? "cursor-default select-none" : ""}`}
          style={{ color: row.displayStartDate ? "var(--text-2)" : "var(--text-disabled)" }}
          title={derivedDates ? "Roll-up start — edit dated leaf tasks" : undefined}
        >
          {formatDate(row.displayStartDate)}
        </span>
      );
    }
    if (column === "due_date") {
      const derivedDates = row.isDatesDerived;
      return (
        <span
          className={`block w-full truncate text-center text-[11px] font-medium ${derivedDates ? "cursor-default select-none" : ""}`}
          style={{ color: row.displayDueDate ? "var(--text-2)" : "var(--text-disabled)" }}
          title={derivedDates ? "Roll-up due date — edit dated leaf tasks" : undefined}
        >
          {formatDate(row.displayDueDate)}
        </span>
      );
    }
    if (column === "assignee") {
      const people = row.assignees;
      if (people.length === 0) {
        return (
          <span className="block w-full truncate text-[10px] font-medium" style={{ color: "var(--text-disabled)" }}>
            —
          </span>
        );
      }
      return (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <div className="flex shrink-0 -space-x-1.5">
            {people.slice(0, 4).map((assignee) => (
              <span key={assignee.userId} className="rounded-full ring-2 ring-white">
                <PersonAvatar name={assignee.name} />
              </span>
            ))}
          </div>
          <span className="min-w-0 truncate text-[10px] font-semibold leading-tight" style={{ color: "var(--text-2)" }} title={people.map((p) => p.name).join(", ")}>
            {people.map((p) => p.name).join(", ")}
          </span>
        </div>
      );
    }
    return null;
  }

  const renderOutlineRow = (row: PositionedRow) => {
    const changed = proposedChanges.has(row.id);
    const rowIsSource = sourceNodeId === row.id;
    const rowIsPreview = previewNodeId === row.id;
    const matches = !searchText || searchableTimelineGanttRow(row).includes(searchText);
    const isValidCandidate =
      (!sourceNode || row.id !== sourceNode.id) && !isTimeline2SyntheticProjectRootId(row.id);
    const dimmed = dependencyMode && (!matches || !isValidCandidate);
    const groupLike = row.depth === 0 || row.kind === "group";
    return (
      <div
        key={row.id}
        className="grid items-stretch gap-0 border-b text-left"
        style={{
          height: ROW_HEIGHT,
          gridTemplateColumns,
          borderColor: "#dfe8ee",
          background: rowIsSource
            ? "#eef6fb"
            : rowIsPreview
              ? "#f6fafc"
              : groupLike
                ? "#f7fbf8"
                : changed
                  ? "#f8fbfd"
                  : "#fff",
          boxShadow: groupLike ? "inset 3px 0 0 #9cc5a8" : undefined,
          opacity: dimmed ? 0.35 : 1,
        }}
        onMouseEnter={() => {
          if (!dependencyMode || !sourceNode || !isValidCandidate || !matches) return;
          setHoveredCandidateId(row.id);
        }}
        onMouseLeave={() => {
          if (!dependencyMode) return;
          setHoveredCandidateId(null);
        }}
        onClick={() => {
          if (!dependencyMode) {
            openRowSheet(row);
            return;
          }
          if (!sourceNode || !isValidCandidate || !matches) return;
          void commitDependencyChange(row.id);
        }}
      >
        {activeColumns.map((column, columnIndex) => (
          <div
            key={`${row.id}-${column}`}
            className={`flex min-h-full min-w-0 overflow-hidden border-[#e8eef4] px-2 py-0.5 ${
              columnIndex > 0 ? "border-l" : ""
            } ${
              column === "task_name"
                ? "items-stretch justify-start"
                : column === "assignee" || column === "progress"
                  ? "items-center justify-start"
                  : "items-center justify-center"
            }`}
          >
            {renderOutlineCell(row, column)}
          </div>
        ))}
      </div>
    );
  };

  const columnLabels: Record<TimelineColumnKey, string> = {
    task_name: "Task name",
    status: "Status",
    priority: "Priority",
    progress: "Progress",
    start_date: "Start date",
    due_date: "Due date",
    assignee: "Assignee",
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--border)", background: "#fff" }}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Timeline 2</p>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {visibleGanttRows.length} rows · {dependencies.length} links · {nodes.filter((node) => node.kind === "milestone").length} milestones
          </span>
          {dependencyMode && sourceNode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef6fb] px-2 py-1 text-[11px] font-semibold" style={{ color: "#214968" }}>
              <Link2 size={12} />
              Editing links for {sourceNode.title}
            </span>
          )}
          {branches.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "#edf3f9", color: "#214968" }}>
              <Bot size={12} />
              {branches.length} AI proposal{branches.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {OPTIONAL_TIMELINE_OUTLINE_COLUMNS.map((column) => (
            <button
              key={column}
              type="button"
              onClick={() => setVisibleColumns((prev) =>
                prev.includes(column)
                  ? prev.filter((value) => value !== column)
                  : [...prev, column],
              )}
              className="hidden h-10 items-center rounded-lg border bg-white px-3 text-[11px] font-semibold lg:inline-flex"
              style={visibleColumns.includes(column)
                ? { borderColor: "#b8cce0", color: "#214968", background: "#eef6fb", boxShadow: "inset 0 0 0 1px #d7e6f2" }
                : { borderColor: "var(--border)", color: "var(--text-2)", boxShadow: "none" }}
            >
              {columnLabels[column]}
            </button>
          ))}
          <button type="button" onClick={resetLayout} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
            Reset layout
          </button>
          <button type="button" onClick={onOpenAi} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
            <Bot size={14} />
            AI
          </button>
          <button type="button" onClick={() => setDayWidth((value) => Math.max(28, value - 4))} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white" style={{ borderColor: "var(--border)" }} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button type="button" onClick={() => setDayWidth((value) => Math.min(52, value + 4))} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white" style={{ borderColor: "var(--border)" }} title="Zoom in">
            <ZoomIn size={15} />
          </button>
        </div>
      </div>

      {dependencyMode && (
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)", background: "#f8fbfd" }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                {sourceNode ? `Dependencies for ${sourceNode.title}` : "Dependency source missing"}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                {sourceNode
                  ? "Click one target to add, remove, or replace that single relationship."
                  : "The source task is no longer available. Cancel and reopen from the task sheet."}
                {previewDependency ? ` ${previewDependency} Lag: ${lagDays}d.` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDirection("blocked_by")}
                className="h-9 rounded-xl px-3 text-[12px] font-semibold"
                style={direction === "blocked_by" ? { background: "#eef6fb", color: "#214968" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                Blocked by
              </button>
              <button
                type="button"
                onClick={() => setDirection("unblocks")}
                className="h-9 rounded-xl px-3 text-[12px] font-semibold"
                style={direction === "unblocks" ? { background: "#eef6fb", color: "#214968" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                Unblocks
              </button>
              <button
                type="button"
                onClick={() => onDependencyModeChange(false)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(Object.entries(DEPENDENCY_LABELS) as Array<[Timeline2DependencyRelation, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRelation(value)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={relation === value ? { background: "#214968", color: "#fff" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
                  title={label}
                >
                  {label}
                </button>
              ))}
              <label className="inline-flex h-[34px] items-center gap-2 rounded-full border bg-white px-3 text-[11px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                Lag
                <input
                  type="number"
                  value={lagDays}
                  onChange={(event) => setLagDays(Number(event.target.value) || 0)}
                  className="w-12 bg-transparent text-right outline-none"
                />
                d
              </label>
            </div>
            <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border bg-white px-3 text-[12px]" style={{ borderColor: "var(--border)" }}>
              <Search size={14} style={{ color: "var(--text-muted)" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Narrow targets"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
          </div>
        </div>
      )}

      <div className="flex min-h-[360px] overflow-hidden">
        <div className="shrink-0 border-r bg-white" style={{ width: outlineWidth, borderColor: "var(--border)" }}>
          <div className="h-full overflow-x-auto overflow-y-hidden">
            <div style={{ minWidth: totalOutlineWidth }}>
              <div
                className="grid gap-0 border-b text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ height: HEADER_HEIGHT, gridTemplateColumns, borderColor: "var(--border)", background: "#f4f8fb", color: "var(--text-2)" }}
              >
                {activeColumns.map((column, columnIndex) => (
                  <div
                    key={column}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dragging = event.dataTransfer.getData("text/timeline2-column") as TimelineColumnKey;
                      if (!TIMELINE_GANTT_COLUMN_KEYS.includes(dragging)) return;
                      setColumnOrder((prev) => reorderColumns(prev, dragging, column));
                    }}
                    className={`relative flex min-h-full min-w-0 items-center overflow-hidden border-[#e8eef4] px-2 py-1 ${columnIndex > 0 ? "border-l" : ""} justify-center`}
                  >
                    <span
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/timeline2-column", column);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className="inline-flex max-w-full cursor-grab select-none items-center justify-center rounded-md border px-2 py-1 mx-auto text-center leading-tight active:cursor-grabbing"
                      style={{
                        borderColor: "#b9cce0",
                        background: "#fff",
                        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)",
                      }}
                    >
                      <span className="truncate">{columnLabels[column]}</span>
                    </span>
                    {column === "task_name" ? (
                      <span
                        role="separator"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startTaskNameColumnResize(event);
                        }}
                        className="absolute top-0 bottom-0 right-0 z-[3] w-3 cursor-col-resize"
                        style={{ touchAction: "none" }}
                        aria-label="Resize task name column"
                      />
                    ) : (
                      <span
                        role="separator"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startColumnResize(event, column);
                        }}
                        className="absolute top-0 bottom-0 right-0 z-[3] w-3 cursor-col-resize"
                        style={{ touchAction: "none" }}
                        aria-label={`Resize ${columnLabels[column]} column`}
                      />
                    )}
                  </div>
                ))}
              </div>
              {positionedRows.map((row) => renderOutlineRow(row))}
            </div>
          </div>
        </div>

        <div
          role="separator"
          aria-label="Resize outline"
          onMouseDown={startPaneResize}
          className="shrink-0 cursor-col-resize border-r"
          style={{ width: 8, borderColor: "var(--border)", background: "#f4f8fb" }}
        />

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ minWidth: totalWidth, position: "relative" }}>
            <div className="border-b" style={{ borderColor: "var(--border)", background: "#fbfcfe" }}>
              <div className="grid h-6" style={{ gridTemplateColumns: months.map((month) => `${month.span * dayWidth}px`).join(" ") }}>
                {months.map((month) => (
                  <div key={month.key} className="border-r px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    {month.label}
                  </div>
                ))}
              </div>
              <div className="grid h-8" style={{ gridTemplateColumns: `repeat(${dateRange.days.length}, ${dayWidth}px)` }}>
                {dateRange.days.map((day) => {
                  const date = new Date(`${day}T00:00:00`);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div key={day} className="border-r px-1 py-0.5 text-center text-[10px]" style={{ borderColor: "var(--border)", color: weekend ? "var(--text-disabled)" : "var(--text-2)" }}>
                      <div>{date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 1)}</div>
                      <div className="font-semibold">{date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative" style={{ height: positionedRows.length * ROW_HEIGHT }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dateRange.days.length}, ${dayWidth}px)` }}>
                {dateRange.days.map((day) => {
                  const date = new Date(`${day}T00:00:00`);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return <span key={day} className="border-r" style={{ borderColor: "#eef2f6", background: weekend ? "#fbfcfe" : undefined }} />;
                })}
              </div>

              {positionedRows.map((row) => (
                <div
                  key={`band-${row.id}`}
                  className="absolute left-0 right-0 border-b"
                  style={{
                    top: row.y,
                    height: ROW_HEIGHT,
                    borderColor: "#e6edf2",
                    background: row.depth === 0 || row.kind === "group"
                      ? "rgba(156,197,168,0.06)"
                      : undefined,
                  }}
                />
              ))}

              {todayOffset >= 0 && todayOffset < dateRange.days.length && (
                <div
                  aria-hidden
                  className="absolute top-0 bottom-0 z-20"
                  style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                >
                  <div className="absolute left-[-18px] top-2 rounded-full bg-[#b4233a] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                    Today
                  </div>
                  <div className="h-full w-[2px] bg-[#b4233a]" />
                </div>
              )}

              {(connectorPaths.length > 0 || previewPath) && (
                <svg className="pointer-events-none absolute inset-0 z-10" width={totalWidth} height={positionedRows.length * ROW_HEIGHT}>
                  <defs>
                    <marker id="timeline2-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="#8aa6bb" />
                    </marker>
                  </defs>
                  {connectorPaths.map((path) => (
                    <path
                      key={path.id}
                      d={path.d}
                      fill="none"
                      stroke={dependencyMode && sourceNodeId ? (path.sourceRelated ? "#5d8bab" : "#d2dbe2") : "#8aa6bb"}
                      strokeWidth={dependencyMode && sourceNodeId && path.sourceRelated ? 1.8 : 1.3}
                      markerEnd="url(#timeline2-arrow)"
                    />
                  ))}
                  {previewPath && (
                    <path d={previewPath} fill="none" stroke="#214968" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#timeline2-arrow)" />
                  )}
                </svg>
              )}

              {positionedRows.map((row) => {
                const previewStart = dragState?.nodeId === row.id ? dragState.previewStartDate : null;
                const previewDue = dragState?.nodeId === row.id ? dragState.previewDueDate : null;
                const isLeafTaskRow = row.kind === "task" && !row.hasStructuralChildren;
                const start =
                  previewStart ??
                  (isLeafTaskRow ? row.startDate : row.displayStartDate);
                const due =
                  previewDue ??
                  (isLeafTaskRow
                    ? row.dueDate ?? row.startDate ?? start
                    : row.displayDueDate ?? row.displayStartDate ?? start);
                const hasDates = Boolean(start && due);
                const left = hasDates ? Math.max(0, diffDays(dateRange.start, start!)) : 0;
                const width = hasDates ? Math.max(1, diffDays(start!, due!) + 1) : 1;
                const changed = proposedChanges.has(row.id);
                const isSource = sourceNodeId === row.id;
                const isPreview = previewNodeId === row.id;
                const statusTone = STATUS_COLORS[row.displayStatus];
                const progressFillPct = clamp(row.displayProgress, 0, 100);
                const barWidthPx =
                  row.kind === "milestone" ? 12 : Math.max(28, width * dayWidth - 12);
                const matches = !searchText || searchableTimelineGanttRow(row).includes(searchText);
                const dependencyCandidate =
                  matches && !isTimeline2SyntheticProjectRootId(row.id);
                const dimmed = dependencyMode && (row.id === sourceNodeId ? false : !dependencyCandidate);
                const isLinkedToSource = Boolean(sourceNode && dependencies.find((dependency) => {
                  const edge = previewEdgeFor(row.id);
                  return edge
                    ? dependency.fromNodeId === edge.fromNodeId && dependency.toNodeId === edge.toNodeId
                    : false;
                }));

                return (
                  <div
                    key={row.id}
                    className="absolute left-0 right-0"
                    style={{
                      top: row.y,
                      height: ROW_HEIGHT,
                      background: isSource ? "rgba(33,73,104,0.05)" : isPreview ? "rgba(93,139,171,0.05)" : changed ? "rgba(180,198,215,0.06)" : undefined,
                      opacity: dimmed ? 0.32 : 1,
                    }}
                    onMouseEnter={() => {
                      if (
                        !dependencyMode ||
                        !sourceNode ||
                        row.id === sourceNode.id ||
                        !dependencyCandidate
                      ) {
                        return;
                      }
                      setHoveredCandidateId(row.id);
                    }}
                    onMouseLeave={() => {
                      if (!dependencyMode) return;
                      setHoveredCandidateId(null);
                    }}
                  >
                    {hasDates ? (
                      <div
                        className="absolute z-30 flex max-w-full items-center gap-2"
                        style={{
                          top: row.kind === "milestone" ? (ROW_HEIGHT - 12) / 2 : (ROW_HEIGHT - 16) / 2,
                          left: left * dayWidth + 6,
                        }}
                      >
                        <button
                          type="button"
                          disabled={dependencySaving}
                          onPointerDown={(event) => {
                            if (isLeafTaskRow) {
                              startBarDrag(event, row, "move", start ?? null, due ?? null);
                            }
                          }}
                          onClick={() => {
                            if (dragState?.nodeId === row.id) return;
                            if (!dependencyMode) {
                              openRowSheet(row);
                              return;
                            }
                            if (
                              !sourceNode ||
                              row.id === sourceNode.id ||
                              !dependencyCandidate ||
                              isTimeline2SyntheticProjectRootId(row.id)
                            ) {
                              return;
                            }
                            void commitDependencyChange(row.id);
                          }}
                          className={`relative shrink-0 rounded-sm shadow-sm disabled:opacity-60 ${
                            row.kind === "milestone" ? "" : "min-w-[28px]"
                          }`}
                          style={{
                            position: "relative",
                            overflow: "hidden",
                            appearance: "none",
                            WebkitAppearance: "none",
                            display: "block",
                            lineHeight: 0,
                            height: row.kind === "milestone" ? 12 : 16,
                            width: barWidthPx,
                            margin: 0,
                            padding: 0,
                            boxSizing: "border-box",
                            border:
                              row.isCriticalPath && row.kind !== "milestone"
                                ? "1px solid rgba(122, 18, 39, 0.7)"
                                : "none",
                            background: row.kind === "group" ? "#5d8bab" : statusTone.bar,
                            transform: row.kind === "milestone" ? "rotate(45deg)" : undefined,
                            boxShadow: isSource
                              ? "0 0 0 3px rgba(33,73,104,0.18)"
                              : row.isCriticalPath
                                ? "0 0 0 2px rgba(180,35,58,0.5)"
                                : isPreview || isLinkedToSource
                                  ? "0 0 0 2px rgba(93,139,171,0.16)"
                                  : "0 1px 2px rgba(17,23,44,0.12)",
                          }}
                          title={`${row.name}: ${formatDate(start)} - ${formatDate(due)}`}
                        >
                          {row.kind !== "milestone" ? (
                            <div
                              className="barOuter"
                              style={{
                                position: "relative",
                                overflow: "hidden",
                                width: "100%",
                                height: "100%",
                                margin: 0,
                                padding: 0,
                              }}
                            >
                              <div
                                aria-hidden
                                className="barFill"
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: `${progressFillPct}%`,
                                  margin: 0,
                                  padding: 0,
                                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                                }}
                              />
                              {isLeafTaskRow ? (
                                <>
                                  <span
                                    role="presentation"
                                    onPointerDown={(event) =>
                                      startBarDrag(event, row, "resize_start", start ?? null, due ?? null)}
                                    className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize bg-transparent hover:bg-black/15"
                                  />
                                  <span
                                    role="presentation"
                                    onPointerDown={(event) =>
                                      startBarDrag(event, row, "resize_end", start ?? null, due ?? null)}
                                    className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize bg-transparent hover:bg-black/15"
                                  />
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </button>
                        {row.kind !== "milestone" ? (
                          <span
                            className="progressLabel shrink-0 text-[10px] font-semibold tabular-nums"
                            style={{ color: "var(--text-2)" }}
                          >
                            {progressFillPct}%
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <button type="button" onClick={() => openRowSheet(row)} className="absolute left-3 top-[8px] z-20 rounded-full border bg-white px-2 py-0.5 text-[10px]" style={{ borderColor: row.isCriticalPath ? "#fda4af" : "var(--border)", color: row.isCriticalPath ? "#9f1239" : "var(--text-disabled)" }}>
                        unscheduled
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
