import type {
  Timeline2DependencyRelation,
  Timeline2NodeKind,
  Timeline2OperationType,
  Timeline2Priority,
  Timeline2Status,
} from "@larry/shared";
import {
  TIMELINE2_DEPENDENCY_RELATIONS,
  TIMELINE2_NODE_KINDS,
  TIMELINE2_PRIORITIES,
  TIMELINE2_STATUSES,
} from "@larry/shared";
import { z } from "zod";

export const UUID = z.string().uuid();
export const ProjectParamSchema = z.object({ projectId: UUID });
export const NodeParamSchema = z.object({ nodeId: UUID });
export const BranchParamSchema = z.object({ branchId: UUID });
export const DependencyParamSchema = z.object({ dependencyId: UUID });

export const NodeKindSchema = z.enum(TIMELINE2_NODE_KINDS);
export const StatusSchema = z.enum(TIMELINE2_STATUSES);
export const PrioritySchema = z.enum(TIMELINE2_PRIORITIES);
export const DependencyRelationSchema = z.enum(TIMELINE2_DEPENDENCY_RELATIONS);

export const NodeInputSchema = z.object({
  parentId: UUID.nullable().optional(),
  kind: NodeKindSchema.default("task"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4_000).nullable().optional(),
  status: StatusSchema.default("not_started"),
  priority: PrioritySchema.default("medium"),
  startDate: z.string().date().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  sortOrder: z.number().finite().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  actionRequired: z
    .object({
      required: z.boolean().default(false),
      note: z.string().trim().max(2_000).nullable().optional(),
    })
    .optional(),
  assigneeUserIds: z.array(UUID).max(50).optional(),
});

export const NodePatchSchema = NodeInputSchema.partial().extend({
  assigneeUserIds: z.array(UUID).max(50).optional(),
});

export const AssigneesSchema = z.object({
  assigneeUserIds: z.array(UUID).max(50),
});

export const DependencyInputSchema = z.object({
  fromNodeId: UUID,
  toNodeId: UUID,
  relation: DependencyRelationSchema.default("finish_to_start"),
  lagDays: z.number().int().min(-3650).max(3650).default(0),
});

export const AcceptBranchSchema = z.object({
  operationIds: z.array(UUID).optional(),
});

export const RejectBranchSchema = z.object({
  operationIds: z.array(UUID).optional(),
});

export const AiChatSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
});

export const Ai2ChatBodySchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  answer: z.string().trim().max(8_000).optional(),
  conversationId: UUID.optional(),
});

export type PlanRow = {
  id: string;
  projectId: string;
  activeRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NodeRow = {
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
  actionRequired: boolean;
  actionRequiredNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DependencyRow = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: Timeline2DependencyRelation;
  lagDays: number;
  createdAt: string;
};

export type BranchRow = {
  id: string;
  projectId: string;
  planId: string;
  title: string;
  summary: string;
  status: "open" | "accepted" | "rejected";
  baseRevisionId: string | null;
  baseSnapshot: Record<string, unknown>;
  proposedSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OperationRow = {
  id: string;
  branchId: string;
  operationType: Timeline2OperationType;
  targetNodeId: string | null;
  dependencyId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  rationale: string;
  status: "pending" | "accepted" | "rejected" | "applied";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Timeline2ModelConfig = {
  provider: "openai" | "anthropic" | "gemini" | "groq";
  apiKey: string;
  model: string;
};

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AI_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;
export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
export const AI_REQUEST_DESCRIPTION_PREFIX = "Created from AI request:";

export type BranchDraftOperation = {
  operationType: Timeline2OperationType;
  targetNodeId: string | null;
  dependencyId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  rationale: string;
  sortOrder: number;
};

export const AiNodeReferenceSchema = z.string().trim().min(1).max(120);

export const AiCreateNodeOperationSchema = z.object({
  type: z.literal("create_node"),
  ref: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["group", "task", "milestone"]).default("task"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4_000).nullable().optional(),
  parentId: AiNodeReferenceSchema.nullable().optional(),
  status: StatusSchema.default("not_started"),
  priority: PrioritySchema.default("medium"),
  startDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  dueDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  assigneeUserIds: z.array(UUID).max(20).optional(),
  actionRequiredNote: z.string().trim().max(2_000).nullable().optional(),
  rationale: z.string().trim().min(1).max(1_000).optional(),
});

export const AiSetDependencyOperationSchema = z.object({
  type: z.literal("set_dependency"),
  fromNodeId: AiNodeReferenceSchema,
  toNodeId: AiNodeReferenceSchema,
  relation: DependencyRelationSchema.default("finish_to_start"),
  rationale: z.string().trim().min(1).max(1_000).optional(),
});

export const AiProposalSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(1).max(500).optional(),
  operations: z
    .array(
      z.discriminatedUnion("type", [AiCreateNodeOperationSchema, AiSetDependencyOperationSchema]),
    )
    .min(1)
    .max(40),
});

export const AgentSearchNodesArgsSchema = z.object({
  query: z.string().trim().max(140).optional(),
  kinds: z.array(NodeKindSchema).max(3).optional(),
  statuses: z.array(StatusSchema).max(6).optional(),
  requireDates: z.boolean().optional(),
  rootNodeId: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(25).default(12),
});

export const AgentGetNodeSubtreeArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  depth: z.number().int().min(1).max(6).default(3),
});

export const AgentGetDependencyGraphArgsSchema = z.object({
  nodeIds: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
});

export const AgentAnalyzeCriticalPathArgsSchema = z.object({
  rootNodeId: z.string().trim().min(1).max(120).optional(),
});

export const AgentStageCreateNodeArgsSchema = z.object({
  ref: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().trim().min(1).max(120).nullable().optional(),
  kind: NodeKindSchema.default("task"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4_000).nullable().optional(),
  status: StatusSchema.default("not_started"),
  priority: PrioritySchema.default("medium"),
  startDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  dueDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  sortOrder: z.number().finite().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assigneeUserIds: z.array(UUID).max(20).optional(),
  actionRequiredNote: z.string().trim().max(2_000).nullable().optional(),
  rationale: z.string().trim().min(1).max(1_000),
});

export const AgentStageUpdateNodeArgsSchema = z
  .object({
    nodeId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    status: StatusSchema.optional(),
    priority: PrioritySchema.optional(),
    startDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
    dueDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    actionRequiredNote: z.string().trim().max(2_000).nullable().optional(),
    rationale: z.string().trim().min(1).max(1_000),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.priority !== undefined ||
      value.startDate !== undefined ||
      value.dueDate !== undefined ||
      value.progress !== undefined ||
      value.actionRequiredNote !== undefined,
    "At least one field must be updated.",
  );

export const AgentStageMoveNodeArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  parentId: z.string().trim().min(1).max(120).nullable(),
  sortOrder: z.number().finite().min(0).optional(),
  rationale: z.string().trim().min(1).max(1_000),
});

export const AgentStageSetAssigneesArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  assigneeUserIds: z.array(UUID).max(20),
  rationale: z.string().trim().min(1).max(1_000),
});

export const AgentStageSetDependencyArgsSchema = z.object({
  fromNodeId: z.string().trim().min(1).max(120),
  toNodeId: z.string().trim().min(1).max(120),
  relation: DependencyRelationSchema.default("finish_to_start"),
  lagDays: z.number().int().min(-3650).max(3650).default(0),
  rationale: z.string().trim().min(1).max(1_000),
});

export const AgentStageRemoveDependencyArgsSchema = z
  .object({
    dependencyId: z.string().trim().min(1).max(120).optional(),
    fromNodeId: z.string().trim().min(1).max(120).optional(),
    toNodeId: z.string().trim().min(1).max(120).optional(),
    rationale: z.string().trim().min(1).max(1_000),
  })
  .refine(
    (value) =>
      Boolean(value.dependencyId) || (Boolean(value.fromNodeId) && Boolean(value.toNodeId)),
    "Provide dependencyId or fromNodeId + toNodeId.",
  );

export const AgentStageDeleteNodeArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  includeDescendants: z.boolean().optional().default(true),
  rationale: z.string().trim().min(1).max(1_000),
});

export const AgentFinalizeBranchArgsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  finalSummary: z.string().trim().min(1).max(1_500),
});

export const AgentFailArgsSchema = z.object({
  message: z.string().trim().min(1).max(1_500),
  reason: z.string().trim().min(1).max(1_000),
});

export const AgentStepSchema = z.discriminatedUnion("toolName", [
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("get_plan_overview"),
    arguments: z.object({}),
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("search_nodes"),
    arguments: AgentSearchNodesArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("get_node_subtree"),
    arguments: AgentGetNodeSubtreeArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("get_dependency_graph"),
    arguments: AgentGetDependencyGraphArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("analyze_critical_path"),
    arguments: AgentAnalyzeCriticalPathArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_create_node"),
    arguments: AgentStageCreateNodeArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_update_node"),
    arguments: AgentStageUpdateNodeArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_move_node"),
    arguments: AgentStageMoveNodeArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_set_assignees"),
    arguments: AgentStageSetAssigneesArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_set_dependency"),
    arguments: AgentStageSetDependencyArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_remove_dependency"),
    arguments: AgentStageRemoveDependencyArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("stage_delete_node"),
    arguments: AgentStageDeleteNodeArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("finalize_branch"),
    arguments: AgentFinalizeBranchArgsSchema,
  }),
  z.object({
    trace: z.string().trim().min(1).max(300),
    toolName: z.literal("fail"),
    arguments: AgentFailArgsSchema,
  }),
]);

/**
 * Codex / local OpenAI-compatible proxies often return the legacy agent shape
 * `{ trace, toolName, arguments }` without `kind: "tool_call"`, which makes
 * Zod's discriminated union fail. Normalize before validation.
 */
export function normalizeAi2PlannerStepRaw(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const o = value as Record<string, unknown>;
  if ("kind" in o && typeof o.kind === "string") return value;

  if (typeof o.toolName === "string") {
    return {
      kind: "tool_call",
      trace:
        typeof o.trace === "string" && o.trace.trim().length > 0
          ? o.trace
          : "(no trace from model)",
      toolName: o.toolName,
      arguments:
        o.arguments != null && typeof o.arguments === "object" && !Array.isArray(o.arguments)
          ? o.arguments
          : {},
    };
  }

  if (
    typeof o.title === "string" &&
    typeof o.summary === "string" &&
    typeof o.finalSummary === "string"
  ) {
    return {
      kind: "finalize_branch",
      trace: typeof o.trace === "string" && o.trace.trim().length > 0 ? o.trace : "(finalize)",
      title: o.title,
      summary: o.summary,
      finalSummary: o.finalSummary,
    };
  }

  if (typeof o.question === "string") {
    const next: Record<string, unknown> = {
      kind: "ask_clarifying_question",
      trace: typeof o.trace === "string" && o.trace.trim().length > 0 ? o.trace : "(clarify)",
      question: o.question,
    };
    if (typeof o.context === "string") next.context = o.context;
    return next;
  }

  if (typeof o.message === "string" && typeof o.reason === "string") {
    return {
      kind: "fail_with_reason",
      trace: typeof o.trace === "string" && o.trace.trim().length > 0 ? o.trace : "(fail)",
      message: o.message,
      reason: o.reason,
    };
  }

  return value;
}

export const Ai2PlannerStepSchema = z.preprocess(
  normalizeAi2PlannerStepRaw,
  // `discriminatedUnion("kind")` is invalid here: every tool step uses `kind: "tool_call"`,
  // and Zod requires unique discriminator values (would throw "Duplicate discriminator value").
  z.union([
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("get_plan_overview"),
      arguments: z.object({}),
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("search_nodes"),
      arguments: AgentSearchNodesArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("get_node_subtree"),
      arguments: AgentGetNodeSubtreeArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("get_dependency_graph"),
      arguments: AgentGetDependencyGraphArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("analyze_critical_path"),
      arguments: AgentAnalyzeCriticalPathArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("get_at_risk_tasks"),
      arguments: z.object({}),
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("get_team_workload"),
      arguments: z.object({
        windowDays: z.number().int().min(1).max(90).optional().default(14),
      }),
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_create_node"),
      arguments: AgentStageCreateNodeArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_update_node"),
      arguments: AgentStageUpdateNodeArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_move_node"),
      arguments: AgentStageMoveNodeArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_set_assignees"),
      arguments: AgentStageSetAssigneesArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_set_dependency"),
      arguments: AgentStageSetDependencyArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_remove_dependency"),
      arguments: AgentStageRemoveDependencyArgsSchema,
    }),
    z.object({
      kind: z.literal("tool_call"),
      trace: z.string().trim().min(1).max(300),
      toolName: z.literal("stage_delete_node"),
      arguments: AgentStageDeleteNodeArgsSchema,
    }),
    z.object({
      kind: z.literal("finalize_branch"),
      trace: z.string().trim().min(1).max(300),
      title: z.string().trim().min(1).max(120),
      summary: z.string().trim().min(1).max(500),
      finalSummary: z.string().trim().min(1).max(1_500),
    }),
    z.object({
      kind: z.literal("ask_clarifying_question"),
      trace: z.string().trim().min(1).max(300),
      question: z.string().trim().min(1).max(600),
      context: z.string().trim().max(1_000).optional(),
    }),
    z.object({
      kind: z.literal("fail_with_reason"),
      trace: z.string().trim().min(1).max(300),
      message: z.string().trim().min(1).max(1_500),
      reason: z.string().trim().min(1).max(1_000),
    }),
  ]),
);

export const PRIORITY_RANK: Record<Timeline2Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
