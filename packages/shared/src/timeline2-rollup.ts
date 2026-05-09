import type { Timeline2Assignee, Timeline2Priority, Timeline2Rollup, Timeline2Status } from "./timeline2.js";

/** Priority severity rank for Timeline 2 rollup (higher = worse / more urgent). */
export const TIMELINE2_PRIORITY_RANK: Record<Timeline2Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Matches API `diffDays` for ISO calendar dates (UTC midnight anchors). */
export function timeline2DiffDaysUtc(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** Inclusive span length in days for progress weights (min weight 1). */
export function timeline2SpanWeightDays(startDate: string | null, dueDate: string | null): number {
  if (!startDate || !dueDate) return 1;
  return Math.max(1, timeline2DiffDaysUtc(startDate, dueDate) + 1);
}

export function worstTimeline2Priority(priorities: Timeline2Priority[]): Timeline2Priority {
  if (priorities.length === 0) return "medium";
  return priorities.reduce((worst, current) =>
    TIMELINE2_PRIORITY_RANK[current] > TIMELINE2_PRIORITY_RANK[worst] ? current : worst,
  );
}

export function mergeTimeline2AssigneeLists(lists: Timeline2Assignee[][]): Timeline2Assignee[] {
  const assigneeMap = new Map<string, Timeline2Assignee>();
  for (const list of lists) {
    for (const assignee of list) {
      assigneeMap.set(assignee.userId, assignee);
    }
  }
  return [...assigneeMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregate status for a **summary** row from **direct children’s** rollup health only.
 * Parent stored `status` must not influence this result.
 *
 * **Canceled vs terminal work:** `completed` + `cancelled` among children (no active/not-started mix)
 * resolves to **`completed`** — all schedulable work is terminal. **`cancelled` + `not_started`** with
 * no **`completed`**, **`in_progress`**, or **`waiting`** resolves to **`not_started`** (nothing actively started).
 */
export function aggregateTimeline2HealthStatusFromChildren(params: {
  childHealthStatuses: Timeline2Status[];
  /** Own action-required flag plus subtree counts (rollup semantics). */
  actionRequiredCount: number;
}): Timeline2Status {
  const { childHealthStatuses, actionRequiredCount } = params;
  if (childHealthStatuses.length === 0) return "not_started";

  const statuses = childHealthStatuses;

  if (actionRequiredCount > 0 || statuses.includes("blocked")) return "blocked";
  if (statuses.includes("waiting")) return "waiting";
  if (statuses.includes("in_progress")) return "in_progress";

  const hasNotStarted = statuses.includes("not_started");
  const hasCompleted = statuses.includes("completed");
  const hasCanceled = statuses.includes("cancelled");

  if (hasCompleted && hasNotStarted) return "in_progress";

  /** Product rule: canceled + not_started only → no active work started. */
  if (hasCanceled && hasNotStarted && !hasCompleted) return "not_started";

  if (!hasNotStarted) {
    if (hasCompleted && hasCanceled) return "completed";
    if (hasCompleted) return "completed";
    if (hasCanceled) return "cancelled";
  }

  if (statuses.every((s) => s === "not_started")) return "not_started";

  return "not_started";
}

/** Weighted average of direct children’s **derived** progress (0–100), using each child’s rollup date span.
 * Summary rollups pass `includeInProgressAverage: false` for **cancelled** children so abandoned work does not
 * dilute parent progress.
 */
export function computeWeightedTimeline2SummaryProgress(
  children: Array<{
    progress: number;
    rollupStartDate: string | null;
    rollupDueDate: string | null;
    /** When false, this row is omitted from the average (weights and progress ignored). */
    includeInProgressAverage?: boolean;
  }>,
): number {
  const active = children.filter((child) => child.includeInProgressAverage !== false);
  if (active.length === 0) return 0;
  const contributors = active.map((child) => ({
    progress: child.progress,
    weight: timeline2SpanWeightDays(child.rollupStartDate, child.rollupDueDate),
  }));
  const totalWeight = contributors.reduce((sum, item) => sum + item.weight, 0);
  const weightedSum = contributors.reduce((sum, item) => sum + item.progress * item.weight, 0);
  return Math.round(weightedSum / Math.max(1, totalWeight));
}

export interface Timeline2SummaryRollupChildInput {
  rollup: Pick<
    Timeline2Rollup,
    | "healthStatus"
    | "priority"
    | "startDate"
    | "dueDate"
    | "assignees"
    | "actionRequiredCount"
    | "dependencyWarningCount"
    | "descendantCount"
  >;
  /** Child progress after that node’s rollup (leaf = stored; summary = derived). */
  progress: number;
  /** Assignees stored on the child row (merged with `rollup.assignees` for parent rollup). */
  directAssignees: Timeline2Assignee[];
}

export interface Timeline2SummaryRollupAggregateResult {
  rollup: Timeline2Rollup;
  /** Updated stored progress for summary rows (`node.progress`). */
  weightedProgress: number;
}

/**
 * Pure rollup step for a node that **has structural children**. Ignores parent stored
 * status / dates / priority / assignees for aggregate fields; still folds own action-required
 * and dependency-warning counts.
 */
export function computeTimeline2RollupAggregateForSummaryNode(params: {
  children: Timeline2SummaryRollupChildInput[];
  nodeOwnActionRequired: boolean;
  nodeDependencyWarnings: number;
}): Timeline2SummaryRollupAggregateResult {
  const { children, nodeOwnActionRequired, nodeDependencyWarnings } = params;

  const actionRequiredCount =
    (nodeOwnActionRequired ? 1 : 0) +
    children.reduce((sum, c) => sum + c.rollup.actionRequiredCount, 0);

  const dependencyWarningCount =
    nodeDependencyWarnings + children.reduce((sum, c) => sum + c.rollup.dependencyWarningCount, 0);

  const descendantCount =
    children.length + children.reduce((sum, c) => sum + c.rollup.descendantCount, 0);

  const healthStatus = aggregateTimeline2HealthStatusFromChildren({
    childHealthStatuses: children.map((c) => c.rollup.healthStatus),
    actionRequiredCount,
  });

  const priority = worstTimeline2Priority(children.map((c) => c.rollup.priority));

  const starts = children.map((c) => c.rollup.startDate).filter((d): d is string => Boolean(d));
  const dues = children.map((c) => c.rollup.dueDate).filter((d): d is string => Boolean(d));
  const startDate = starts.length > 0 ? [...starts].sort()[0] ?? null : null;
  const dueDate = dues.length > 0 ? [...dues].sort()[dues.length - 1] ?? null : null;

  const assignees = mergeTimeline2AssigneeLists(
    children.map((c) => [...c.directAssignees, ...c.rollup.assignees]),
  );

  const weightedProgress = computeWeightedTimeline2SummaryProgress(
    children.map((c) => ({
      progress: c.progress,
      rollupStartDate: c.rollup.startDate,
      rollupDueDate: c.rollup.dueDate,
      includeInProgressAverage: c.rollup.healthStatus !== "cancelled",
    })),
  );

  return {
    rollup: {
      healthStatus,
      priority,
      startDate,
      dueDate,
      assignees,
      actionRequiredCount,
      dependencyWarningCount,
      descendantCount,
    },
    weightedProgress,
  };
}
