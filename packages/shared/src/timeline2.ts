export const TIMELINE2_NODE_KINDS = ["group", "task", "milestone"] as const;
export type Timeline2NodeKind = (typeof TIMELINE2_NODE_KINDS)[number];

export const TIMELINE2_STATUSES = [
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type Timeline2Status = (typeof TIMELINE2_STATUSES)[number];

export const TIMELINE2_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Timeline2Priority = (typeof TIMELINE2_PRIORITIES)[number];

export const TIMELINE2_DEPENDENCY_RELATIONS = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
] as const;
export type Timeline2DependencyRelation = (typeof TIMELINE2_DEPENDENCY_RELATIONS)[number];

export const TIMELINE2_OPERATION_TYPES = [
  "create_node",
  "update_node",
  "move_node",
  "delete_node",
  "set_assignees",
  "set_dependency",
  "remove_dependency",
] as const;
export type Timeline2OperationType = (typeof TIMELINE2_OPERATION_TYPES)[number];

export const TIMELINE2_OPERATION_STATUSES = ["pending", "accepted", "rejected", "applied"] as const;
export type Timeline2OperationStatus = (typeof TIMELINE2_OPERATION_STATUSES)[number];

export const TIMELINE2_BRANCH_STATUSES = ["open", "accepted", "rejected"] as const;
export type Timeline2BranchStatus = (typeof TIMELINE2_BRANCH_STATUSES)[number];

export interface Timeline2TeamMember {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  projectRole: string;
}

export interface Timeline2Assignee {
  userId: string;
  name: string;
  email: string;
}

export interface Timeline2ActionRequired {
  required: boolean;
  note: string | null;
}

export interface Timeline2Rollup {
  /** Aggregate status from descendants (matches timeline “display status” on summary rows). */
  healthStatus: Timeline2Status;
  priority: Timeline2Priority;
  startDate: string | null;
  dueDate: string | null;
  assignees: Timeline2Assignee[];
  actionRequiredCount: number;
  dependencyWarningCount: number;
  descendantCount: number;
}

export interface Timeline2Node {
  id: string;
  planId: string;
  parentId: string | null;
  kind: Timeline2NodeKind;
  title: string;
  description: string | null;
  status: Timeline2Status;
  priority: Timeline2Priority;
  startDate: string | null;
  dueDate: string | null;
  sortOrder: number;
  progress: number;
  isCriticalPath: boolean;
  actionRequired: Timeline2ActionRequired;
  assignees: Timeline2Assignee[];
  rollup: Timeline2Rollup;
  children: Timeline2Node[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Status shown in outline/Gantt: stored `status` on leaf rows; roll-up aggregate (`rollup.healthStatus`)
 * on rows with structural children (parent `status` may be stale until edited/saved).
 */
export function timeline2DisplayStatus(node: Pick<Timeline2Node, "status" | "children" | "rollup">): Timeline2Status {
  return node.children.length === 0 ? node.status : node.rollup.healthStatus;
}

export interface Timeline2Dependency {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: Timeline2DependencyRelation;
  lagDays: number;
  createdAt: string;
}

export interface Timeline2UserPreferences {
  columnOrder: string[];
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  outlineWidth: number;
  dayWidth: number;
  collapsedNodeIds: string[];
}

/** Legacy Gantt column id before we aligned naming with `status`. */
const TIMELINE2_LEGACY_WORKFLOW_COLUMN_ID = "workflow";
export const TIMELINE2_STATUS_COLUMN_ID = "status";

/** Canonical Timeline 2 outline column ids (left pane table). */
export const TIMELINE2_GANTT_COLUMN_ORDER = [
  "task_name",
  "status",
  "priority",
  "progress",
  "start_date",
  "due_date",
  "assignee",
] as const;

export type Timeline2GanttColumnKey = (typeof TIMELINE2_GANTT_COLUMN_ORDER)[number];

function mapLegacyGanttColumnKey(key: string): string {
  switch (key) {
    case TIMELINE2_LEGACY_WORKFLOW_COLUMN_ID:
      return TIMELINE2_STATUS_COLUMN_ID;
    case "task":
      return "task_name";
    case "due":
      return "due_date";
    case "signals":
      return "assignee";
    default:
      return key;
  }
}

function normalizeGanttColumnOrder(order: string[]): string[] {
  const canonical = TIMELINE2_GANTT_COLUMN_ORDER as readonly string[];
  const mapped = order.map(mapLegacyGanttColumnKey).filter((k) => canonical.includes(k));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const k of mapped) {
    if (!seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  for (const k of TIMELINE2_GANTT_COLUMN_ORDER) {
    if (!seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  return result;
}

function normalizeGanttVisibleColumns(visible: string[]): string[] {
  const canonical = TIMELINE2_GANTT_COLUMN_ORDER as readonly string[];
  const mapped = visible
    .map(mapLegacyGanttColumnKey)
    .filter((k) => canonical.includes(k) && k !== "task_name");
  if (mapped.length === 0) {
    return TIMELINE2_GANTT_COLUMN_ORDER.filter((k) => k !== "task_name");
  }
  return [...new Set(mapped)];
}

function normalizeGanttColumnWidths(widths: Record<string, number>): Record<string, number> {
  const w = widths ?? {};
  return {
    task_name: Number(w.task_name) || 320,
    status: Number(w[TIMELINE2_STATUS_COLUMN_ID] ?? w[TIMELINE2_LEGACY_WORKFLOW_COLUMN_ID]) || 108,
    priority: Number(w.priority) || 92,
    progress: Number(w.progress) || 100,
    start_date: Number(w.start_date) || 84,
    due_date: Number(w.due_date ?? w.due) || 84,
    assignee: Number(w.assignee ?? w.signals) || 140,
  };
}

/** Normalize persisted prefs (legacy column ids → canonical outline table). */
export function normalizeTimeline2UserPreferences(preferences: Timeline2UserPreferences): Timeline2UserPreferences {
  return {
    ...preferences,
    columnOrder: normalizeGanttColumnOrder(preferences.columnOrder.length > 0 ? preferences.columnOrder : [...TIMELINE2_GANTT_COLUMN_ORDER]),
    visibleColumns: normalizeGanttVisibleColumns(
      preferences.visibleColumns.length > 0 ? preferences.visibleColumns : [...TIMELINE2_GANTT_COLUMN_ORDER],
    ),
    columnWidths: normalizeGanttColumnWidths(preferences.columnWidths ?? {}),
  };
}

export interface Timeline2Plan {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Timeline2Revision {
  id: string;
  revisionNumber: number;
  reason: string;
  createdAt: string;
  createdByUserId: string | null;
}

export interface Timeline2Operation {
  id: string;
  branchId: string;
  operationType: Timeline2OperationType;
  targetNodeId: string | null;
  dependencyId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  rationale: string;
  status: Timeline2OperationStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Timeline2Branch {
  id: string;
  projectId: string;
  planId: string;
  title: string;
  summary: string;
  status: Timeline2BranchStatus;
  baseRevisionId: string | null;
  baseSnapshot: Record<string, unknown>;
  proposedSnapshot: Record<string, unknown>;
  operations: Timeline2Operation[];
  operationCounts: {
    total: number;
    pending: number;
    applied: number;
    rejected: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Timeline2Snapshot {
  projectId: string;
  generatedAt: string;
  plan: Timeline2Plan;
  activeRevision: Timeline2Revision | null;
  tree: Timeline2Node[];
  nodes: Timeline2Node[];
  dependencies: Timeline2Dependency[];
  teamMembers: Timeline2TeamMember[];
  openBranches: Timeline2Branch[];
  /** Project-level target date from `projects.target_date`, YYYY-MM-DD or null */
  projectTargetDate?: string | null;
}

export interface Timeline2AiContext {
  projectId: string;
  generatedAt: string;
  activeRevision: Timeline2Revision | null;
  nodes: Array<{
    id: string;
    parentId: string | null;
    kind: Timeline2NodeKind;
    title: string;
    status: Timeline2Status;
    priority: Timeline2Priority;
    startDate: string | null;
    dueDate: string | null;
    actionRequired: Timeline2ActionRequired;
    assigneeNames: string[];
    rollup: Timeline2Rollup;
  }>;
  dependencies: Timeline2Dependency[];
  teamMembers: Timeline2TeamMember[];
}

export type Timeline2Ai2ErrorCategory =
  | "config_provider_failure"
  | "structured_output_failure"
  | "planning_domain_failure"
  | "fallback_refusal"
  | "persistence_failure"
  | "unknown_failure";

/** User-facing copy for each AI 2 failure category. */
export const TIMELINE2_AI2_ERROR_USER_MESSAGES: Record<Timeline2Ai2ErrorCategory, string> = {
  config_provider_failure: "AI provider is not configured or unreachable.",
  structured_output_failure: "The model responded, but not in the required planner schema.",
  planning_domain_failure:
    "The request is understandable, but the current plan lacks enough dated tasks/dependencies.",
  fallback_refusal: "The structured planner failed and deterministic fallback is unsafe for this request.",
  persistence_failure: "A valid branch was produced but could not be saved.",
  unknown_failure: "Timeline 2 AI 2 failed unexpectedly.",
};

export class Timeline2Ai2Error extends Error {
  readonly category: Timeline2Ai2ErrorCategory;
  readonly userMessage: string;
  declare readonly cause?: unknown;

  constructor(
    category: Timeline2Ai2ErrorCategory,
    options?: { cause?: unknown; userMessage?: string },
  ) {
    const userMessage = options?.userMessage ?? TIMELINE2_AI2_ERROR_USER_MESSAGES[category];
    super(userMessage);
    this.name = "Timeline2Ai2Error";
    this.category = category;
    this.userMessage = userMessage;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }

  static isInstance(err: unknown): err is Timeline2Ai2Error {
    return (
      err instanceof Timeline2Ai2Error ||
      (typeof err === "object" &&
        err !== null &&
        (err as { name?: unknown }).name === "Timeline2Ai2Error" &&
        typeof (err as { category?: unknown }).category === "string" &&
        typeof (err as { userMessage?: unknown }).userMessage === "string")
    );
  }
}

export interface Timeline2ChatStreamEvent {
  type:
    | "token"
    | "trace"
    | "tool_start"
    | "tool_done"
    | "analysis_summary"
    | "branch_created"
    | "conversation_started"
    | "done"
    | "error"
    | "question"
    | "keepalive";
  delta?: string;
  trace?: string;
  toolName?: string;
  summary?: string;
  branch?: Timeline2Branch;
  message?: string;
  question?: string;
  questionContext?: string;
  conversationId?: string;
  /** Correlation id for AI 2 (proxy → API → SSE). */
  reqId?: string;
  /** Stream route identifier for observability. */
  route?: string;
  errorCategory?: Timeline2Ai2ErrorCategory;
}
