import type {
  Timeline2Assignee,
  Timeline2Node,
  Timeline2Priority,
  Timeline2Snapshot,
  Timeline2Status,
} from "@larry/shared";
import { timeline2DisplayStatus } from "@larry/shared/timeline2";
import { computeTimeline2RollupAggregateForSummaryNode } from "@larry/shared/timeline2-rollup";
import { KIND_LABELS, normalizeText, PRIORITY_LABELS } from "./timeline2-ui";
import { visibleRows } from "./timeline2-gantt-helpers";

/** Display-only root row id — never persisted or PATCHed (see Phase 0 doc). */
export const TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID = "__timeline2_project_root__";

export function isTimeline2SyntheticProjectRootId(id: string): boolean {
  return id === TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID;
}

function clampProgressDisplay(progress: number): number {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

/** Alias for UI naming (`Timeline2Status` from `@larry/shared`). */
export type TimelineStatus = Timeline2Status;

/**
 * Canonical row for Timeline / Gantt rendering — separates **stored** snapshot fields from **display**
 * fields derived from rollups so bars, outlines, and editors cannot silently disagree.
 */
export interface TimelineRenderRow {
  id: string;
  parentId: string | null;
  depth: number;
  kind: "group" | "task" | "milestone";
  name: string;
  /** Stored status on the row (may be stale for summary rows until saved; see `displayStatus`). */
  status: TimelineStatus;
  /** Status shown in the timeline: stored value on leaves; roll-up aggregate on summaries. */
  displayStatus: TimelineStatus;
  /** Stored progress on the row (0–100). */
  progress: number;
  /** Progress shown on bars / parent rows (matches backend-derived group progress when applicable). */
  displayProgress: number;
  startDate: string | null;
  dueDate: string | null;
  displayStartDate: string | null;
  displayDueDate: string | null;
  assignees: Timeline2Assignee[];
  /** Dependency edge ids where this node is `from` (outgoing toward successors). */
  dependencyIds: string[];
  /** Dependency edge ids where this node is `to` (incoming from predecessors). */
  dependentIds: string[];
  isCriticalPath: boolean;
  /** Structural expansion — node has children that are currently revealed in the outline. */
  isExpanded: boolean;
  /** Any row with structural children shows server-derived progress (`node.progress` after rollup). */
  isProgressDerived: boolean;
  /** Summary rows surface rollup span for bars; leaf rows edit stored dates. */
  isDatesDerived: boolean;
  /** Roll-up / leaf priority shown in the outline (worst among children for summaries). */
  displayPriority: Timeline2Priority;
}

/** Gantt/outline row: base render fields plus outline tree chrome (WBS, guides, roll-up counts). */
export type TimelineGanttVisibleRow = TimelineRenderRow & {
  wbs: string;
  path: number[];
  isLastSibling: boolean;
  ancestorHasNext: boolean[];
  parentIds: string[];
  hasStructuralChildren: boolean;
  rollupDescendantCount: number;
};

function appendEdge(map: Map<string, string[]>, nodeId: string, edgeId: string) {
  const bucket = map.get(nodeId);
  if (bucket) bucket.push(edgeId);
  else map.set(nodeId, [edgeId]);
}

function edgeMaps(snapshot: Pick<Timeline2Snapshot, "nodes" | "dependencies">) {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const dependency of snapshot.dependencies) {
    appendEdge(outgoing, dependency.fromNodeId, dependency.id);
    appendEdge(incoming, dependency.toNodeId, dependency.id);
  }
  return { outgoing, incoming };
}

function renderFieldsForNode(
  node: Timeline2Node,
  depth: number,
  collapsedNodeIds: Set<string>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): TimelineRenderRow {
  const isLeafRow = node.children.length === 0;
  const progressDerived = !isLeafRow;
  const datesDerived = !isLeafRow;

  const displayStartDate = isLeafRow ? node.startDate : (node.rollup.startDate ?? node.startDate);
  const displayDueDate = isLeafRow ? node.dueDate : (node.rollup.dueDate ?? node.dueDate);

  const displayStatus = timeline2DisplayStatus(node);

  const displayPriority = isLeafRow ? node.priority : node.rollup.priority;

  const rowAssignees = isLeafRow ? node.assignees : node.rollup.assignees;

  const hasStructureChildren = node.children.length > 0;
  const isExpanded = hasStructureChildren && !collapsedNodeIds.has(node.id);

  return {
    id: node.id,
    parentId: node.parentId,
    depth,
    kind: node.kind,
    name: node.title,
    status: node.status,
    displayStatus,
    displayPriority,
    progress: node.progress,
    displayProgress: clampProgressDisplay(node.progress),
    startDate: node.startDate,
    dueDate: node.dueDate,
    displayStartDate,
    displayDueDate,
    assignees: rowAssignees,
    dependencyIds: outgoing.get(node.id) ?? [],
    dependentIds: incoming.get(node.id) ?? [],
    isCriticalPath: node.isCriticalPath,
    isExpanded,
    isProgressDerived: progressDerived,
    isDatesDerived: datesDerived,
  };
}

export type BuildTimelineGanttVisibleRowsOptions = {
  /**
   * Enables the synthetic **project** summary row (display-only). Uses the same label shown in the workspace shell.
   */
  projectDisplayName?: string;
};

/** Plain render rows (outline-free). Prefer `buildTimelineGanttVisibleRows` inside the Gantt shell. */
export function buildTimelineRenderRowsFromSnapshot(
  snapshot: Pick<Timeline2Snapshot, "nodes" | "tree" | "dependencies">,
  collapsedNodeIds: Set<string>,
  options?: BuildTimelineGanttVisibleRowsOptions,
): TimelineRenderRow[] {
  return buildTimelineGanttVisibleRows(snapshot, collapsedNodeIds, options).map(stripOutlineFields);
}

function stripOutlineFields(row: TimelineGanttVisibleRow): TimelineRenderRow {
  return {
    id: row.id,
    parentId: row.parentId,
    depth: row.depth,
    kind: row.kind,
    name: row.name,
    status: row.status,
    displayStatus: row.displayStatus,
    displayPriority: row.displayPriority,
    progress: row.progress,
    displayProgress: row.displayProgress,
    startDate: row.startDate,
    dueDate: row.dueDate,
    displayStartDate: row.displayStartDate,
    displayDueDate: row.displayDueDate,
    assignees: row.assignees,
    dependencyIds: row.dependencyIds,
    dependentIds: row.dependentIds,
    isCriticalPath: row.isCriticalPath,
    isExpanded: row.isExpanded,
    isProgressDerived: row.isProgressDerived,
    isDatesDerived: row.isDatesDerived,
  };
}

function buildSyntheticProjectRootVisibleRow(
  snapshot: Pick<Timeline2Snapshot, "nodes" | "tree" | "dependencies">,
  collapsedNodeIds: Set<string>,
  projectDisplayName: string,
): TimelineGanttVisibleRow {
  const roots = snapshot.tree;
  const { rollup, weightedProgress } =
    roots.length === 0
      ? {
          rollup: {
            healthStatus: "not_started" as const,
            priority: "medium" as const,
            startDate: null as string | null,
            dueDate: null as string | null,
            assignees: [] as Timeline2Assignee[],
            actionRequiredCount: 0,
            dependencyWarningCount: 0,
            descendantCount: 0,
          },
          weightedProgress: 0,
        }
      : computeTimeline2RollupAggregateForSummaryNode({
          children: roots.map((root) => ({
            rollup: root.rollup,
            progress: root.progress,
            directAssignees: root.assignees,
          })),
          nodeOwnActionRequired: false,
          nodeDependencyWarnings: 0,
        });

  const hasStructuralChildren = roots.length > 0;
  const isExpanded = hasStructuralChildren && !collapsedNodeIds.has(TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID);

  return {
    id: TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID,
    parentId: null,
    depth: 0,
    kind: "group",
    name: projectDisplayName,
    status: "not_started",
    displayStatus: rollup.healthStatus,
    displayPriority: rollup.priority,
    progress: weightedProgress,
    displayProgress: clampProgressDisplay(weightedProgress),
    startDate: null,
    dueDate: null,
    displayStartDate: rollup.startDate,
    displayDueDate: rollup.dueDate,
    assignees: rollup.assignees,
    dependencyIds: [],
    dependentIds: [],
    isCriticalPath: false,
    isExpanded,
    isProgressDerived: true,
    isDatesDerived: true,
    wbs: "1",
    path: [1],
    isLastSibling: true,
    ancestorHasNext: [],
    parentIds: [],
    hasStructuralChildren,
    rollupDescendantCount: rollup.descendantCount,
  };
}

/**
 * Single source of truth for visible Gantt + outline rows (stored vs display fields + outline chrome).
 */
export function buildTimelineGanttVisibleRows(
  snapshot: Pick<Timeline2Snapshot, "nodes" | "tree" | "dependencies">,
  collapsedNodeIds: Set<string>,
  options?: BuildTimelineGanttVisibleRowsOptions,
): TimelineGanttVisibleRow[] {
  const { outgoing, incoming } = edgeMaps(snapshot);
  const outlineRows = visibleRows(snapshot.nodes, snapshot.tree, collapsedNodeIds);
  const rootCount = snapshot.tree.length;

  const mapOutline = (
    outline: (typeof outlineRows)[number],
    shift: {
      depth: number;
      wbs: string;
      path: number[];
      ancestorHasNext: boolean[];
      parentIds: string[];
    },
  ): TimelineGanttVisibleRow => {
    const base = renderFieldsForNode(
      outline.node,
      shift.depth,
      collapsedNodeIds,
      outgoing,
      incoming,
    );
    return {
      ...base,
      wbs: shift.wbs,
      path: shift.path,
      isLastSibling: outline.isLastSibling,
      ancestorHasNext: shift.ancestorHasNext,
      parentIds: shift.parentIds,
      hasStructuralChildren: outline.node.children.length > 0,
      rollupDescendantCount: outline.node.rollup.descendantCount,
    };
  };

  if (options?.projectDisplayName === undefined) {
    return outlineRows.map((outline) =>
      mapOutline(outline, {
        depth: outline.depth,
        wbs: outline.wbs,
        path: outline.path,
        ancestorHasNext: outline.ancestorHasNext,
        parentIds: outline.parentIds,
      }),
    );
  }

  const label = options.projectDisplayName.trim() || "Project";

  const syntheticCollapsed = collapsedNodeIds.has(TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID);
  const synthetic = buildSyntheticProjectRootVisibleRow(snapshot, collapsedNodeIds, label);

  const dbRows = syntheticCollapsed
    ? []
    : outlineRows.map((outline) =>
        mapOutline(outline, {
          depth: outline.depth + 1,
          wbs: `1.${outline.wbs}`,
          path: [1, ...outline.path],
          ancestorHasNext: [
            rootCount > 0 && outline.path[0] !== undefined && outline.path[0] < rootCount,
            ...outline.ancestorHasNext,
          ],
          parentIds: [TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID, ...outline.parentIds],
        }),
      );

  return [synthetic, ...dbRows];
}

export function searchableTimelineGanttRow(row: TimelineGanttVisibleRow) {
  return normalizeText(
    [
      row.wbs,
      row.name,
      KIND_LABELS[row.kind],
      PRIORITY_LABELS[row.displayPriority],
      ...row.assignees.map((a) => a.name),
    ].join(" "),
  );
}
