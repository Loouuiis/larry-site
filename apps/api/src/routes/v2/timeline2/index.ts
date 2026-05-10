import { randomUUID } from "node:crypto";
import { FastifyPluginAsync, type FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createLlmProvider, createModel, getStructuredOutputOptions } from "@larry/ai";
import { getApiEnv } from "@larry/config";
import type {
  Timeline2AiContext,
  Timeline2Assignee,
  Timeline2Branch,
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
  Timeline2NodeKind,
  Timeline2Operation,
  Timeline2OperationType,
  Timeline2Plan,
  Timeline2Priority,
  Timeline2Revision,
  Timeline2Snapshot,
  Timeline2Status,
  Timeline2TeamMember,
  Timeline2UserPreferences,
} from "@larry/shared";
import {
  TIMELINE2_AI2_ERROR_USER_MESSAGES,
  TIMELINE2_GANTT_COLUMN_ORDER,
  TIMELINE2_OPERATION_TYPES,
  Timeline2Ai2Error,
  computeTimeline2RollupAggregateForSummaryNode,
  normalizeTimeline2UserPreferences,
} from "@larry/shared";
import {
  TIMELINE2_AI2_STREAM_ROUTE,
  type Ai2DebugTraceCollector,
} from "../../../lib/timeline2-ai2-trace.js";
import {
  getProjectMembershipAccess,
  listProjectMembers,
} from "../../../lib/project-memberships.js";
import { computeTimeline2CriticalPathMetrics } from "./domain/schedule-metrics.js";
import { registerTimeline2AiRoutes } from "./ai/register-ai-routes.js";
import { registerTimeline2BranchRoutes } from "./branches/register-branch-routes.js";
import {
  AcceptBranchSchema,
  Ai2ChatBodySchema,
  Ai2PlannerStepSchema,
  AiChatSchema,
  AI_REFERENCE_PATTERN,
  AI_REQUEST_DESCRIPTION_PREFIX,
  AiCreateNodeOperationSchema,
  AiProposalSchema,
  AssigneesSchema,
  AgentGetDependencyGraphArgsSchema,
  AgentGetNodeSubtreeArgsSchema,
  AgentSearchNodesArgsSchema,
  AgentStepSchema,
  BranchDraftOperation,
  BranchParamSchema,
  BranchRow,
  DependencyInputSchema,
  DependencyParamSchema,
  DependencyRelationSchema,
  DependencyRow,
  ISO_DATE_PATTERN,
  MONTHS,
  NodeInputSchema,
  NodeKindSchema,
  NodeParamSchema,
  NodePatchSchema,
  NodeRow,
  NUMBER_WORDS,
  OperationRow,
  PlanRow,
  PrioritySchema,
  ProjectParamSchema,
  RejectBranchSchema,
  StatusSchema,
  Timeline2ModelConfig,
  UUID,
  UUID_PATTERN,
} from "./shared/contracts.js";
import { registerTimeline2ManualRoutes } from "./manual/register-manual-routes.js";

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text;
}

function compactNode(node: Timeline2Node): Record<string, unknown> {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    status: node.status,
    priority: node.priority,
    startDate: node.startDate,
    dueDate: node.dueDate,
    actionRequired: node.actionRequired,
    assigneeNames: node.assignees.map((a) => a.name),
    rollup: node.rollup,
  };
}

function isUuidLike(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeAiReference(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || `ref-${randomUUID().slice(0, 8)}`;
}

function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function readNumberToken(value: string) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return NUMBER_WORDS[value.trim().toLowerCase()] ?? null;
}

function durationDays(amount: number, unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("month")) return amount * 30;
  if (normalized.startsWith("week")) return amount * 7;
  return amount;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function stripTaskLeadIn(value: string) {
  return value
    .replace(/^(?:first|then|next|last|finally)\s+/i, "")
    .replace(/^(?:i want that to start in [a-z]+,?\s*)/i, "")
    .replace(/^(?:when|with|have)\s+/i, "")
    .replace(/\b(?:all\s+dependent\s+on\s+each\s+other|all\s+dependent\s+on\s+one\s+another)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.\-:;\s]+|[,.\-:;\s]+$/g, "");
}

function parseMonthStartDate(message: string, now = new Date()) {
  const match = message.match(/\bstart(?:ing)?\s+(?:in|on)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (!match) return null;
  const monthName = match[1].toLowerCase();
  const monthIndex = MONTHS.indexOf(monthName as (typeof MONTHS)[number]);
  if (monthIndex === -1) return null;
  const year = monthIndex < now.getUTCMonth() ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
}

function parseRelativeStartDate(message: string, now = new Date()) {
  const match = message.match(
    /\bstart(?:ing)?\s+(?:in|on)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks|month|months)\b/i,
  );
  if (!match) return null;
  const amount = readNumberToken(match[1] ?? "");
  if (!amount) return null;
  const start = addUtcDays(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    durationDays(amount, match[2] ?? "days"),
  );
  return start.toISOString().slice(0, 10);
}

function parseRequestedStartDate(message: string, now = new Date()) {
  return parseRelativeStartDate(message, now) ?? parseMonthStartDate(message, now);
}

function parseRequestedGroupTitle(message: string) {
  const match = message.match(
    /\b(?:project|workstream|group)\s*,?\s*(?:called|named)\s+(?:"([^"]{1,80})"|'([^']{1,80})'|([a-z0-9][a-z0-9 &/_-]{1,80}?))(?=\s+(?:that|with|starting|start|which)\b|[.,;!?]|$)/i,
  );
  if (!match) return null;
  return toTitleCase(match[1] ?? match[2] ?? match[3] ?? "");
}

function extractPairedTaskSpecs(message: string) {
  const match = message.match(
    /\btasks?\s+([a-z][a-z0-9/&\- ]{1,60}?)\s+and\s+([a-z][a-z0-9/&\- ]{1,60}?)\s+(?:both\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks|month|months)\b/i,
  );
  if (!match) return [];
  const amount = readNumberToken(match[3] ?? "");
  if (!amount) return [];
  return [match[1], match[2]]
    .map((title) => stripTaskLeadIn(title ?? ""))
    .filter(Boolean)
    .map((title) => ({
      title: toTitleCase(title),
      durationDays: durationDays(amount, match[4] ?? "days"),
    }));
}

function extractSequentialTaskSpecs(message: string) {
  const pairedSpecs = extractPairedTaskSpecs(message);
  if (pairedSpecs.length > 0) return pairedSpecs;
  const specs: Array<{ title: string; durationDays: number }> = [];
  const seen = new Set(specs.map((spec) => normalizeAiReference(spec.title)));
  const pattern =
    /(?:^|[.,;]\s*|\b(?:first|then|next|last|finally)\s+|\band\s+)([a-z][a-z0-9/&\- ]{1,90}?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks|month|months)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    const rawTitle = stripTaskLeadIn(match[1] ?? "");
    const amount = readNumberToken(match[2] ?? "");
    if (!rawTitle || !amount) continue;
    const normalizedTitle = normalizeAiReference(rawTitle);
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    specs.push({
      title: toTitleCase(rawTitle),
      durationDays: durationDays(amount, match[3] ?? "days"),
    });
  }
  return specs;
}

function inferPronounParent(snapshot: Timeline2Snapshot, message: string) {
  if (!/\b(that|it|this project|this workstream)\b/i.test(message)) return null;
  return snapshot.nodes
    .filter((node) => !node.parentId && node.kind !== "milestone")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function topologicallyOrderCreateOps<T extends { refKey: string; parentRefKey: string | null }>(ops: T[]) {
  const pending = [...ops];
  const ordered: T[] = [];
  const resolved = new Set<string>();
  while (pending.length > 0) {
    let progressed = false;
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      if (!item.parentRefKey || resolved.has(item.parentRefKey)) {
        ordered.push(item);
        resolved.add(item.refKey);
        pending.splice(index, 1);
        index -= 1;
        progressed = true;
      }
    }
    if (!progressed) {
      ordered.push(...pending);
      break;
    }
  }
  return ordered;
}

function buildProposalArtifacts(
  snapshot: Timeline2Snapshot,
  operations: BranchDraftOperation[],
  generatedAt: string,
) {
  const baseSnapshot = {
    projectId: snapshot.projectId,
    generatedAt: snapshot.generatedAt,
    nodes: snapshot.nodes.map(compactNode),
    dependencies: snapshot.dependencies,
  };

  const workingState = cloneWorkingState(snapshot);
  for (const operation of operations) {
    applyWorkingOperation(workingState, operation, generatedAt);
  }

  const createdNodeIds = new Set(
    operations
      .filter((operation) => operation.operationType === "create_node")
      .map((operation) => String(operation.after.clientTempId ?? "")),
  );
  const createdDependencyKeys = new Set(
    operations
      .filter((operation) => operation.operationType === "set_dependency")
      .map((operation) => {
        const after = operation.after as {
          fromNodeId?: string;
          toNodeId?: string;
          relation?: Timeline2DependencyRelation;
        };
        return `${after.fromNodeId ?? ""}:${after.toNodeId ?? ""}:${after.relation ?? "finish_to_start"}`;
      }),
  );

  const proposedNodes = [...workingState.nodes]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((node) => ({
      ...compactNode({ ...node, children: [] }),
      ...(createdNodeIds.has(node.id) ? { proposed: true } : {}),
    }));

  const proposedDependencies = [...workingState.dependencies]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.fromNodeId.localeCompare(b.fromNodeId))
    .map((dependency) => ({
      ...dependency,
      ...(createdDependencyKeys.has(`${dependency.fromNodeId}:${dependency.toNodeId}:${dependency.relation}`)
        ? { proposed: true }
        : {}),
    }));

  return {
    baseSnapshot,
    proposedSnapshot: {
      ...baseSnapshot,
      proposedAt: generatedAt,
      nodes: proposedNodes,
      dependencies: proposedDependencies,
      operations: operations.map((operation) => ({
        operationType: operation.operationType,
        after: operation.after,
        rationale: operation.rationale,
      })),
    },
  };
}

type WorkingNode = Omit<Timeline2Node, "children">;
type WorkingState = {
  nodes: WorkingNode[];
  dependencies: Timeline2Dependency[];
  teamMembers: Timeline2TeamMember[];
  projectTargetDate: string | null;
};

type CriticalPathAnalysis = {
  mode: "graph" | "inferred" | "insufficient";
  rootNodeId: string | null;
  rootTitle: string | null;
  nodeIds: string[];
  edges: Array<{ fromNodeId: string; toNodeId: string; relation: Timeline2DependencyRelation }>;
  milestoneNodeIds: string[];
  suggestedMilestoneTitle: string | null;
  confidence: "high" | "medium" | "low";
  totalDurationDays: number;
  warnings: string[];
  rationale: string;
};

function cloneWorkingState(snapshot: Timeline2Snapshot): WorkingState {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      assignees: node.assignees.map((assignee) => ({ ...assignee })),
      actionRequired: { ...node.actionRequired },
      rollup: {
        ...node.rollup,
        assignees: node.rollup.assignees.map((assignee) => ({ ...assignee })),
      },
    })),
    dependencies: snapshot.dependencies.map((dependency) => ({ ...dependency })),
    teamMembers: snapshot.teamMembers.map((member) => ({ ...member })),
    projectTargetDate: snapshot.projectTargetDate ?? null,
  };
}

function diffDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

function summarizeDescription(description: string | null, maxLength = 240) {
  if (!description) return null;
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function deriveDescriptionMetadata(description: string | null) {
  const normalized = summarizeDescription(description, 4_000);
  if (!normalized) {
    return {
      descriptionKind: "none" as const,
      embeddedRequestText: null,
    };
  }
  if (normalized.startsWith(AI_REQUEST_DESCRIPTION_PREFIX)) {
    const embedded = normalized.slice(AI_REQUEST_DESCRIPTION_PREFIX.length).trim();
    return {
      descriptionKind: "ai_request_replay_hint" as const,
      embeddedRequestText: embedded || null,
    };
  }
  return {
    descriptionKind: "plain_note" as const,
    embeddedRequestText: null,
  };
}

function derivePromptIntentFlags(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim().toLowerCase();
  const wantsCleanup = /\b(delete|remove|archive|trash)\b/.test(normalized);
  const wantsDescriptionDrivenImplementation =
    /\b(description|descriptions|notes|sub-task|subtask)\b/.test(normalized) &&
    /\b(implement|recreate|rebuild|follow|use .* instruction|use that as the instruction)\b/.test(normalized);
  const hasExplicitImplementationTarget =
    /\b(recreate|create|add|put|build|implement)\b.{0,80}\b(under|into|inside|within|in)\b/.test(normalized) ||
    /\b(under|into|inside|within|in)\s+(this|the)\s+(group|task|workstream|timeline|plan|root)\b/.test(normalized);
  return {
    wantsCleanup,
    wantsDescriptionDrivenImplementation,
    hasExplicitImplementationTarget,
  };
}

function collectReplayHintsFromValue(
  value: unknown,
  seen = new Set<unknown>(),
): Array<{ descriptionKind: string; embeddedRequestText: string | null }> {
  if (value == null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const hints: Array<{ descriptionKind: string; embeddedRequestText: string | null }> = [];
  if (Array.isArray(value)) {
    for (const entry of value) hints.push(...collectReplayHintsFromValue(entry, seen));
    return hints;
  }
  const record = value as Record<string, unknown>;
  if (record.descriptionKind === "ai_request_replay_hint") {
    hints.push({
      descriptionKind: "ai_request_replay_hint",
      embeddedRequestText: typeof record.embeddedRequestText === "string" ? record.embeddedRequestText : null,
    });
  }
  for (const entry of Object.values(record)) {
    hints.push(...collectReplayHintsFromValue(entry, seen));
  }
  return hints;
}

function shouldClarifyMixedReplayIntent(input: {
  message: string;
  toolHistory: Array<{ trace: string; toolName: string; result: unknown }>;
  stagedOperations: BranchDraftOperation[];
}) {
  const intents = derivePromptIntentFlags(input.message);
  if (!intents.wantsCleanup || !intents.wantsDescriptionDrivenImplementation) return null;
  if (intents.hasExplicitImplementationTarget) return null;
  if (input.stagedOperations.some((operation) => operation.operationType !== "delete_node")) return null;

  const replayHints = input.toolHistory.flatMap((entry) => collectReplayHintsFromValue(entry.result));
  const firstReplayHint = replayHints.find((hint) => hint.descriptionKind === "ai_request_replay_hint") ?? null;
  if (!firstReplayHint) return null;

  return {
    question:
      "I found a machine-generated source request in the description. Do you want me to recreate that plan elsewhere before deleting these nodes, or only delete them?",
    context: firstReplayHint.embeddedRequestText
      ? `Embedded request found: "${firstReplayHint.embeddedRequestText}"`
      : "I found a machine-generated source request in the description, but there is no explicit target for recreating it.",
  };
}

function nodeDurationDays(node: { startDate: string | null; dueDate: string | null }) {
  if (!node.startDate || !node.dueDate) return 1;
  return Math.max(1, diffDays(node.startDate, node.dueDate) + 1);
}

function deriveAiScheduleFacts(node: WorkingNode, todayIso: string) {
  const hasStart = Boolean(node.startDate);
  const hasDue = Boolean(node.dueDate);
  const durationDays =
    hasStart && hasDue ? nodeDurationDays(node) : node.kind === "milestone" && (hasStart || hasDue) ? 1 : null;

  let scheduleState: "unscheduled" | "partial" | "scheduled" | "milestone_like" = "unscheduled";
  if (node.kind === "milestone" || (node.startDate && node.dueDate && node.startDate === node.dueDate)) {
    scheduleState = hasStart || hasDue ? "milestone_like" : "unscheduled";
  } else if (hasStart && hasDue) {
    scheduleState = "scheduled";
  } else if (hasStart || hasDue) {
    scheduleState = "partial";
  }

  return {
    durationDays,
    scheduleState,
    lateStartDays:
      isActiveScheduleStatus(node.status) && node.startDate && node.startDate < todayIso
        ? diffDays(node.startDate, todayIso)
        : null,
    startsInDays: node.startDate && node.startDate > todayIso ? diffDays(todayIso, node.startDate) : null,
  };
}

function rootAncestorId(nodeId: string, byId: Map<string, WorkingNode>) {
  let cursor = byId.get(nodeId) ?? null;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    const parent = byId.get(cursor.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor?.id ?? nodeId;
}

function resolveReferenceId(value: string | null | undefined, refMap: Map<string, string>) {
  if (!value) return null;
  return refMap.get(value) ?? value;
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 12_000);
}

function buildChildCountMap(state: WorkingState) {
  const counts = new Map<string, number>();
  for (const node of state.nodes) {
    if (!node.parentId) continue;
    counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
  }
  return counts;
}

function buildDependencyNodeMaps(
  dependencies: Array<Pick<Timeline2Dependency, "fromNodeId" | "toNodeId">>,
) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const nextIncoming = incoming.get(dependency.toNodeId) ?? [];
    nextIncoming.push(dependency.fromNodeId);
    incoming.set(dependency.toNodeId, nextIncoming);

    const nextOutgoing = outgoing.get(dependency.fromNodeId) ?? [];
    nextOutgoing.push(dependency.toNodeId);
    outgoing.set(dependency.fromNodeId, nextOutgoing);
  }
  return { incoming, outgoing };
}

function buildWorkingNodeSummary(
  node: WorkingNode,
  byId: Map<string, WorkingNode>,
  input: {
    todayIso: string;
    childCounts: Map<string, number>;
    incomingNodeIds: Map<string, string[]>;
    outgoingNodeIds: Map<string, string[]>;
    includeDescription?: "full" | "excerpt" | "none";
    includeActionRequired?: boolean;
    includeDependencySummary?: boolean;
  },
) {
  const rootId = rootAncestorId(node.id, byId);
  const incomingNodeIds = input.incomingNodeIds.get(node.id) ?? [];
  const outgoingNodeIds = input.outgoingNodeIds.get(node.id) ?? [];
  const descriptionMeta = deriveDescriptionMetadata(node.description);
  const summary: Record<string, unknown> = {
    id: node.id,
    rootNodeId: rootId,
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    status: node.status,
    priority: node.priority,
    startDate: node.startDate,
    dueDate: node.dueDate,
    assigneeNames: node.assignees.map((assignee) => assignee.name),
    childCount: input.childCounts.get(node.id) ?? 0,
    dependencyInCount: incomingNodeIds.length,
    dependencyOutCount: outgoingNodeIds.length,
    hasDescription: Boolean(summarizeDescription(node.description)),
    descriptionKind: descriptionMeta.descriptionKind,
    embeddedRequestText: descriptionMeta.embeddedRequestText,
    ...deriveAiScheduleFacts(node, input.todayIso),
  };
  if (input.includeDescription === "excerpt") {
    summary.descriptionExcerpt = summarizeDescription(node.description);
  }
  if (input.includeDescription === "full") {
    summary.description = node.description;
    summary.descriptionExcerpt = summarizeDescription(node.description);
  }
  if (input.includeActionRequired) {
    summary.actionRequired = node.actionRequired;
  }
  if (input.includeDependencySummary) {
    summary.dependencySummary = {
      incomingCount: incomingNodeIds.length,
      outgoingCount: outgoingNodeIds.length,
      predecessorNodeIds: incomingNodeIds,
      successorNodeIds: outgoingNodeIds,
    };
  }
  return summary;
}

function findDependency(
  state: WorkingState,
  input: { dependencyId?: string | null; fromNodeId?: string | null; toNodeId?: string | null },
) {
  if (input.dependencyId) {
    return state.dependencies.find((dependency) => dependency.id === input.dependencyId) ?? null;
  }
  if (input.fromNodeId && input.toNodeId) {
    return state.dependencies.find((dependency) => dependency.fromNodeId === input.fromNodeId && dependency.toNodeId === input.toNodeId) ?? null;
  }
  return null;
}

function applyWorkingOperation(state: WorkingState, operation: BranchDraftOperation, generatedAt: string) {
  const after = operation.after ?? {};
  if (operation.operationType === "create_node") {
    state.nodes.push({
      id: String(after.clientTempId),
      planId: "proposal",
      parentId: (after.parentId as string | null | undefined) ?? null,
      kind: (after.kind as Timeline2NodeKind) ?? "task",
      title: String(after.title ?? "Untitled"),
      description: (after.description as string | null | undefined) ?? null,
      status: (after.status as Timeline2Status) ?? "not_started",
      priority: (after.priority as Timeline2Priority) ?? "medium",
      startDate: (after.startDate as string | null | undefined) ?? null,
      dueDate: (after.dueDate as string | null | undefined) ?? null,
      sortOrder: Number(after.sortOrder ?? state.nodes.length),
      progress: Number(after.progress ?? 0),
      isCriticalPath: false,
      actionRequired: {
        required: Boolean((after.actionRequired as { required?: boolean } | undefined)?.required),
        note: ((after.actionRequired as { note?: string | null } | undefined)?.note ?? null) as string | null,
      },
      assignees: state.teamMembers
        .filter((member) => ((after.assigneeUserIds as string[] | undefined) ?? []).includes(member.userId))
        .map((member) => ({ userId: member.userId, name: member.name, email: member.email })),
      rollup: {
        healthStatus: (after.status as Timeline2Status) ?? "not_started",
        priority: (after.priority as Timeline2Priority) ?? "medium",
        startDate: (after.startDate as string | null | undefined) ?? null,
        dueDate: (after.dueDate as string | null | undefined) ?? null,
        assignees: [],
        actionRequiredCount: 0,
        dependencyWarningCount: 0,
        descendantCount: 0,
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
    return;
  }

  if (operation.operationType === "update_node" || operation.operationType === "move_node" || operation.operationType === "set_assignees") {
    const targetId = operation.targetNodeId;
    const node = targetId ? state.nodes.find((item) => item.id === targetId) ?? null : null;
    if (!node) return;
    if (operation.operationType === "set_assignees") {
      const assigneeIds = (after.assigneeUserIds as string[] | undefined) ?? [];
      node.assignees = state.teamMembers
        .filter((member) => assigneeIds.includes(member.userId))
        .map((member) => ({ userId: member.userId, name: member.name, email: member.email }));
      node.updatedAt = generatedAt;
      return;
    }
    if (after.parentId !== undefined) node.parentId = (after.parentId as string | null) ?? null;
    if (after.title !== undefined) node.title = String(after.title ?? node.title);
    if (after.description !== undefined) node.description = (after.description as string | null) ?? null;
    if (after.status !== undefined) node.status = after.status as Timeline2Status;
    if (after.priority !== undefined) node.priority = after.priority as Timeline2Priority;
    if (after.startDate !== undefined) node.startDate = (after.startDate as string | null) ?? null;
    if (after.dueDate !== undefined) node.dueDate = (after.dueDate as string | null) ?? null;
    if (after.sortOrder !== undefined) node.sortOrder = Number(after.sortOrder);
    if (after.progress !== undefined) node.progress = Number(after.progress);
    if (after.actionRequired !== undefined) {
      node.actionRequired = {
        required: Boolean((after.actionRequired as { required?: boolean }).required),
        note: ((after.actionRequired as { note?: string | null }).note ?? null) as string | null,
      };
    }
    node.updatedAt = generatedAt;
    return;
  }

  if (operation.operationType === "delete_node") {
    const targetId = operation.targetNodeId;
    if (!targetId) return;
    const removalIds = new Set<string>([targetId]);
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const node of state.nodes) {
        if (!node.parentId || removalIds.has(node.id) || !removalIds.has(node.parentId)) continue;
        removalIds.add(node.id);
        progressed = true;
      }
    }
    state.nodes = state.nodes.filter((node) => !removalIds.has(node.id));
    state.dependencies = state.dependencies.filter(
      (dependency) => !removalIds.has(dependency.fromNodeId) && !removalIds.has(dependency.toNodeId),
    );
    return;
  }

  if (operation.operationType === "set_dependency") {
    const fromNodeId = String(after.fromNodeId ?? "");
    const toNodeId = String(after.toNodeId ?? "");
    const relation = (after.relation as Timeline2DependencyRelation | undefined) ?? "finish_to_start";
    const lagDays = Number(after.lagDays ?? 0);
    const existing = state.dependencies.find((dependency) => dependency.fromNodeId === fromNodeId && dependency.toNodeId === toNodeId) ?? null;
    if (existing) {
      existing.relation = relation;
      existing.lagDays = lagDays;
      return;
    }
    state.dependencies.push({
      id: `proposal-${randomUUID()}`,
      fromNodeId,
      toNodeId,
      relation,
      lagDays,
      createdAt: generatedAt,
    });
    return;
  }

  if (operation.operationType === "remove_dependency") {
    const existing = findDependency(state, {
      dependencyId: operation.dependencyId,
      fromNodeId: typeof after.fromNodeId === "string" ? after.fromNodeId : null,
      toNodeId: typeof after.toNodeId === "string" ? after.toNodeId : null,
    });
    if (!existing) return;
    state.dependencies = state.dependencies.filter((dependency) => dependency.id !== existing.id);
  }
}

function buildAgentHistorySnippet(entries: Array<{ trace: string; toolName: string; result: unknown }>) {
  if (entries.length === 0) return "No tool calls yet.";
  return entries.slice(-8).map((entry, index) => [
    `Step ${index + 1}`,
    `Trace: ${entry.trace}`,
    `Tool: ${entry.toolName}`,
    `Result: ${safeJson(entry.result)}`,
  ].join("\n")).join("\n\n");
}

function configuredTimeline2ModelConfig(): Timeline2ModelConfig {
  const env = getApiEnv();
  switch (env.MODEL_PROVIDER) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("Timeline 2 AI provider is not configured.");
      return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };
    case "gemini":
      if (!env.GEMINI_API_KEY) throw new Error("Timeline 2 AI provider is not configured.");
      return { provider: "gemini", apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
    case "groq":
      if (!env.GROQ_API_KEY) throw new Error("Timeline 2 AI provider is not configured.");
      return { provider: "groq", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL };
    case "openai":
    default:
      if (!env.OPENAI_API_KEY) throw new Error("Timeline 2 AI provider is not configured.");
      return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL };
  }
}

function sanitizeBaseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return value.slice(0, 120);
  }
}

function extractAi2GenerateObjectFailureDetails(err: unknown): {
  rawOutput: string | undefined;
  finishReason: string | undefined;
  causeMessage: string | undefined;
  invalidParsedValuePreview: string | undefined;
} {
  if (NoObjectGeneratedError.isInstance(err)) {
    const cause = err.cause;
    let invalidParsedValuePreview: string | undefined;
    if (cause != null && typeof cause === "object" && "value" in cause) {
      try {
        invalidParsedValuePreview = JSON.stringify((cause as { value: unknown }).value).slice(0, 500);
      } catch {
        invalidParsedValuePreview = undefined;
      }
    }
    return {
      rawOutput: err.text != null ? err.text : undefined,
      finishReason: err.finishReason ?? undefined,
      causeMessage:
        cause instanceof Error
          ? cause.message
          : cause != null && typeof cause === "object" && "message" in cause
            ? String((cause as { message: unknown }).message)
            : undefined,
      invalidParsedValuePreview,
    };
  }
  const anyErr = err as {
    text?: string;
    cause?: { text?: string };
    responseBody?: string;
  };
  return {
    rawOutput: anyErr.text ?? anyErr.cause?.text ?? anyErr.responseBody ?? undefined,
    finishReason: undefined,
    causeMessage: undefined,
    invalidParsedValuePreview: undefined,
  };
}

function timeline2ProviderLogMeta(modelConfig?: Timeline2ModelConfig) {
  try {
    const config = modelConfig ?? configuredTimeline2ModelConfig();
    return {
      provider: config.provider,
      model: config.model,
      openAiBaseUrl: sanitizeBaseUrl(process.env.OPENAI_BASE_URL),
    };
  } catch {
    return {
      provider: "unconfigured",
      model: null,
      openAiBaseUrl: sanitizeBaseUrl(process.env.OPENAI_BASE_URL),
    };
  }
}

function configuredTimeline2Provider() {
  const env = getApiEnv();
  const config = configuredTimeline2ModelConfig();
  return createLlmProvider({
    provider: config.provider,
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
  });
}

function workingNodeById(state: WorkingState, nodeId: string) {
  return state.nodes.find((node) => node.id === nodeId) ?? null;
}

function collectDescendantIds(state: WorkingState, nodeId: string) {
  const childrenByParent = new Map<string | null, WorkingNode[]>();
  for (const node of state.nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  const collected = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (collected.has(child.id)) continue;
      collected.add(child.id);
      stack.push(child.id);
    }
  }
  return collected;
}

function validateWorkingParentChoice(
  state: WorkingState,
  nodeId: string | null,
  parentId: string | null,
) {
  if (!parentId) return;
  const parent = workingNodeById(state, parentId);
  if (!parent) {
    throw new Error("Parent node not found in this Timeline 2 plan.");
  }
  if (parent.kind === "milestone") {
    throw new Error("Milestones cannot contain child items.");
  }
  if (!nodeId) return;
  if (nodeId === parentId) {
    throw new Error("A node cannot be its own parent.");
  }
  const descendants = collectDescendantIds(state, nodeId);
  if (descendants.has(parentId)) {
    throw new Error("Moving this node would create a hierarchy cycle.");
  }
}

function validateWorkingDependencyChoice(
  state: WorkingState,
  fromNodeId: string,
  toNodeId: string,
) {
  if (fromNodeId === toNodeId) {
    throw new Error("A node cannot depend on itself.");
  }
  if (!workingNodeById(state, fromNodeId) || !workingNodeById(state, toNodeId)) {
    throw new Error("Dependency nodes must both exist in this Timeline 2 plan.");
  }
  const outgoing = new Map<string, string[]>();
  for (const dependency of state.dependencies) {
    const list = outgoing.get(dependency.fromNodeId) ?? [];
    list.push(dependency.toNodeId);
    outgoing.set(dependency.fromNodeId, list);
  }
  const stack = [toNodeId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromNodeId) {
      throw new Error("This dependency would create a dependency cycle.");
    }
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of outgoing.get(current) ?? []) stack.push(next);
  }
}

function utcDayMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function formatLongDateUtc(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function overlapDayCount(rangeStart: string, rangeEnd: string, winStart: string, winEnd: string): number {
  const s = Math.max(utcDayMs(rangeStart), utcDayMs(winStart));
  const e = Math.min(utcDayMs(rangeEnd), utcDayMs(winEnd));
  if (e < s) return 0;
  return diffDays(new Date(s).toISOString().slice(0, 10), new Date(e).toISOString().slice(0, 10)) + 1;
}

function humanReadableStatus(status: Timeline2Status): string {
  switch (status) {
    case "completed":
      return "Done";
    case "in_progress":
      return "In Progress";
    case "not_started":
      return "Not started";
    case "waiting":
      return "Waiting";
    case "blocked":
      return "Blocked";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function isActiveScheduleStatus(status: Timeline2Status): boolean {
  return status !== "completed" && status !== "cancelled";
}

/** Finish-to-start CPM on actionable nodes; falls back to date-based inference when the FS graph is unusable. */
function computeCpmMetrics(state: WorkingState, todayIso: string) {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const actionable = state.nodes.filter((node) => node.kind !== "group");
  const actionableIds = new Set(actionable.map((node) => node.id));

  const datedAnchors: string[] = [];
  for (const node of actionable) {
    if (node.startDate) datedAnchors.push(node.startDate);
    if (node.dueDate) datedAnchors.push(node.dueDate);
  }
  const anchorIso = datedAnchors.length > 0 ? datedAnchors.slice().sort()[0]! : todayIso;

  const fsDeps = state.dependencies.filter(
    (dependency) =>
      dependency.relation === "finish_to_start" &&
      actionableIds.has(dependency.fromNodeId) &&
      actionableIds.has(dependency.toNodeId),
  );

  const duration = new Map<string, number>();
  for (const node of actionable) {
    duration.set(node.id, nodeDurationDays(node));
  }

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const id of actionableIds) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const dependency of fsDeps) {
    preds.get(dependency.toNodeId)!.push(dependency.fromNodeId);
    succs.get(dependency.fromNodeId)!.push(dependency.toNodeId);
  }

  const indegree = new Map<string, number>();
  for (const id of actionableIds) indegree.set(id, 0);
  for (const dependency of fsDeps) {
    indegree.set(dependency.toNodeId, (indegree.get(dependency.toNodeId) ?? 0) + 1);
  }

  const queue = [...actionableIds].filter((id) => (indegree.get(id) ?? 0) === 0);
  const topo: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    for (const successor of succs.get(id) ?? []) {
      indegree.set(successor, (indegree.get(successor) ?? 1) - 1);
      if (indegree.get(successor) === 0) queue.push(successor);
    }
  }

  const useFallback = fsDeps.length === 0 || topo.length !== actionable.length;
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const floatDays = new Map<string, number | null>();
  const criticalIds = new Set<string>();

  if (useFallback) {
    const inferred = inferPathFromNodes(state, null);
    for (const id of inferred.nodeIds) criticalIds.add(id);
    let projectEndExclusive = 0;
    for (const node of actionable) {
      const dur = duration.get(node.id)!;
      let startOffset = 0;
      if (node.startDate) startOffset = Math.max(0, diffDays(anchorIso, node.startDate));
      else if (node.dueDate) startOffset = Math.max(0, diffDays(anchorIso, node.dueDate) - dur + 1);
      es.set(node.id, startOffset);
      const endExclusive = startOffset + dur;
      ef.set(node.id, endExclusive);
      projectEndExclusive = Math.max(projectEndExclusive, endExclusive);
      floatDays.set(node.id, criticalIds.has(node.id) ? 0 : null);
    }
    const projectedEndIso =
      projectEndExclusive > 0 ? shiftIsoDate(anchorIso, Math.max(0, projectEndExclusive - 1)) : todayIso;
    return { anchorIso, es, ef, floatDays, criticalIds, projectEndExclusive, projectedEndIso, fsSuccessors: succs };
  }

  for (const id of topo) {
    let start = 0;
    for (const predecessor of preds.get(id) ?? []) {
      start = Math.max(start, ef.get(predecessor) ?? 0);
    }
    const node = byId.get(id)!;
    if (node.startDate) {
      start = Math.max(start, diffDays(anchorIso, node.startDate));
    }
    es.set(id, start);
    ef.set(id, start + duration.get(id)!);
  }

  let projectEndExclusive = 0;
  for (const id of actionableIds) {
    projectEndExclusive = Math.max(projectEndExclusive, ef.get(id) ?? 0);
  }

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...topo].reverse()) {
    const outgoing = succs.get(id) ?? [];
    if (outgoing.length > 0) {
      const minLs = Math.min(...outgoing.map((successor) => ls.get(successor)!));
      lf.set(id, minLs);
    } else {
      lf.set(id, projectEndExclusive);
    }
    ls.set(id, lf.get(id)! - duration.get(id)!);
  }

  for (const id of actionableIds) {
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    const rounded = Math.max(0, Math.round(totalFloat));
    floatDays.set(id, rounded);
    if (rounded === 0) criticalIds.add(id);
  }

  const projectedEndIso =
    projectEndExclusive > 0 ? shiftIsoDate(anchorIso, Math.max(0, projectEndExclusive - 1)) : todayIso;
  return { anchorIso, es, ef, floatDays, criticalIds, projectEndExclusive, projectedEndIso, fsSuccessors: succs };
}

function buildTaskRefMap(state: WorkingState): Map<string, string> {
  const actionable = state.nodes
    .filter((node) => node.kind !== "group")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, string>();
  actionable.forEach((node, index) => {
    map.set(node.id, `T${String(index + 1).padStart(2, "0")}`);
  });
  return map;
}

function formatAtRiskTasksOverview(state: WorkingState, todayIso: string): string {
  const cpm = computeCpmMetrics(state, todayIso);
  const taskRef = buildTaskRefMap(state);
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const deadline = state.projectTargetDate;
  const lines: string[] = [];

  type RiskRow = { ref: string; id: string; title: string; reason: string; impact: string };
  const rows: RiskRow[] = [];

  for (const node of state.nodes) {
    if (node.kind === "group") continue;
    const ref = taskRef.get(node.id) ?? node.id.slice(0, 8);
    const successors = (cpm.fsSuccessors.get(node.id) ?? [])
      .map((id) => taskRef.get(id) ?? id.slice(0, 8))
      .filter(Boolean);

    if (isActiveScheduleStatus(node.status) && node.startDate && node.startDate < todayIso) {
      const daysLate = diffDays(node.startDate, todayIso);
      const impact =
        successors.length > 0
          ? `Delay of ${daysLate} day(s) propagates to ${successors.join(", ")}`
          : "No downstream FS successors listed on this task.";
      rows.push({
        ref,
        id: node.id,
        title: node.title,
        reason: `Late — ${daysLate} day(s) after planned start (${formatLongDateUtc(node.startDate)}).`,
        impact,
      });
    }

    const fl = cpm.floatDays.get(node.id);
    if (fl === 0 && isActiveScheduleStatus(node.status)) {
      const impact =
        successors.length > 0
          ? `Critical path — any slip pushes ${successors.join(", ")}`
          : "Critical path — any slip extends the projected plan end.";
      rows.push({
        ref,
        id: node.id,
        title: node.title,
        reason: "Critical path — zero float.",
        impact,
      });
    }

    if (deadline && node.dueDate && node.dueDate > deadline && isActiveScheduleStatus(node.status)) {
      const daysOver = diffDays(deadline, node.dueDate);
      rows.push({
        ref,
        id: node.id,
        title: node.title,
        reason: `Deadline breach — due ${formatLongDateUtc(node.dueDate)} vs project target ${formatLongDateUtc(deadline)}.`,
        impact: `${daysOver} day(s) past project target date.`,
      });
    }
  }

  const dedup = new Map<string, RiskRow>();
  for (const row of rows) {
    const key = `${row.id}:${row.reason}`;
    dedup.set(key, row);
  }
  const unique = [...dedup.values()];

  lines.push(`AT RISK TASKS (${unique.length} found)`);
  lines.push("");
  if (unique.length === 0) {
    lines.push("(No automated risk flags for the current schedule snapshot.)");
    return lines.join("\n");
  }
  for (const row of unique) {
    lines.push(`[${row.ref}] ${row.title}`);
    lines.push(`  Reason:  ${row.reason}`);
    lines.push(`  Impact:  ${row.impact}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatTeamWorkloadOverview(state: WorkingState, todayIso: string, windowDays: number): string {
  const windowEnd = shiftIsoDate(todayIso, Math.max(0, windowDays - 1));
  const lines: string[] = [];
  lines.push(`TEAM WORKLOAD — next ${windowDays} day(s) (${formatLongDateUtc(todayIso)} → ${formatLongDateUtc(windowEnd)})`);
  lines.push("");

  for (const member of state.teamMembers) {
    const activeTasks = state.nodes.filter((node) => {
      if (node.kind === "group") return false;
      if (!isActiveScheduleStatus(node.status)) return false;
      if (!node.assignees.some((assignee) => assignee.userId === member.userId)) return false;
      if (!node.startDate || !node.dueDate) return false;
      return node.startDate <= windowEnd && node.dueDate >= todayIso;
    });

    let overlapSum = 0;
    for (const task of activeTasks) {
      overlapSum += overlapDayCount(task.startDate!, task.dueDate!, todayIso, windowEnd);
    }

    let label = "Available";
    if (activeTasks.length === 0) label = "Available";
    else if (activeTasks.length >= 3 || overlapSum > windowDays * 2) {
      label = `Busy (${overlapSum} overlap day(s)) ← likely overloaded`;
    } else if (overlapSum > windowDays || activeTasks.length === 2) {
      label = `Moderate (${overlapSum} overlap day(s))`;
    } else {
      label = `Light (${overlapSum} overlap day(s))`;
    }

    lines.push(`${member.name}    ${activeTasks.length} task(s)   ${label}`);
    for (const task of activeTasks.slice(0, 6)) {
      lines.push(`    · [${task.id.slice(0, 8)}] ${task.title} → ends ${task.dueDate ? formatLongDateUtc(task.dueDate) : "?"}`);
    }
    if (activeTasks.length > 6) lines.push(`    · … +${activeTasks.length - 6} more`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function buildPlanOverview(state: WorkingState, stagedOperationCount: number): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const taskRef = buildTaskRefMap(state);
  const cpm = computeCpmMetrics(state, todayIso);
  const deadlineIso = state.projectTargetDate;

  const actionableForList = state.nodes
    .filter((node) => node.kind !== "group")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const lines: string[] = [];

  const deadlineDisplay = deadlineIso ? formatLongDateUtc(deadlineIso) : "Not set";
  const daysToDeadline =
    deadlineIso && deadlineIso >= todayIso ? diffDays(todayIso, deadlineIso) : deadlineIso && deadlineIso < todayIso
      ? -diffDays(deadlineIso, todayIso)
      : null;
  const deadlineLine =
    deadlineIso && daysToDeadline !== null && daysToDeadline >= 0
      ? `${deadlineDisplay} (${daysToDeadline} day(s) from today)`
      : deadlineIso && daysToDeadline !== null && daysToDeadline < 0
        ? `${deadlineDisplay} (${Math.abs(daysToDeadline)} day(s) in the past)`
        : deadlineDisplay;

  const projectedEnd = cpm.projectedEndIso;
  let overrunLine = "On target (projected end before or on target date).";
  if (deadlineIso) {
    if (projectedEnd > deadlineIso) {
      const over = diffDays(deadlineIso, projectedEnd);
      overrunLine = `${formatLongDateUtc(projectedEnd)} (${over} day(s) over target)`;
    } else {
      const slack = diffDays(projectedEnd, deadlineIso);
      overrunLine = `${formatLongDateUtc(projectedEnd)} (${slack} day(s) before target)`;
    }
  } else {
    overrunLine = `${formatLongDateUtc(projectedEnd)} (no project target date on file)`;
  }

  const criticalLabels = [...cpm.criticalIds]
    .map((id) => taskRef.get(id) ?? id.slice(0, 8))
    .sort()
    .join(", ");

  const atRiskSummary: string[] = [];
  for (const node of actionableForList) {
    if (!isActiveScheduleStatus(node.status)) continue;
    if (node.startDate && node.startDate < todayIso) {
      atRiskSummary.push(`${taskRef.get(node.id) ?? node.id.slice(0, 8)} (late start)`);
    }
    if (node.status === "blocked") {
      atRiskSummary.push(`${taskRef.get(node.id) ?? node.id.slice(0, 8)} (blocked)`);
    }
    if (cpm.floatDays.get(node.id) === 0) {
      atRiskSummary.push(`${taskRef.get(node.id) ?? node.id.slice(0, 8)} (zero float)`);
    }
  }

  const teamLines: string[] = [];
  const windowEndQuick = shiftIsoDate(todayIso, 13);
  for (const member of state.teamMembers) {
    const activeTasks = state.nodes.filter((node) => {
      if (node.kind === "group") return false;
      if (!isActiveScheduleStatus(node.status)) return false;
      if (!node.assignees.some((a) => a.userId === member.userId)) return false;
      if (!node.startDate || !node.dueDate) return false;
      return node.startDate <= windowEndQuick && node.dueDate >= todayIso;
    });
    let overlapSum = 0;
    for (const task of activeTasks) {
      overlapSum += overlapDayCount(task.startDate!, task.dueDate!, todayIso, windowEndQuick);
    }
    if (activeTasks.length >= 3 || overlapSum > 28) {
      teamLines.push(
        `${member.name} overallocated ${formatLongDateUtc(todayIso)}–${formatLongDateUtc(windowEndQuick)} (${activeTasks.length} tasks, ${overlapSum} overlap day(s))`,
      );
    }
  }

  lines.push("SCHEDULE HEALTH");
  lines.push(`  Deadline:          ${deadlineLine}`);
  lines.push(`  Projected end:     ${overrunLine}`);
  lines.push(`  On critical path:  ${criticalLabels || "(no zero-float slice computed)"}`);
  lines.push(`  Tasks at risk:     ${atRiskSummary.length > 0 ? atRiskSummary.join("; ") : "None flagged"}`);
  lines.push(`  Team conflicts:    ${teamLines.length > 0 ? teamLines.join("; ") : "None flagged"}`);
  lines.push("");

  const groupNodes = state.nodes
    .filter((node) => node.kind === "group")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  if (groupNodes.length > 0) {
    lines.push("PLAN GROUPS (each line is a container — use nodeId with get_node_subtree and other tools)");
    for (const node of groupNodes) {
      lines.push(`  · nodeId=${node.id} — ${node.title}`);
    }
    lines.push("");
  }

  lines.push("PLAN TASKS (facts are computed — do not re-derive float, lateness, or schedule health)");
  lines.push("");

  for (const node of actionableForList) {
    const ref = taskRef.get(node.id) ?? "T??";
    const owner = node.assignees.map((assignee) => assignee.name).join(", ") || "Unassigned";
    const statusCore = humanReadableStatus(node.status);
    let statusLine = statusCore;

    let daysLateStart = 0;
    if (isActiveScheduleStatus(node.status) && node.startDate && node.startDate < todayIso) {
      daysLateStart = diffDays(node.startDate, todayIso);
      if (node.status === "in_progress") {
        statusLine = `${statusCore} — ${daysLateStart} day(s) late vs start`;
      } else if (node.status === "not_started") {
        statusLine = `${statusCore} — ${daysLateStart} day(s) overdue vs planned start`;
      } else {
        statusLine = `${statusCore} — ${daysLateStart} day(s) after planned start`;
      }
    }

    const dateParts: string[] = [];
    if (node.startDate && node.dueDate) {
      const span = diffDays(node.startDate, node.dueDate) + 1;
      dateParts.push(
        `${formatLongDateUtc(node.startDate)} → ${formatLongDateUtc(node.dueDate)}  (${span} day span)`,
      );
    } else if (node.startDate) {
      dateParts.push(`${formatLongDateUtc(node.startDate)} start  (${nodeDurationDays(node)} day duration assumption)`);
    } else if (node.dueDate) {
      dateParts.push(`${formatLongDateUtc(node.dueDate)} due`);
    } else {
      dateParts.push("Dates: not scheduled");
    }

    if (node.status === "not_started" && node.startDate && node.startDate > todayIso) {
      const until = diffDays(todayIso, node.startDate);
      dateParts.push(`starts in ${until} day(s)`);
    }

    let revisedNote = "";
    if (daysLateStart > 0 && node.dueDate) {
      const revised = shiftIsoDate(node.dueDate, daysLateStart);
      revisedNote = `  |  Revised end (shifted by late start): ${formatLongDateUtc(revised)}`;
    }

    const fl = cpm.floatDays.get(node.id);
    let floatLine =
      fl === null ? "Float:     — (not on FS-critical slice or insufficient FS links)" : `Float:     ${fl} day(s)`;
    if (fl === 0) floatLine += "  ← CRITICAL PATH";

    const succRefs = (cpm.fsSuccessors.get(node.id) ?? [])
      .map((id) => taskRef.get(id) ?? id.slice(0, 8))
      .join(", ");
    let riskLine = "Risk:      None";
    if (daysLateStart > 0 && succRefs) {
      riskLine = `Risk:      Delay of ${daysLateStart} day(s) propagates to ${succRefs}`;
      if (deadlineIso && projectedEnd > deadlineIso) {
        const overAll = diffDays(deadlineIso, projectedEnd);
        riskLine += `\n           Current projected overrun vs target: ${overAll} day(s)`;
      }
    } else if (fl === 0 && isActiveScheduleStatus(node.status)) {
      riskLine = `Risk:      Zero float — any slip extends downstream work${succRefs ? `: ${succRefs}` : ""}`;
    } else if (node.status === "blocked") {
      riskLine = "Risk:      Blocked — downstream dates may be stale until unblocked.";
    }

    lines.push(`[${ref}] ${node.title}`);
    lines.push(`  Kind:      ${node.kind}`);
    lines.push(`  Status:    ${statusLine}`);
    lines.push(`  Dates:     ${dateParts.join("  |  ")}${revisedNote}`);
    lines.push(`  Owner:     ${owner}`);
    lines.push(floatLine);
    lines.push(riskLine);
    lines.push("");
  }

  lines.push(`Staged AI operations in this session: ${stagedOperationCount}`);
  lines.push(`Plan nodes: ${state.nodes.length} | Dependencies: ${state.dependencies.length}`);

  return lines.join("\n");
}

function searchWorkingNodes(
  state: WorkingState,
  input: z.infer<typeof AgentSearchNodesArgsSchema>,
) {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const childCounts = buildChildCountMap(state);
  const { incoming, outgoing } = buildDependencyNodeMaps(state.dependencies);
  const todayIso = new Date().toISOString().slice(0, 10);
  const query = input.query?.trim().toLowerCase() ?? "";
  const matches = state.nodes
    .filter((node) => {
      if (input.kinds?.length && !input.kinds.includes(node.kind)) return false;
      if (input.statuses?.length && !input.statuses.includes(node.status)) return false;
      if (input.requireDates && !node.startDate && !node.dueDate) return false;
      if (input.rootNodeId && rootAncestorId(node.id, byId) !== input.rootNodeId) return false;
      if (query && !`${node.title} ${node.description ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .slice(0, input.limit)
    .map((node) =>
      buildWorkingNodeSummary(node, byId, {
        todayIso,
        childCounts,
        incomingNodeIds: incoming,
        outgoingNodeIds: outgoing,
        includeDescription: "excerpt",
      }),
    );
  return {
    count: matches.length,
    matches,
  };
}

function buildNodeSubtree(
  state: WorkingState,
  input: z.infer<typeof AgentGetNodeSubtreeArgsSchema>,
) {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const root = byId.get(input.nodeId);
  if (!root) {
    throw new Error("Requested node was not found.");
  }
  const childrenByParent = new Map<string | null, WorkingNode[]>();
  for (const node of state.nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  const included = new Set<string>([root.id]);
  const queue: Array<{ node: WorkingNode; depth: number }> = [{ node: root, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= input.depth) continue;
    for (const child of childrenByParent.get(current.node.id) ?? []) {
      if (included.has(child.id)) continue;
      included.add(child.id);
      queue.push({ node: child, depth: current.depth + 1 });
    }
  }
  const dependencies = state.dependencies.filter(
    (dependency) => included.has(dependency.fromNodeId) || included.has(dependency.toNodeId),
  );
  const childCounts = new Map<string, number>();
  for (const node of state.nodes) {
    if (!node.parentId || !included.has(node.id) || !included.has(node.parentId)) continue;
    childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
  }
  const { incoming, outgoing } = buildDependencyNodeMaps(dependencies);
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    root: buildWorkingNodeSummary(root, byId, {
      todayIso,
      childCounts,
      incomingNodeIds: incoming,
      outgoingNodeIds: outgoing,
      includeDescription: "full",
      includeActionRequired: true,
      includeDependencySummary: true,
    }),
    descendants: state.nodes
      .filter((node) => included.has(node.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
      .map((node) =>
        buildWorkingNodeSummary(node, byId, {
          todayIso,
          childCounts,
          incomingNodeIds: incoming,
          outgoingNodeIds: outgoing,
          includeDescription: "full",
          includeActionRequired: true,
          includeDependencySummary: true,
        }),
      ),
    dependencies,
  };
}

function buildDependencyGraph(
  state: WorkingState,
  input: z.infer<typeof AgentGetDependencyGraphArgsSchema>,
) {
  const nodeIds = input.nodeIds?.length ? new Set(input.nodeIds) : null;
  const deps = state.dependencies.filter((dependency) =>
    nodeIds ? nodeIds.has(dependency.fromNodeId) || nodeIds.has(dependency.toNodeId) : true,
  );
  return {
    dependencyCount: deps.length,
    isolatedNodeCount: state.nodes.filter((node) =>
      !deps.some((dependency) => dependency.fromNodeId === node.id || dependency.toNodeId === node.id),
    ).length,
    edges: deps,
  };
}

async function persistAiBranch(input: {
  queryTenant: (tenantId: string, sql: string, values?: unknown[]) => Promise<unknown[]>;
  loadBranchesForProject: (tenantId: string, projectId: string) => Promise<Timeline2Branch[]>;
  tenantId: string;
  projectId: string;
  planId: string;
  actorUserId: string;
  message: string;
  context: Timeline2AiContext;
  snapshot: Timeline2Snapshot;
  proposal: {
    title: string;
    summary: string;
    assistantMessage: string;
    operations: BranchDraftOperation[];
  };
  observability?: {
    reqId: string;
    log?: FastifyBaseLogger;
    route?: string;
    conversationId?: string | null;
  };
}) {
  const obs = input.observability;
  const opCount = input.proposal.operations.length;
  obs?.log?.info({
    reqId: obs.reqId,
    route: obs.route,
    projectId: input.projectId,
    conversationId: obs.conversationId ?? null,
    operationCount: opCount,
    hasStagedOps: opCount > 0,
    msg: "ai2-persist-branch-start",
  });
  try {
    const conversationRows = await input.queryTenant(
    input.tenantId,
    `INSERT INTO timeline2_ai_conversations
       (tenant_id, plan_id, project_id, user_id, title)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.tenantId, input.planId, input.projectId, input.actorUserId, input.message.slice(0, 80)],
  );
  const conversationId = (conversationRows[0] as { id: string }).id;
  await input.queryTenant(
    input.tenantId,
    `INSERT INTO timeline2_ai_messages
       (tenant_id, conversation_id, role, content, context_json)
     VALUES ($1, $2, 'user', $3, $4::jsonb),
            ($1, $2, 'assistant', $5, $4::jsonb)`,
    [
      input.tenantId,
      conversationId,
      input.message,
      JSON.stringify(input.context),
      input.proposal.assistantMessage,
    ],
  );

  const generatedAt = new Date().toISOString();
  const { baseSnapshot, proposedSnapshot } = buildProposalArtifacts(
    input.snapshot,
    input.proposal.operations,
    generatedAt,
  );

  const branchRows = await input.queryTenant(
    input.tenantId,
    `INSERT INTO timeline2_branches
       (tenant_id, plan_id, project_id, title, summary, base_revision_id,
        base_snapshot_json, proposed_snapshot_json, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
     RETURNING id`,
    [
      input.tenantId,
      input.planId,
      input.projectId,
      input.proposal.title,
      input.proposal.summary,
      input.snapshot.activeRevision?.id ?? null,
      JSON.stringify(baseSnapshot),
      JSON.stringify(proposedSnapshot),
      input.actorUserId,
    ],
  );
  const branchId = (branchRows[0] as { id: string }).id;
  for (const operation of input.proposal.operations) {
    await input.queryTenant(
      input.tenantId,
      `INSERT INTO timeline2_branch_operations
         (tenant_id, branch_id, operation_type, target_node_id, dependency_id,
          before_json, after_json, rationale, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        input.tenantId,
        branchId,
        operation.operationType,
        operation.targetNodeId,
        operation.dependencyId,
        operation.before ? JSON.stringify(operation.before) : null,
        JSON.stringify(operation.after),
        operation.rationale,
        operation.sortOrder,
      ],
    );
  }
  const branch = (await input.loadBranchesForProject(input.tenantId, input.projectId)).find(
    (item) => item.id === branchId,
  );
  if (!branch) {
    throw new Error("Timeline 2 AI created a branch but could not reload it.");
  }
  obs?.log?.info({
    reqId: obs.reqId,
    route: obs.route,
    branchId: branch.id,
    projectId: input.projectId,
    conversationId: obs.conversationId ?? null,
    operationCount: opCount,
    msg: "ai2-persist-branch-success",
  });
  return branch;
  } catch (err) {
    obs?.log?.warn({
      reqId: obs?.reqId,
      route: obs?.route,
      projectId: input.projectId,
      err,
      msg: "ai2-persist-branch-failed",
    });
    throw err;
  }
}

function inferPathFromNodes(state: WorkingState, rootNodeId?: string | null): CriticalPathAnalysis {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const actionable = state.nodes.filter((node) => node.kind !== "group");
  const filtered = actionable.filter((node) => {
    const rootId = rootAncestorId(node.id, byId);
    return rootNodeId ? rootId === rootNodeId : true;
  });
  const dated = filtered.filter((node) => node.startDate || node.dueDate);
  if (dated.length < 2) {
    return {
      mode: "insufficient",
      rootNodeId: rootNodeId ?? null,
      rootTitle: rootNodeId ? byId.get(rootNodeId)?.title ?? null : null,
      nodeIds: [],
      edges: [],
      milestoneNodeIds: [],
      suggestedMilestoneTitle: null,
      confidence: "low",
      totalDurationDays: 0,
      warnings: ["There are not enough dated tasks to infer a credible critical path."],
      rationale: "The plan does not contain enough dated tasks to infer sequencing safely.",
    };
  }

  const grouped = new Map<string, WorkingNode[]>();
  for (const node of dated) {
    const rootId = rootAncestorId(node.id, byId);
    const list = grouped.get(rootId) ?? [];
    list.push(node);
    grouped.set(rootId, list);
  }

  const best = [...grouped.entries()]
    .map(([rootId, nodes]) => {
      const sorted = [...nodes].sort((a, b) =>
        (a.startDate ?? a.dueDate ?? "9999-12-31").localeCompare(b.startDate ?? b.dueDate ?? "9999-12-31") ||
        (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
        a.sortOrder - b.sortOrder,
      );
      const totalDurationDays = sorted.reduce((sum, node) => sum + nodeDurationDays(node), 0);
      return { rootId, nodes: sorted, totalDurationDays };
    })
    .sort((a, b) => b.totalDurationDays - a.totalDurationDays || b.nodes.length - a.nodes.length)[0];

  if (!best || best.nodes.length < 2) {
    return {
      mode: "insufficient",
      rootNodeId: rootNodeId ?? null,
      rootTitle: rootNodeId ? byId.get(rootNodeId)?.title ?? null : null,
      nodeIds: [],
      edges: [],
      milestoneNodeIds: [],
      suggestedMilestoneTitle: null,
      confidence: "low",
      totalDurationDays: 0,
      warnings: ["No usable dated sequence could be inferred from the current plan."],
      rationale: "The plan lacks a stable sequence of dated tasks under one workstream.",
    };
  }

  const totalActionable = actionable.filter((node) => rootAncestorId(node.id, byId) === best.rootId).length;
  const coverage = totalActionable === 0 ? 0 : best.nodes.length / totalActionable;
  const confidence = coverage >= 0.8 ? "high" : coverage >= 0.5 ? "medium" : "low";
  const lastNode = best.nodes[best.nodes.length - 1];
  return {
    mode: "inferred",
    rootNodeId: best.rootId,
    rootTitle: byId.get(best.rootId)?.title ?? null,
    nodeIds: best.nodes.map((node) => node.id),
    edges: best.nodes.slice(0, -1).map((node, index) => ({
      fromNodeId: node.id,
      toNodeId: best.nodes[index + 1].id,
      relation: "finish_to_start" as const,
    })),
    milestoneNodeIds: best.nodes.filter((node) => node.kind === "milestone").map((node) => node.id),
    suggestedMilestoneTitle: lastNode.kind === "milestone" ? null : `Complete ${byId.get(best.rootId)?.title ?? lastNode.title}`,
    confidence,
    totalDurationDays: best.totalDurationDays,
    warnings: coverage < 0.8 ? ["Some tasks in this workstream are missing dates, so the inferred path is only partial."] : [],
    rationale: `Inferred the likely delivery path from dated nodes under ${byId.get(best.rootId)?.title ?? "the active workstream"}, ordered by start and due dates.`,
  };
}

function computeGraphCriticalPath(state: WorkingState, rootNodeId?: string | null): CriticalPathAnalysis {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const filteredDeps = state.dependencies.filter((dependency) => {
    if (!rootNodeId) return true;
    return rootAncestorId(dependency.fromNodeId, byId) === rootNodeId && rootAncestorId(dependency.toNodeId, byId) === rootNodeId;
  });
  if (filteredDeps.length === 0) return inferPathFromNodes(state, rootNodeId);

  const relevantNodeIds = new Set<string>();
  for (const dependency of filteredDeps) {
    relevantNodeIds.add(dependency.fromNodeId);
    relevantNodeIds.add(dependency.toNodeId);
  }
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const nodeId of relevantNodeIds) indegree.set(nodeId, 0);
  for (const dependency of filteredDeps) {
    const list = outgoing.get(dependency.fromNodeId) ?? [];
    list.push(dependency.toNodeId);
    outgoing.set(dependency.fromNodeId, list);
    indegree.set(dependency.toNodeId, (indegree.get(dependency.toNodeId) ?? 0) + 1);
  }
  const queue = [...[...indegree.entries()].filter(([, value]) => value === 0).map(([nodeId]) => nodeId)];
  const topo: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    topo.push(nodeId);
    for (const next of outgoing.get(nodeId) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  if (topo.length !== relevantNodeIds.size) {
    return {
      mode: "insufficient",
      rootNodeId: rootNodeId ?? null,
      rootTitle: rootNodeId ? byId.get(rootNodeId)?.title ?? null : null,
      nodeIds: [],
      edges: [],
      milestoneNodeIds: [],
      suggestedMilestoneTitle: null,
      confidence: "low",
      totalDurationDays: 0,
      warnings: ["The dependency graph contains a cycle, so the critical path cannot be computed safely."],
      rationale: "The explicit dependency graph is cyclic.",
    };
  }

  const distance = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  for (const nodeId of topo) {
    const currentDuration = nodeDurationDays(byId.get(nodeId)!);
    const currentDistance = distance.get(nodeId) ?? currentDuration;
    if (!distance.has(nodeId)) distance.set(nodeId, currentDuration);
    for (const next of outgoing.get(nodeId) ?? []) {
      const candidate = currentDistance + nodeDurationDays(byId.get(next)!);
      if (candidate > (distance.get(next) ?? 0)) {
        distance.set(next, candidate);
        predecessor.set(next, nodeId);
      }
    }
  }

  const endNodeId = [...distance.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? topo[topo.length - 1];
  const path: string[] = [];
  let cursor: string | null = endNodeId;
  while (cursor) {
    path.unshift(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }
  const pathEdges = path.slice(0, -1).map((nodeId, index) =>
    filteredDeps.find((dependency) => dependency.fromNodeId === nodeId && dependency.toNodeId === path[index + 1]),
  ).filter(Boolean) as Timeline2Dependency[];

  return {
    mode: "graph",
    rootNodeId: rootNodeId ?? (path[0] ? rootAncestorId(path[0], byId) : null),
    rootTitle: path[0] ? byId.get(rootAncestorId(path[0], byId))?.title ?? null : null,
    nodeIds: path,
    edges: pathEdges.map((dependency) => ({
      fromNodeId: dependency.fromNodeId,
      toNodeId: dependency.toNodeId,
      relation: dependency.relation,
    })),
    milestoneNodeIds: path.filter((nodeId) => byId.get(nodeId)?.kind === "milestone"),
    suggestedMilestoneTitle: null,
    confidence: "high",
    totalDurationDays: distance.get(endNodeId) ?? path.reduce((sum, nodeId) => sum + nodeDurationDays(byId.get(nodeId)!), 0),
    warnings: [],
    rationale: "Computed the longest path across the explicit dependency graph using task durations.",
  };
}

function buildAiContext(snapshot: Timeline2Snapshot): Timeline2AiContext {
  return {
    projectId: snapshot.projectId,
    generatedAt: snapshot.generatedAt,
    activeRevision: snapshot.activeRevision,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      status: node.status,
      priority: node.priority,
      startDate: node.startDate,
      dueDate: node.dueDate,
      actionRequired: node.actionRequired,
      assigneeNames: node.assignees.map((a) => a.name),
      rollup: node.rollup,
    })),
    dependencies: snapshot.dependencies,
    teamMembers: snapshot.teamMembers,
  };
}

function extractFirstJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with first object extraction below.
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function operationCounts(operations: Timeline2Operation[]) {
  return {
    total: operations.length,
    pending: operations.filter((op) => op.status === "pending").length,
    applied: operations.filter((op) => op.status === "applied").length,
    rejected: operations.filter((op) => op.status === "rejected").length,
  };
}

export const timeline2Routes: FastifyPluginAsync = async (fastify) => {
  const devSampleSeedEnabled = process.env.NODE_ENV !== "production";

  function parseOrBadRequest<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw fastify.httpErrors.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid request payload."
      );
    }
    return parsed.data;
  }

  async function assertProjectAccess(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
    mode: "read" | "write";
  }) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      tenantRole: input.tenantRole,
    });
    if (!access.projectExists) throw fastify.httpErrors.notFound("Project not found.");
    if (input.mode === "read" && !access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }
    if (input.mode === "write" && !access.canManage) {
      throw fastify.httpErrors.forbidden("Timeline 2 changes require project owner or editor access.");
    }
    if (input.mode === "write" && access.projectStatus === "archived") {
      throw fastify.httpErrors.conflict("Archived projects are read-only.");
    }
    return access;
  }

  async function ensurePlan(
    tenantId: string,
    projectId: string,
    actorUserId: string | null,
  ): Promise<PlanRow> {
    const rows = await fastify.db.queryTenant<PlanRow>(
      tenantId,
      `INSERT INTO timeline2_plans (tenant_id, project_id, created_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, project_id)
       DO UPDATE SET updated_at = timeline2_plans.updated_at
       RETURNING id,
                 project_id AS "projectId",
                 active_revision_id AS "activeRevisionId",
                 created_at::text AS "createdAt",
                 updated_at::text AS "updatedAt"`,
      [tenantId, projectId, actorUserId],
    );
    const plan = rows[0];
    if (!plan.activeRevisionId) {
      await recordRevision(tenantId, plan.id, actorUserId, "Initial empty Timeline 2 plan");
      const refreshed = await loadPlanById(tenantId, plan.id);
      if (refreshed) return refreshed;
    }
    return plan;
  }

  async function seedDevPlaceholderPlanIfEmpty(
    tenantId: string,
    projectId: string,
    planId: string,
    actorUserId: string | null,
  ) {
    if (!devSampleSeedEnabled) return false;
    const counts = await fastify.db.queryTenant<{ count: number }>(
      tenantId,
      `SELECT COUNT(*)::int AS count
         FROM timeline2_nodes
        WHERE tenant_id = $1 AND plan_id = $2`,
      [tenantId, planId],
    );
    if ((counts[0]?.count ?? 0) > 0) return false;

    const members = await listProjectMembers(fastify.db, tenantId, projectId);
    const ownerA = members[0]?.userId ?? null;
    const ownerB = members[1]?.userId ?? ownerA;

    const createNode = async (input: {
      parentId: string | null;
      kind: Timeline2NodeKind;
      title: string;
      description: string;
      status: Timeline2Status;
      priority: Timeline2Priority;
      startDate: string | null;
      dueDate: string | null;
      sortOrder: number;
      actionRequired: boolean;
      actionRequiredNote: string | null;
    }) => {
      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO timeline2_nodes
           (tenant_id, plan_id, parent_node_id, kind, title, description, status,
            priority, start_date, due_date, sort_order, action_required, action_required_note,
            created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
         RETURNING id`,
        [
          tenantId,
          planId,
          input.parentId,
          input.kind,
          input.title,
          input.description,
          input.status,
          input.priority,
          input.startDate,
          input.dueDate,
          input.sortOrder,
          input.actionRequired,
          input.actionRequiredNote,
          actorUserId,
        ],
      );
      return rows[0].id;
    };

    const rootId = await createNode({
      parentId: null,
      kind: "group",
      title: "Website launch readiness",
      description:
        "Cross-team launch coordination group for QA, approvals, rollout communication, and release gate.",
      status: "in_progress",
      priority: "high",
      startDate: "2026-05-06",
      dueDate: "2026-05-22",
      sortOrder: 0,
      actionRequired: true,
      actionRequiredNote: "PM must approve final go/no-go decision.",
    });
    const qaTaskId = await createNode({
      parentId: rootId,
      kind: "task",
      title: "Finalize QA checklist and defect triage",
      description:
        "Validate all launch-critical flows, capture open defects, and lock a severity-based triage plan.",
      status: "in_progress",
      priority: "high",
      startDate: "2026-05-08",
      dueDate: "2026-05-16",
      sortOrder: 0,
      actionRequired: true,
      actionRequiredNote: "Engineering lead must sign off on unresolved defects.",
    });
    const commsTaskId = await createNode({
      parentId: rootId,
      kind: "task",
      title: "Prepare stakeholder rollout brief and support playbook",
      description:
        "Draft launch brief, customer impact notes, escalation matrix, and first-week support response scripts.",
      status: "waiting",
      priority: "critical",
      startDate: "2026-05-12",
      dueDate: "2026-05-19",
      sortOrder: 1,
      actionRequired: true,
      actionRequiredNote: "Sales and Support managers must approve customer-facing messaging.",
    });
    const gateId = await createNode({
      parentId: rootId,
      kind: "milestone",
      title: "Go / No-Go launch review",
      description: "Single decision gate for quality, communication readiness, and staffing coverage.",
      status: "not_started",
      priority: "critical",
      startDate: "2026-05-21",
      dueDate: "2026-05-21",
      sortOrder: 2,
      actionRequired: true,
      actionRequiredNote: "Executive sponsor decision required.",
    });

    if (ownerA) await setAssignees(tenantId, rootId, [ownerA], actorUserId);
    if (ownerA) await setAssignees(tenantId, qaTaskId, [ownerA], actorUserId);
    if (ownerB) await setAssignees(tenantId, commsTaskId, [ownerB], actorUserId);
    const gateAssignees = [ownerA, ownerB].filter((id): id is string => Boolean(id));
    if (gateAssignees.length > 0) await setAssignees(tenantId, gateId, gateAssignees, actorUserId);

    await fastify.db.queryTenant(
      tenantId,
      `INSERT INTO timeline2_dependencies
         (tenant_id, plan_id, from_node_id, to_node_id, relation, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6),
              ($1, $2, $7, $4, $5, $6)
       ON CONFLICT (tenant_id, plan_id, from_node_id, to_node_id)
       DO UPDATE SET relation = EXCLUDED.relation`,
      [tenantId, planId, qaTaskId, gateId, "finish_to_start", actorUserId, commsTaskId],
    );

    await recordRevision(tenantId, planId, actorUserId, "Seeded Timeline 2 development placeholder plan");
    return true;
  }

  async function loadPlanByProject(tenantId: string, projectId: string): Promise<PlanRow | null> {
    const rows = await fastify.db.queryTenant<PlanRow>(
      tenantId,
      `SELECT id,
              project_id AS "projectId",
              active_revision_id AS "activeRevisionId",
              created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM timeline2_plans
        WHERE tenant_id = $1 AND project_id = $2
        LIMIT 1`,
      [tenantId, projectId],
    );
    return rows[0] ?? null;
  }

  async function loadPlanById(tenantId: string, planId: string): Promise<PlanRow | null> {
    const rows = await fastify.db.queryTenant<PlanRow>(
      tenantId,
      `SELECT id,
              project_id AS "projectId",
              active_revision_id AS "activeRevisionId",
              created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM timeline2_plans
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1`,
      [tenantId, planId],
    );
    return rows[0] ?? null;
  }

  async function setAssignees(
    tenantId: string,
    nodeId: string,
    assigneeUserIds: string[],
    actorUserId: string | null,
  ) {
    const uniqueIds = [...new Set(assigneeUserIds)];
    for (const userId of uniqueIds) {
      const rows = await fastify.db.queryTenant<{ userId: string }>(
        tenantId,
        `SELECT user_id AS "userId"
           FROM project_memberships pm
           JOIN timeline2_nodes n ON n.tenant_id = pm.tenant_id
           JOIN timeline2_plans p ON p.tenant_id = n.tenant_id AND p.id = n.plan_id
          WHERE pm.tenant_id = $1
            AND pm.project_id = p.project_id
            AND pm.user_id = $2
            AND n.id = $3
          LIMIT 1`,
        [tenantId, userId, nodeId],
      );
      if (!rows[0]) {
        throw fastify.httpErrors.badRequest("Assignees must be members of this project.");
      }
    }

    await fastify.db.queryTenant(
      tenantId,
      `DELETE FROM timeline2_node_assignees WHERE tenant_id = $1 AND node_id = $2`,
      [tenantId, nodeId],
    );
    for (const userId of uniqueIds) {
      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO timeline2_node_assignees
           (tenant_id, node_id, user_id, assigned_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, node_id, user_id) DO NOTHING`,
        [tenantId, nodeId, userId, actorUserId],
      );
    }
  }

  async function validateParent(
    tenantId: string,
    planId: string,
    nodeId: string | null,
    parentId: string | null,
  ) {
    if (!parentId) return;
    if (nodeId && parentId === nodeId) {
      throw fastify.httpErrors.badRequest("A node cannot be its own parent.");
    }
    const rows = await fastify.db.queryTenant<{ id: string; parentId: string | null; kind: Timeline2NodeKind }>(
      tenantId,
      `SELECT id, parent_node_id AS "parentId", kind
         FROM timeline2_nodes
        WHERE tenant_id = $1 AND plan_id = $2`,
      [tenantId, planId],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const parent = byId.get(parentId);
    if (!parent) {
      throw fastify.httpErrors.badRequest("Parent node not found in this Timeline 2 plan.");
    }
    if (parent.kind === "milestone") {
      throw fastify.httpErrors.badRequest("Milestones cannot contain child items.");
    }
    if (!nodeId) return;
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === nodeId) {
        throw fastify.httpErrors.badRequest("Moving this node would create a hierarchy cycle.");
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  async function validateKindChange(
    tenantId: string,
    planId: string,
    nodeId: string,
    kind: Timeline2NodeKind,
  ) {
    if (kind !== "milestone") return;
    const childRows = await fastify.db.queryTenant<{ id: string }>(
      tenantId,
      `SELECT id
         FROM timeline2_nodes
        WHERE tenant_id = $1 AND plan_id = $2 AND parent_node_id = $3
        LIMIT 1`,
      [tenantId, planId, nodeId],
    );
    if (childRows.length > 0) {
      throw fastify.httpErrors.badRequest("Milestones cannot contain child items.");
    }
  }

  async function validateDependency(
    tenantId: string,
    planId: string,
    fromNodeId: string,
    toNodeId: string,
  ) {
    if (fromNodeId === toNodeId) {
      throw fastify.httpErrors.badRequest("A node cannot depend on itself.");
    }
    const nodeRows = await fastify.db.queryTenant<{ id: string }>(
      tenantId,
      `SELECT id FROM timeline2_nodes
        WHERE tenant_id = $1 AND plan_id = $2 AND id = ANY($3::uuid[])`,
      [tenantId, planId, [fromNodeId, toNodeId]],
    );
    if (nodeRows.length !== 2) {
      throw fastify.httpErrors.badRequest("Dependency nodes must both exist in this Timeline 2 plan.");
    }

    const deps = await fastify.db.queryTenant<{ fromNodeId: string; toNodeId: string }>(
      tenantId,
      `SELECT from_node_id AS "fromNodeId", to_node_id AS "toNodeId"
         FROM timeline2_dependencies
        WHERE tenant_id = $1 AND plan_id = $2`,
      [tenantId, planId],
    );
    const outgoing = new Map<string, string[]>();
    for (const dep of deps) {
      const list = outgoing.get(dep.fromNodeId) ?? [];
      list.push(dep.toNodeId);
      outgoing.set(dep.fromNodeId, list);
    }
    const stack = [toNodeId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromNodeId) {
        throw fastify.httpErrors.badRequest("This dependency would create a dependency cycle.");
      }
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of outgoing.get(current) ?? []) stack.push(next);
    }
  }

  async function loadBranches(
    tenantId: string,
    projectId: string,
    status?: "open" | "accepted" | "rejected",
  ): Promise<Timeline2Branch[]> {
    const filters = ["tenant_id = $1", "project_id = $2"];
    const values: unknown[] = [tenantId, projectId];
    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    const branchRows = await fastify.db.queryTenant<BranchRow>(
      tenantId,
      `SELECT id,
              project_id AS "projectId",
              plan_id AS "planId",
              title,
              summary,
              status,
              base_revision_id AS "baseRevisionId",
              base_snapshot_json AS "baseSnapshot",
              proposed_snapshot_json AS "proposedSnapshot",
              created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM timeline2_branches
        WHERE ${filters.join(" AND ")}
        ORDER BY updated_at DESC, created_at DESC`,
      values,
    );
    if (branchRows.length === 0) return [];
    const ids = branchRows.map((branch) => branch.id);
    const opRows = await fastify.db.queryTenant<OperationRow>(
      tenantId,
      `SELECT id,
              branch_id AS "branchId",
              operation_type AS "operationType",
              target_node_id AS "targetNodeId",
              dependency_id AS "dependencyId",
              before_json AS "before",
              after_json AS "after",
              rationale,
              status,
              sort_order AS "sortOrder",
              created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM timeline2_branch_operations
        WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])
        ORDER BY branch_id, sort_order, created_at`,
      [tenantId, ids],
    );
    const opsByBranch = new Map<string, Timeline2Operation[]>();
    for (const op of opRows) {
      const item: Timeline2Operation = {
        id: op.id,
        branchId: op.branchId,
        operationType: op.operationType,
        targetNodeId: op.targetNodeId,
        dependencyId: op.dependencyId,
        before: op.before,
        after: op.after,
        rationale: op.rationale,
        status: op.status,
        sortOrder: op.sortOrder,
        createdAt: op.createdAt,
        updatedAt: op.updatedAt,
      };
      const list = opsByBranch.get(op.branchId) ?? [];
      list.push(item);
      opsByBranch.set(op.branchId, list);
    }
    return branchRows.map((branch) => {
      const operations = opsByBranch.get(branch.id) ?? [];
      return {
        id: branch.id,
        projectId: branch.projectId,
        planId: branch.planId,
        title: branch.title,
        summary: branch.summary,
        status: branch.status,
        baseRevisionId: branch.baseRevisionId,
        baseSnapshot: branch.baseSnapshot,
        proposedSnapshot: branch.proposedSnapshot,
        operations,
        operationCounts: operationCounts(operations),
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
      };
    });
  }

  async function createAi2Conversation(tenantId: string, projectId: string): Promise<string> {
    const rows = await fastify.db.queryTenant<{ id: string }>(
      tenantId,
      `INSERT INTO timeline2_ai2_conversations (tenant_id, project_id)
       VALUES ($1, $2)
       RETURNING id`,
      [tenantId, projectId],
    );
    const row = rows[0];
    if (!row) throw new Error("Could not create AI 2 conversation.");
    return row.id;
  }

  async function appendAi2Message(
    tenantId: string,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    await fastify.db.queryTenant(
      tenantId,
      `INSERT INTO timeline2_ai2_messages (tenant_id, conversation_id, role, content)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, conversationId, role, content],
    );
    await fastify.db.queryTenant(
      tenantId,
      `UPDATE timeline2_ai2_conversations SET updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, conversationId],
    );
  }

  async function loadAi2History(
    tenantId: string,
    conversationId: string,
    limit = 10,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const rows = await fastify.db.queryTenant<{ role: "user" | "assistant"; content: string }>(
      tenantId,
      `SELECT role, content
         FROM timeline2_ai2_messages
        WHERE tenant_id = $1 AND conversation_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [tenantId, conversationId, limit],
    );
    return rows.slice().reverse();
  }

  async function buildSnapshot(
    tenantId: string,
    projectId: string,
    includeBranches = true,
  ): Promise<Timeline2Snapshot> {
    const plan = await loadPlanByProject(tenantId, projectId);
    if (!plan) throw fastify.httpErrors.notFound("Timeline 2 plan not found.");

    const [revisionRows, nodeRows, assigneeRows, dependencyRows, projectMembers, projectTargetRows] =
      await Promise.all([
      fastify.db.queryTenant<Timeline2Revision>(
        tenantId,
        `SELECT id,
                revision_number AS "revisionNumber",
                reason,
                created_at::text AS "createdAt",
                created_by_user_id AS "createdByUserId"
           FROM timeline2_revisions
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1`,
        [tenantId, plan.activeRevisionId],
      ),
      fastify.db.queryTenant<NodeRow>(
        tenantId,
        `SELECT id,
                plan_id AS "planId",
                parent_node_id AS "parentId",
                kind,
                title,
                description,
                status,
                priority,
                start_date::text AS "startDate",
                due_date::text AS "dueDate",
                sort_order AS "sortOrder",
                progress,
                action_required AS "actionRequired",
                action_required_note AS "actionRequiredNote",
                created_at::text AS "createdAt",
                updated_at::text AS "updatedAt"
           FROM timeline2_nodes
          WHERE tenant_id = $1 AND plan_id = $2
          ORDER BY sort_order ASC, created_at ASC`,
        [tenantId, plan.id],
      ),
      fastify.db.queryTenant<{ nodeId: string; userId: string; name: string; email: string }>(
        tenantId,
        `SELECT na.node_id AS "nodeId",
                u.id AS "userId",
                COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name,
                u.email
           FROM timeline2_node_assignees na
           JOIN users u ON u.id = na.user_id
          WHERE na.tenant_id = $1
            AND na.node_id IN (
              SELECT id FROM timeline2_nodes WHERE tenant_id = $1 AND plan_id = $2
            )
          ORDER BY name ASC`,
        [tenantId, plan.id],
      ),
      fastify.db.queryTenant<DependencyRow>(
        tenantId,
        `SELECT id,
                from_node_id AS "fromNodeId",
                to_node_id AS "toNodeId",
                relation,
                lag_days AS "lagDays",
                created_at::text AS "createdAt"
           FROM timeline2_dependencies
          WHERE tenant_id = $1 AND plan_id = $2
          ORDER BY created_at ASC`,
        [tenantId, plan.id],
      ),
      listProjectMembers(fastify.db, tenantId, projectId),
      fastify.db.queryTenant<{ targetDate: string | null }>(
        tenantId,
        `SELECT target_date::text AS "targetDate"
           FROM projects
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1`,
        [tenantId, projectId],
      ),
    ]);

    const projectTargetDate = toIsoDate(projectTargetRows[0]?.targetDate ?? null);

    const teamMembers: Timeline2TeamMember[] = projectMembers.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
      tenantRole: member.tenantRole,
      projectRole: member.projectRole,
    }));

    const assigneesByNode = new Map<string, Timeline2Assignee[]>();
    for (const assignee of assigneeRows) {
      const list = assigneesByNode.get(assignee.nodeId) ?? [];
      list.push({ userId: assignee.userId, name: assignee.name, email: assignee.email });
      assigneesByNode.set(assignee.nodeId, list);
    }

    const dependencies: Timeline2Dependency[] = dependencyRows.map((dep) => ({
      id: dep.id,
      fromNodeId: dep.fromNodeId,
      toNodeId: dep.toNodeId,
      relation: dep.relation,
      lagDays: dep.lagDays,
      createdAt: dep.createdAt,
    }));

    const dependencyWarningsByNode = new Map<string, number>();
    const nodeDates = new Map(nodeRows.map((node) => [node.id, node]));
    for (const dep of dependencies) {
      const from = nodeDates.get(dep.fromNodeId);
      const to = nodeDates.get(dep.toNodeId);
      if (from?.dueDate && to?.startDate) {
        const earlyStartDays = diffDays(to.startDate, from.dueDate) + (dep.lagDays ?? 0);
        if (earlyStartDays > 0) {
          dependencyWarningsByNode.set(
            dep.toNodeId,
            (dependencyWarningsByNode.get(dep.toNodeId) ?? 0) + 1,
          );
        }
      }
    }

    const byId = new Map<string, Timeline2Node>();
    for (const row of nodeRows) {
      byId.set(row.id, {
        id: row.id,
        planId: row.planId,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        startDate: toIsoDate(row.startDate),
        dueDate: toIsoDate(row.dueDate),
        sortOrder: row.sortOrder,
        progress: row.progress,
        isCriticalPath: false,
        actionRequired: {
          required: row.actionRequired,
          note: row.actionRequiredNote,
        },
        assignees: assigneesByNode.get(row.id) ?? [],
        rollup: {
          healthStatus: row.status,
          priority: row.priority,
          startDate: toIsoDate(row.startDate),
          dueDate: toIsoDate(row.dueDate),
          assignees: assigneesByNode.get(row.id) ?? [],
          actionRequiredCount: row.actionRequired ? 1 : 0,
          dependencyWarningCount: dependencyWarningsByNode.get(row.id) ?? 0,
          descendantCount: 0,
        },
        children: [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }

    const roots: Timeline2Node[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const sortTree = (nodes: Timeline2Node[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
      for (const node of nodes) sortTree(node.children);
    };
    sortTree(roots);

    function computeRollup(node: Timeline2Node, seen = new Set<string>()) {
      if (seen.has(node.id)) return node.rollup;
      seen.add(node.id);

      const childRollups = node.children.map((child) => computeRollup(child, new Set(seen)));

      if (node.children.length === 0) {
        node.rollup = {
          healthStatus: node.status,
          priority: node.priority,
          startDate: node.startDate,
          dueDate: node.dueDate,
          assignees: [...node.assignees],
          actionRequiredCount: node.actionRequired.required ? 1 : 0,
          dependencyWarningCount: dependencyWarningsByNode.get(node.id) ?? 0,
          descendantCount: 0,
        };
        return node.rollup;
      }

      const childInputs = node.children.map((child, i) => ({
        rollup: childRollups[i]!,
        progress: child.progress,
        directAssignees: child.assignees,
      }));

      const { rollup, weightedProgress } = computeTimeline2RollupAggregateForSummaryNode({
        children: childInputs,
        nodeOwnActionRequired: node.actionRequired.required,
        nodeDependencyWarnings: dependencyWarningsByNode.get(node.id) ?? 0,
      });

      node.rollup = rollup;
      node.progress = weightedProgress;

      return node.rollup;
    }

    for (const root of roots) computeRollup(root);
    const scheduleMetrics = computeTimeline2CriticalPathMetrics({
      nodes: [...byId.values()],
      dependencies,
      todayIso: new Date().toISOString().slice(0, 10),
    });
    for (const nodeId of scheduleMetrics.criticalNodeIds) {
      const node = byId.get(nodeId);
      if (node) node.isCriticalPath = true;
    }
    const markAncestorCritical = (node: Timeline2Node) => {
      if (
        node.children.length > 0 &&
        node.children.some((child) => child.isCriticalPath || markAncestorCritical(child))
      ) {
        node.isCriticalPath = true;
      }
      return node.isCriticalPath;
    };
    for (const root of roots) markAncestorCritical(root);
    const nodes = [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      plan: {
        id: plan.id,
        projectId: plan.projectId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
      activeRevision: revisionRows[0] ?? null,
      tree: roots,
      nodes,
      dependencies,
      teamMembers,
      openBranches: includeBranches ? await loadBranches(tenantId, projectId, "open") : [],
      projectTargetDate,
    };
  }

  function defaultTimeline2UserPreferences(): Timeline2UserPreferences {
    return normalizeTimeline2UserPreferences({
      columnOrder: [...TIMELINE2_GANTT_COLUMN_ORDER],
      visibleColumns: TIMELINE2_GANTT_COLUMN_ORDER.filter((key) => key !== "task_name"),
      columnWidths: {},
      outlineWidth: 520,
      dayWidth: 38,
      collapsedNodeIds: [],
    });
  }

  async function loadTimeline2UserPreferences(
    tenantId: string,
    userId: string,
    projectId: string,
  ): Promise<Timeline2UserPreferences> {
    const defaults = defaultTimeline2UserPreferences();
    const rows = await fastify.db.queryTenant<{
      columnOrder: unknown;
      visibleColumns: unknown;
      columnWidths: unknown;
      outlineWidth: number;
      dayWidth: number;
      collapsedNodeIds: unknown;
    }>(
      tenantId,
      `SELECT column_order AS "columnOrder",
              visible_columns AS "visibleColumns",
              column_widths AS "columnWidths",
              outline_width AS "outlineWidth",
              day_width AS "dayWidth",
              collapsed_node_ids AS "collapsedNodeIds"
         FROM timeline2_user_preferences
        WHERE tenant_id = $1 AND user_id = $2 AND project_id = $3
        LIMIT 1`,
      [tenantId, userId, projectId],
    );
    const row = rows[0];
    if (!row) return defaults;
    const readStringArray = (value: unknown, fallback: string[]) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
    const rawWidths =
      typeof row.columnWidths === "object" && row.columnWidths !== null
        ? (row.columnWidths as Record<string, number>)
        : {};
    return normalizeTimeline2UserPreferences({
      columnOrder: readStringArray(row.columnOrder, defaults.columnOrder),
      visibleColumns: readStringArray(row.visibleColumns, defaults.visibleColumns),
      columnWidths: rawWidths,
      outlineWidth: Number(row.outlineWidth) || defaults.outlineWidth,
      dayWidth: Number(row.dayWidth) || defaults.dayWidth,
      collapsedNodeIds: readStringArray(row.collapsedNodeIds, defaults.collapsedNodeIds),
    });
  }

  async function saveTimeline2UserPreferences(
    tenantId: string,
    userId: string,
    projectId: string,
    preferences: Timeline2UserPreferences,
  ): Promise<Timeline2UserPreferences> {
    const defaults = defaultTimeline2UserPreferences();
    const next = normalizeTimeline2UserPreferences({
      ...defaults,
      ...preferences,
      columnWidths: { ...defaults.columnWidths, ...(preferences.columnWidths ?? {}) },
    });
    await fastify.db.queryTenant(
      tenantId,
      `INSERT INTO timeline2_user_preferences
         (tenant_id, user_id, project_id, column_order, visible_columns, column_widths,
          outline_width, day_width, collapsed_node_ids, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, NOW())
       ON CONFLICT (tenant_id, user_id, project_id)
       DO UPDATE SET
         column_order = EXCLUDED.column_order,
         visible_columns = EXCLUDED.visible_columns,
         column_widths = EXCLUDED.column_widths,
         outline_width = EXCLUDED.outline_width,
         day_width = EXCLUDED.day_width,
         collapsed_node_ids = EXCLUDED.collapsed_node_ids,
         updated_at = NOW()`,
      [
        tenantId,
        userId,
        projectId,
        JSON.stringify(next.columnOrder),
        JSON.stringify(next.visibleColumns),
        JSON.stringify(next.columnWidths),
        next.outlineWidth,
        next.dayWidth,
        JSON.stringify(next.collapsedNodeIds),
      ],
    );
    return next;
  }

  async function buildTimeline2CriticalPath(
    tenantId: string,
    projectId: string,
  ): Promise<{
    criticalNodeIds: string[];
    floatDaysByNodeId: Record<string, number | null>;
    projectedEndDate: string;
    warnings: string[];
  }> {
    const snapshot = await buildSnapshot(tenantId, projectId, false);
    const metrics = computeTimeline2CriticalPathMetrics({
      nodes: snapshot.nodes,
      dependencies: snapshot.dependencies,
      todayIso: new Date().toISOString().slice(0, 10),
    });
    return {
      criticalNodeIds: metrics.criticalNodeIds,
      floatDaysByNodeId: metrics.floatDaysByNodeId,
      projectedEndDate: metrics.projectedEndDate,
      warnings: metrics.warnings,
    };
  }

  async function buildRevisionSnapshotJson(tenantId: string, planId: string): Promise<Record<string, unknown>> {
    const plan = await loadPlanById(tenantId, planId);
    if (!plan) throw fastify.httpErrors.notFound("Timeline 2 plan not found.");
    const snapshot = await buildSnapshot(tenantId, plan.projectId, false);
    return {
      projectId: snapshot.projectId,
      generatedAt: snapshot.generatedAt,
      nodes: snapshot.nodes.map(compactNode),
      dependencies: snapshot.dependencies,
    };
  }

  async function recordRevision(
    tenantId: string,
    planId: string,
    actorUserId: string | null,
    reason: string,
  ): Promise<string> {
    const [{ nextRevision }] = await fastify.db.queryTenant<{ nextRevision: number }>(
      tenantId,
      `SELECT COALESCE(MAX(revision_number), 0) + 1 AS "nextRevision"
         FROM timeline2_revisions
        WHERE tenant_id = $1 AND plan_id = $2`,
      [tenantId, planId],
    );
    const snapshotJson = await buildRevisionSnapshotJson(tenantId, planId);
    const rows = await fastify.db.queryTenant<{ id: string }>(
      tenantId,
      `INSERT INTO timeline2_revisions
         (tenant_id, plan_id, revision_number, reason, snapshot_json, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id`,
      [tenantId, planId, nextRevision, reason, JSON.stringify(snapshotJson), actorUserId],
    );
    const revisionId = rows[0].id;
    await fastify.db.queryTenant(
      tenantId,
      `UPDATE timeline2_plans
          SET active_revision_id = $3, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, planId, revisionId],
    );
    return revisionId;
  }

  async function loadNodePlan(tenantId: string, nodeId: string): Promise<{ planId: string; projectId: string } | null> {
    const rows = await fastify.db.queryTenant<{ planId: string; projectId: string }>(
      tenantId,
      `SELECT n.plan_id AS "planId", p.project_id AS "projectId"
         FROM timeline2_nodes n
         JOIN timeline2_plans p ON p.tenant_id = n.tenant_id AND p.id = n.plan_id
        WHERE n.tenant_id = $1 AND n.id = $2
        LIMIT 1`,
      [tenantId, nodeId],
    );
    return rows[0] ?? null;
  }

  async function loadDependencyPlan(tenantId: string, dependencyId: string): Promise<{ planId: string; projectId: string } | null> {
    const rows = await fastify.db.queryTenant<{ planId: string; projectId: string }>(
      tenantId,
      `SELECT d.plan_id AS "planId", p.project_id AS "projectId"
         FROM timeline2_dependencies d
         JOIN timeline2_plans p ON p.tenant_id = d.tenant_id AND p.id = d.plan_id
        WHERE d.tenant_id = $1 AND d.id = $2
        LIMIT 1`,
      [tenantId, dependencyId],
    );
    return rows[0] ?? null;
  }

  function buildProposalFromMessage(message: string, snapshot: Timeline2Snapshot) {
    // Refuse requests that require reading, modifying, or deleting existing data.
    // The deterministic fallback can only create new nodes. Anything else must
    // go through the structured planner. If the structured planner failed and
    // the message matches this gate, the caller surfaces an honest error.
    const requiresStructuredPlanner =
      /\b(read|describe|remove|delete|update|modify|implement|go over|check|fix|change|edit|replace|rewrite|move|reorgani[sz]e|restructure|look at|analyse|analyze)\b/i.test(
        message,
      );
    if (requiresStructuredPlanner) return null;

    const clean = message.replace(/\s+/g, " ").trim();
    const generatedAt = new Date().toISOString();
    const operations: BranchDraftOperation[] = [];
    const requestedGroupTitle = parseRequestedGroupTitle(clean);
    const contextualParent = requestedGroupTitle ? null : inferPronounParent(snapshot, clean);
    const sequentialTasks = extractSequentialTaskSpecs(clean);
    const startDate = parseRequestedStartDate(clean);

    if (!requestedGroupTitle && sequentialTasks.length < 2) {
      return null;
    }

    if (requestedGroupTitle) {
      const groupTempId = `proposal-${randomUUID()}`;
      const childParentId = groupTempId;
      const chainTaskIds: string[] = [];
      let cursor = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
      let groupStartDate: string | null = null;
      let groupDueDate: string | null = null;

      operations.push({
        operationType: "create_node",
        targetNodeId: null,
        dependencyId: null,
        before: null,
        after: {
          clientTempId: groupTempId,
          parentId: null,
          kind: "group",
          title: requestedGroupTitle,
          description: `Created from AI request: ${clean}`,
          status: "not_started",
          priority: "medium",
          startDate: null,
          dueDate: null,
          sortOrder: snapshot.nodes.length,
          actionRequired: { required: false, note: null },
          assigneeUserIds: [],
        },
        rationale: "The request described a new project/workstream, so the fallback created a top-level planning group.",
        sortOrder: 0,
      });

      sequentialTasks.forEach((task, index) => {
        const tempId = `proposal-${randomUUID()}`;
        let taskStartDate: string | null = null;
        let taskDueDate: string | null = null;
        if (cursor) {
          taskStartDate = cursor.toISOString().slice(0, 10);
          const due = new Date(cursor);
          due.setUTCDate(due.getUTCDate() + task.durationDays - 1);
          taskDueDate = due.toISOString().slice(0, 10);
          cursor = new Date(due);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          groupStartDate ??= taskStartDate;
          groupDueDate = taskDueDate;
        }
        chainTaskIds.push(tempId);
        operations.push({
          operationType: "create_node",
          targetNodeId: null,
          dependencyId: null,
          before: null,
          after: {
            clientTempId: tempId,
            parentId: childParentId,
            kind: "task",
            title: task.title,
            description: `Created from AI request: ${clean}`,
            status: "not_started",
            priority: "medium",
            startDate: taskStartDate,
            dueDate: taskDueDate,
            sortOrder: index,
            actionRequired: { required: false, note: null },
            assigneeUserIds: [],
          },
          rationale: "The fallback extracted a sequential task from the user's natural-language plan.",
          sortOrder: operations.length,
        });
      });

      if (groupStartDate || groupDueDate) {
        operations[0].after.startDate = groupStartDate;
        operations[0].after.dueDate = groupDueDate;
      }

      for (let index = 0; index < chainTaskIds.length - 1; index += 1) {
        operations.push({
          operationType: "set_dependency",
          targetNodeId: null,
          dependencyId: null,
          before: null,
          after: {
            fromNodeId: chainTaskIds[index],
            toNodeId: chainTaskIds[index + 1],
            relation: "finish_to_start",
          },
          rationale: "The fallback linked the requested tasks into a finish-to-start chain.",
          sortOrder: operations.length,
        });
      }
    } else if (sequentialTasks.length >= 2) {
      const parentId = contextualParent?.id ?? null;
      const chainTaskIds: string[] = [];
      let cursor = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
      sequentialTasks.forEach((task, index) => {
        const tempId = `proposal-${randomUUID()}`;
        let taskStartDate: string | null = null;
        let taskDueDate: string | null = null;
        if (cursor) {
          taskStartDate = cursor.toISOString().slice(0, 10);
          const due = new Date(cursor);
          due.setUTCDate(due.getUTCDate() + task.durationDays - 1);
          taskDueDate = due.toISOString().slice(0, 10);
          cursor = new Date(due);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        chainTaskIds.push(tempId);
        operations.push({
          operationType: "create_node",
          targetNodeId: null,
          dependencyId: null,
          before: null,
          after: {
            clientTempId: tempId,
            parentId,
            kind: "task",
            title: task.title,
            description: `Created from AI request: ${clean}`,
            status: "not_started",
            priority: "medium",
            startDate: taskStartDate,
            dueDate: taskDueDate,
            sortOrder: snapshot.nodes.length + index,
            actionRequired: { required: false, note: null },
            assigneeUserIds: [],
          },
          rationale: contextualParent
            ? "The fallback attached the requested chain to the latest top-level planning item in context."
            : "The fallback extracted a sequential set of tasks from the user's request.",
          sortOrder: operations.length,
        });
      });
      for (let index = 0; index < chainTaskIds.length - 1; index += 1) {
        operations.push({
          operationType: "set_dependency",
          targetNodeId: null,
          dependencyId: null,
          before: null,
          after: {
            fromNodeId: chainTaskIds[index],
            toNodeId: chainTaskIds[index + 1],
            relation: "finish_to_start",
          },
          rationale: "The fallback linked the requested tasks into a finish-to-start chain.",
          sortOrder: operations.length,
        });
      }
    }

    const { baseSnapshot, proposedSnapshot } = buildProposalArtifacts(snapshot, operations, generatedAt);
    return {
      title: "Timeline 2 AI proposal",
      summary: `AI branch from: ${clean.slice(0, 180)}`,
      baseSnapshot,
      proposedSnapshot,
      operations,
    };
  }

  async function buildAiProposalFromContext(input: {
    message: string;
    snapshot: Timeline2Snapshot;
    context: Timeline2AiContext;
  }) {
    const llmProvider = (() => {
      try {
        const env = getApiEnv();
        return createLlmProvider({
          provider: env.MODEL_PROVIDER,
          openAiApiKey: env.OPENAI_API_KEY,
          openAiModel: env.OPENAI_MODEL,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
          anthropicModel: env.ANTHROPIC_MODEL,
          geminiApiKey: env.GEMINI_API_KEY,
          geminiModel: env.GEMINI_MODEL,
          groqApiKey: env.GROQ_API_KEY,
          groqModel: env.GROQ_MODEL,
        });
      } catch (error) {
        fastify.log.warn({ err: error }, "Timeline 2 AI provider unavailable; using deterministic fallback");
        return null;
      }
    })();
    if (!llmProvider) return null;

    const clean = input.message.replace(/\s+/g, " ").trim();
    const validParentIds = new Set(input.snapshot.nodes.map((node) => node.id));
    const validAssigneeIds = new Set(input.snapshot.teamMembers.map((member) => member.userId));
    const generatedAt = new Date().toISOString();

    const instructions = [
      "You are Timeline 2 planning AI.",
      "Return JSON only. No markdown.",
      "You are operating inside the currently open project plan, not creating a brand-new workspace project row.",
      "If the user says 'create a new project', model it as a top-level group/workstream in this Timeline 2 plan.",
      "You may produce create_node operations and set_dependency operations.",
      "Do not update, move, or delete existing nodes in this response.",
      "If you create parent and child nodes in the same response, define the parent first.",
      "When a new node needs to be referenced later, give it a short ref like product_x or market_research.",
      "parentId may be null, an existing node UUID, or a ref from an earlier create_node operation.",
      "Dependency node references may be either existing node UUIDs or refs from earlier create_node operations.",
      `Today is ${generatedAt.slice(0, 10)}. If the user names a month like June, convert it to a concrete YYYY-MM-DD date.`,
      "Use this response shape exactly:",
      '{ "title": string, "summary": string, "operations": [{ "type": "create_node", "ref": string, "kind": "group|task|milestone", "title": string, "description": string|null, "parentId": string|null, "status": "not_started|in_progress|waiting|blocked|completed|cancelled", "priority": "low|medium|high|critical", "startDate": "YYYY-MM-DD"|null, "dueDate": "YYYY-MM-DD"|null, "assigneeUserIds": string[], "actionRequiredNote": string|null, "rationale": string }, { "type": "set_dependency", "fromNodeId": string, "toNodeId": string, "relation": "finish_to_start|start_to_start|finish_to_finish|start_to_finish", "rationale": string }] }',
      "If the request describes a sequence, use finish_to_start dependencies between the relevant tasks.",
      "If unsure, still return 1-6 useful operations.",
      `User request: ${clean}`,
      `Allowed parent node ids: ${JSON.stringify([...validParentIds])}`,
      `Allowed assignee user ids: ${JSON.stringify([...validAssigneeIds])}`,
      "Context JSON:",
      JSON.stringify(input.context),
    ].join("\n");

    const raw = await llmProvider.generateResponse({
      message: instructions,
      projectContext: {
        totalTasks: input.context.nodes.length,
        completed: input.context.nodes.filter((node) => node.status === "completed").length,
        blocked: input.context.nodes.filter((node) => node.status === "blocked").length,
        highRisk: input.context.nodes.filter(
          (node) => node.priority === "critical" || node.actionRequired.required,
        ).length,
        completionRate:
          input.context.nodes.length === 0
            ? 0
            : Math.round(
                (input.context.nodes.filter((node) => node.status === "completed").length /
                  input.context.nodes.length) *
                  100,
              ) / 100,
      },
    });

    const parsed = AiProposalSchema.safeParse(extractFirstJsonObject(raw));
    if (!parsed.success) return null;

    const title = parsed.data.title?.trim() || "Timeline 2 AI proposal";
    const summary = parsed.data.summary?.trim() || `AI branch from: ${clean.slice(0, 180)}`;

    const createSpecs = parsed.data.operations
      .filter((operation): operation is z.infer<typeof AiCreateNodeOperationSchema> => operation.type === "create_node")
      .map((operation, index) => {
        const refSeed = operation.ref && AI_REFERENCE_PATTERN.test(operation.ref)
          ? operation.ref
          : `${operation.title}-${index + 1}`;
        const normalizedRef = normalizeAiReference(refSeed);
        const parentRefKey =
          operation.parentId && !isUuidLike(operation.parentId)
            ? normalizeAiReference(operation.parentId)
            : null;
        return {
          index,
          refKey: normalizedRef,
          clientTempId: `proposal-${randomUUID()}`,
          parentRefKey,
          operation,
        };
      });

    const createRefMap = new Map(createSpecs.map((spec) => [spec.refKey, spec.clientTempId]));
    const orderedCreateSpecs = topologicallyOrderCreateOps(createSpecs);
    const operations: BranchDraftOperation[] = [];

    for (const spec of orderedCreateSpecs) {
      const parentId = spec.operation.parentId
        ? isUuidLike(spec.operation.parentId)
          ? (validParentIds.has(spec.operation.parentId) ? spec.operation.parentId : null)
          : (createRefMap.get(normalizeAiReference(spec.operation.parentId)) ?? null)
        : null;
      const assigneeUserIds = (spec.operation.assigneeUserIds ?? []).filter((id) => validAssigneeIds.has(id));
      operations.push({
        operationType: "create_node",
        targetNodeId: null,
        dependencyId: null,
        before: null,
        after: {
          clientTempId: spec.clientTempId,
          parentId,
          kind: spec.operation.kind,
          title: spec.operation.title,
          description: spec.operation.description ?? `Created from AI request: ${clean}`,
          status: spec.operation.status,
          priority: spec.operation.priority,
          startDate: spec.operation.startDate ?? null,
          dueDate: spec.operation.dueDate ?? null,
          sortOrder: input.snapshot.nodes.length + operations.length,
          actionRequired: {
            required: Boolean(spec.operation.actionRequiredNote),
            note: spec.operation.actionRequiredNote ?? null,
          },
          assigneeUserIds,
        },
        rationale: spec.operation.rationale?.trim() || "AI proposed this node based on current Timeline 2 context.",
        sortOrder: operations.length,
      });
    }

    for (const spec of parsed.data.operations) {
      if (spec.type !== "set_dependency") continue;
      const fromNodeId = isUuidLike(spec.fromNodeId)
        ? (validParentIds.has(spec.fromNodeId) ? spec.fromNodeId : null)
        : (createRefMap.get(normalizeAiReference(spec.fromNodeId)) ?? null);
      const toNodeId = isUuidLike(spec.toNodeId)
        ? (validParentIds.has(spec.toNodeId) ? spec.toNodeId : null)
        : (createRefMap.get(normalizeAiReference(spec.toNodeId)) ?? null);
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;
      operations.push({
        operationType: "set_dependency",
        targetNodeId: null,
        dependencyId: null,
        before: null,
        after: {
          fromNodeId,
          toNodeId,
          relation: spec.relation ?? "finish_to_start",
        },
        rationale: spec.rationale?.trim() || "AI proposed this dependency based on the requested sequence.",
        sortOrder: operations.length,
      });
    }

    if (operations.length === 0) return null;
    const { baseSnapshot, proposedSnapshot } = buildProposalArtifacts(input.snapshot, operations, generatedAt);

    return {
      title,
      summary,
      baseSnapshot,
      proposedSnapshot,
      operations,
    };
  }

  function buildCriticalPathProposal(message: string, snapshot: Timeline2Snapshot) {
    const normalized = message.replace(/\s+/g, " ").trim();
    if (!/\bcritical path\b/i.test(normalized) || !/\b(milestone|milestones|dependency|dependencies)\b/i.test(normalized)) {
      return null;
    }

    const workingState = cloneWorkingState(snapshot);
    const analysis = computeGraphCriticalPath(workingState, null);
    if (analysis.nodeIds.length === 0) {
      return {
        type: "failure" as const,
        message: analysis.warnings[0] ?? "The current Timeline 2 plan does not have enough sequencing data to propose a critical path branch yet.",
      };
    }

    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const lastNodeId = analysis.nodeIds[analysis.nodeIds.length - 1] ?? null;
    const lastNode = lastNodeId ? byId.get(lastNodeId) ?? null : null;
    if (!lastNodeId || !lastNode) {
      return {
        type: "failure" as const,
        message: "The current Timeline 2 plan does not expose a usable critical path end node.",
      };
    }

    const generatedAt = new Date().toISOString();
    const operations: BranchDraftOperation[] = [];
    const pathEdges = analysis.edges.map((edge) => `${edge.fromNodeId}:${edge.toNodeId}:${edge.relation}`);
    const existingEdges = new Set(snapshot.dependencies.map((edge) => `${edge.fromNodeId}:${edge.toNodeId}:${edge.relation}`));

    if (analysis.mode === "inferred") {
      for (const edge of analysis.edges) {
        const edgeKey = `${edge.fromNodeId}:${edge.toNodeId}:${edge.relation}`;
        if (existingEdges.has(edgeKey)) continue;
        operations.push({
          operationType: "set_dependency",
          targetNodeId: null,
          dependencyId: null,
          before: null,
          after: {
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            relation: edge.relation,
          },
          rationale: "AI 2 inferred this finish-to-start dependency from the dated critical path sequence.",
          sortOrder: operations.length,
        });
      }
    }

    if (lastNode.kind !== "milestone") {
      const milestoneTempId = `proposal-${randomUUID()}`;
      const milestoneDate = lastNode.dueDate ?? lastNode.startDate ?? null;
      operations.push({
        operationType: "create_node",
        targetNodeId: null,
        dependencyId: null,
        before: null,
        after: {
          clientTempId: milestoneTempId,
          parentId: analysis.rootNodeId ?? lastNode.parentId ?? null,
          kind: "milestone",
          title: analysis.suggestedMilestoneTitle ?? "Critical Path Finish",
          description: `Created from AI 2 critical path request: ${normalized}`,
          status: "not_started",
          priority: "high",
          startDate: milestoneDate,
          dueDate: milestoneDate,
          sortOrder: snapshot.nodes.length + operations.length,
          actionRequired: { required: false, note: null },
          assigneeUserIds: [],
        },
        rationale: "AI 2 created a finish milestone so the critical path can be reviewed as a concrete delivery gate.",
        sortOrder: operations.length,
      });
      operations.push({
        operationType: "set_dependency",
        targetNodeId: null,
        dependencyId: null,
        before: null,
        after: {
          fromNodeId: lastNodeId,
          toNodeId: milestoneTempId,
          relation: "finish_to_start",
        },
        rationale: "The final critical-path task should complete before the new finish milestone.",
        sortOrder: operations.length,
      });
    }

    if (operations.length === 0) {
      return {
        type: "failure" as const,
        message: "The current critical path already ends in a milestone with explicit dependencies, so there was nothing safe to stage automatically.",
      };
    }

    const { baseSnapshot, proposedSnapshot } = buildProposalArtifacts(snapshot, operations, generatedAt);
    return {
      type: "proposal" as const,
      proposal: {
        title: "Critical path proposal",
        summary: "Add milestones and dependencies for the current critical path",
        assistantMessage:
          analysis.mode === "graph"
            ? "AI 2 inspected the dependency graph and staged a reviewable critical-path milestone update."
            : "AI 2 inferred the likely critical path from dated work, then staged dependencies and a finish milestone for review.",
        baseSnapshot,
        proposedSnapshot,
        operations,
      },
    };
  }

  async function createAi2BranchFromChat(input: {
    tenantId: string;
    projectId: string;
    planId: string;
    actorUserId: string;
    message: string;
    answer?: string;
    conversationId?: string;
    onEvent?: (event: Record<string, unknown>) => void;
    log?: FastifyBaseLogger;
    reqId: string;
    debugTrace?: Ai2DebugTraceCollector | null;
  }): Promise<Timeline2Branch | null> {
    const log = input.log ?? fastify.log;
    const reqId = input.reqId;
    const debugTrace = input.debugTrace ?? null;
    const streamRoute = TIMELINE2_AI2_STREAM_ROUTE;
    const effectiveMessage = input.answer
      ? `${input.message}\n\nUser answered your question: ${input.answer}`
      : input.message;

    const snapshot = await buildSnapshot(input.tenantId, input.projectId, false);
    const context = buildAiContext(snapshot);
    const deterministicFallback = buildProposalFromMessage(effectiveMessage, snapshot);
    const criticalPathProposal = buildCriticalPathProposal(effectiveMessage, snapshot);

    const convId =
      input.conversationId ?? (await createAi2Conversation(input.tenantId, input.projectId));

    const emit = (event: Record<string, unknown>) => {
      const payload = {
        reqId,
        route: streamRoute,
        projectId: input.projectId,
        conversationId: convId,
        ...event,
      };
      if (debugTrace) {
        debugTrace.sseEvents.push({ ...payload, _recordedAt: new Date().toISOString() });
      }
      input.onEvent?.(payload);
    };
    const emitTool = (toolName: string, summary: string, type: "tool_start" | "tool_done") => {
      emit({ type, toolName, summary });
    };

    emit({ type: "conversation_started", conversationId: convId });
    const history = await loadAi2History(input.tenantId, convId, 10);
    if (debugTrace) {
      debugTrace.conversationId = convId;
      debugTrace.fullConversationHistory = history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
    }
    await appendAi2Message(input.tenantId, convId, "user", effectiveMessage);

    const todayIso = new Date().toISOString().slice(0, 10);

    const finishWithBranch = async (proposal: {
      title: string;
      summary: string;
      assistantMessage: string;
      operations: BranchDraftOperation[];
    }): Promise<Timeline2Branch> => {
      if (debugTrace) {
        debugTrace.stagedOperationsCount = proposal.operations.length;
      }
      try {
        const branch = await persistAiBranch({
          queryTenant: fastify.db.queryTenant.bind(fastify.db),
          loadBranchesForProject: loadBranches,
          tenantId: input.tenantId,
          projectId: input.projectId,
          planId: input.planId,
          actorUserId: input.actorUserId,
          message: input.message,
          context,
          snapshot,
          proposal,
          observability: {
            reqId,
            log,
            route: streamRoute,
            conversationId: convId,
          },
        });
        if (debugTrace) {
          debugTrace.branchId = branch.id;
        }
        await appendAi2Message(input.tenantId, convId, "assistant", proposal.assistantMessage);
        emit({ type: "done", message: "Timeline 2 AI 2 proposal created.", conversationId: convId });
        return branch;
      } catch (err) {
        throw new Timeline2Ai2Error("persistence_failure", { cause: err });
      }
    };

    if (criticalPathProposal?.type === "proposal") {
      emit({
        type: "trace",
        trace: "AI 2 recognized a critical-path request and used the deterministic planner instead of the legacy chat pipeline.",
      });
      emit({
        type: "analysis_summary",
        summary: criticalPathProposal.proposal.assistantMessage,
      });
      return await finishWithBranch(criticalPathProposal.proposal);
    }

    if (criticalPathProposal?.type === "failure") {
      log.warn(
        {
          reqId,
          route: streamRoute,
          projectId: input.projectId,
          conversationId: convId,
          internalDetail: criticalPathProposal.message,
          msg: "ai2-planning-domain-critical-path",
        },
        "AI 2 critical path planner could not proceed",
      );
      throw new Timeline2Ai2Error("planning_domain_failure");
    }

    let modelConfig: Timeline2ModelConfig;
    try {
      modelConfig = configuredTimeline2ModelConfig();
    } catch (error) {
      if (deterministicFallback) {
        log.warn(
          {
            reqId,
            route: streamRoute,
            ...timeline2ProviderLogMeta(),
            err: error,
            hasFallback: true,
            msg: "ai2-provider-unavailable-using-fallback",
          },
          "Timeline 2 AI 2 provider unavailable; using deterministic fallback",
        );
        if (debugTrace) {
          debugTrace.fallbackUsed = true;
          debugTrace.fallbackReason = "config_provider_failure";
        }
        emit({
          type: "trace",
          trace: "AI 2 could not reach the configured model, so it used the deterministic structured fallback for this request.",
        });
        emit({
          type: "analysis_summary",
          summary: "AI 2 used the deterministic fallback because the configured model was unavailable.",
        });
        return await finishWithBranch({
          title: deterministicFallback.title,
          summary: deterministicFallback.summary,
          assistantMessage:
            "AI 2 translated the structured request into a reviewable Timeline 2 branch using deterministic planning because the configured model was unavailable.",
          operations: deterministicFallback.operations,
        });
      }
      throw new Timeline2Ai2Error("config_provider_failure", { cause: error });
    }

    const workingState = cloneWorkingState(snapshot);
    const stagedOperations: BranchDraftOperation[] = [];
    const toolHistory: Array<{ trace: string; toolName: string; result: unknown }> = [];
    const refMap = new Map<string, string>();
    const maxSteps = 8;
    const planningDeadline = Date.now() + 90_000;

    log.info({
      reqId,
      route: streamRoute,
      ...timeline2ProviderLogMeta(modelConfig),
      projectId: input.projectId,
      conversationId: convId,
      messageLength: input.message.length,
      hasFallback: Boolean(deterministicFallback),
      msg: "ai2-planner-start",
    });

    const stageOperation = (operation: BranchDraftOperation) => {
      stagedOperations.push(operation);
      applyWorkingOperation(workingState, operation, new Date().toISOString());
      return operation;
    };

    const historyBlock =
      history.length > 0
        ? `Conversation so far:\n${history.map((entry) => `${entry.role}: ${entry.content}`).join("\n")}`
        : null;
    const emitDeterministicClarifyingQuestion = async (question: string, context: string, trace: string) => {
      emit({ type: "trace", trace });
      const assistantText = context ? `${question}\n\n${context}` : question;
      await appendAi2Message(input.tenantId, convId, "assistant", assistantText);
      emit({
        type: "question",
        question,
        questionContext: context || undefined,
      });
      emit({ type: "done", message: "Awaiting your answer.", conversationId: convId });
      return null;
    };

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      if (Date.now() > planningDeadline) {
        emit({
          type: "trace",
          trace: "AI 2 hit the 90-second planning budget before it could finish staging a safe branch.",
        });
        throw new Timeline2Ai2Error("planning_domain_failure", {
          userMessage: "Timeline 2 AI hit its 90-second planning budget. Please retry with a narrower request.",
        });
      }
      const planOverview = buildPlanOverview(workingState, stagedOperations.length);
      let plannerStep: z.infer<typeof Ai2PlannerStepSchema>;
      try {
        const modelRequestStarted = Date.now();
        log.info({
          reqId,
          route: streamRoute,
          projectId: input.projectId,
          conversationId: convId,
          stepIndex,
          ...timeline2ProviderLogMeta(modelConfig),
          plannerKind: "generateObject",
          msg: "ai2-model-request",
        });
        const result = await generateObject({
          model: createModel(modelConfig),
          schema: Ai2PlannerStepSchema,
          system: [
            "You are Timeline 2 AI 2, a structured planning agent.",
            "Operate only inside the current Timeline 2 plan. Never create a new workspace project row.",
            "Fetch information through tools before staging non-obvious changes.",
            "When the user names a task or group by title, prefer search_nodes first unless nodeId is already listed in PLAN GROUPS or returned by a prior tool. Never invent UUIDs for get_node_subtree.",
            "If the request mentions description, sub-task, or implementing from notes, inspect the relevant node with get_node_subtree before staging changes.",
            "Treat descriptions as notes by default. A description that starts with 'Created from AI request:' is a replay hint, not executable intent on its own.",
            "Use tool_call to inspect or stage work.",
            "Use finalize_branch only after at least one operation is staged.",
            "Before finalize_branch, verify that every major requested action has been satisfied or explicitly deferred with a clarifying question.",
            "Use ask_clarifying_question when the request is ambiguous and a safe branch would require user input.",
            "Use fail_with_reason only when the request cannot be satisfied from the current plan.",
            "Prefer deterministic analysis: when the user mentions the critical path, inspect dependencies and run analyze_critical_path before staging changes.",
            "If the user asks to delete a node, use stage_delete_node after inspection. Do not treat cancelled status as a substitute for deletion.",
            "If the user asks you to implement from a description and also delete the source nodes, ask a clarifying question unless the target location for the recreated work is explicit.",
            "Keep trace short and concrete.",
          ].join("\n"),
          prompt: [
            `Current date: ${todayIso}`,
            `User request: ${effectiveMessage.replace(/\s+/g, " ").trim()}`,
            historyBlock,
            `Current plan overview:\n${planOverview}`,
            `Recent tool history:\n${buildAgentHistorySnippet(toolHistory)}`,
            "Available tool names: get_plan_overview, search_nodes, get_node_subtree, get_dependency_graph, analyze_critical_path, get_at_risk_tasks, get_team_workload, stage_create_node, stage_update_node, stage_move_node, stage_set_assignees, stage_set_dependency, stage_remove_dependency, stage_delete_node.",
            "When you need to stage multiple changes, do them across multiple tool_call turns, then finalize_branch.",
          ]
            .filter((segment): segment is string => Boolean(segment))
            .join("\n\n"),
          abortSignal: AbortSignal.timeout(45_000),
          ...getStructuredOutputOptions(modelConfig),
        });
        plannerStep = result.object;
        log.info({
          reqId,
          route: streamRoute,
          projectId: input.projectId,
          conversationId: convId,
          stepIndex,
          durationMs: Date.now() - modelRequestStarted,
          plannerKind: plannerStep.kind,
          toolName: plannerStep.kind === "tool_call" ? plannerStep.toolName : undefined,
          msg: "ai2-model-response-ok",
        });
        if (debugTrace) {
          debugTrace.plannerSteps.push({
            stepIndex,
            kind: plannerStep.kind,
            toolName: plannerStep.kind === "tool_call" ? plannerStep.toolName : undefined,
          });
        }
      } catch (err: unknown) {
        const { rawOutput, finishReason, causeMessage, invalidParsedValuePreview } =
          extractAi2GenerateObjectFailureDetails(err);
        const errorCategory = NoObjectGeneratedError.isInstance(err)
          ? ("structured_output_failure" as const)
          : ("config_provider_failure" as const);

        log.warn({
          reqId,
          route: streamRoute,
          ...timeline2ProviderLogMeta(modelConfig),
          projectId: input.projectId,
          conversationId: convId,
          stepIndex,
          errorCategory,
          errorMessage: err instanceof Error ? err.message : String(err),
          userFacingMessage: TIMELINE2_AI2_ERROR_USER_MESSAGES[errorCategory],
          finishReason: finishReason ?? null,
          causeMessage: causeMessage?.slice(0, 500) ?? null,
          invalidParsedValuePreview: invalidParsedValuePreview ?? null,
          rawOutputLength: rawOutput?.length ?? 0,
          rawOutputPreview: rawOutput?.slice(0, 500) ?? null,
          rawOutputSuffix:
            rawOutput && rawOutput.length > 500 ? rawOutput.slice(Math.max(0, rawOutput.length - 200)) : null,
          hasStagedOps: stagedOperations.length > 0,
          hasDeterministicFallback: Boolean(deterministicFallback),
          msg: "ai2-generateObject-failed",
        });

        if (stagedOperations.length === 0 && deterministicFallback) {
          if (debugTrace) {
            debugTrace.fallbackUsed = true;
            debugTrace.fallbackReason = errorCategory;
          }
          emit({
            type: "trace",
            trace: "AI 2 could not produce a valid structured planning step, so it used the deterministic fallback for this request.",
          });
          emit({
            type: "analysis_summary",
            summary: "AI 2 used the deterministic fallback because the structured planner failed.",
          });
          return await finishWithBranch({
            title: deterministicFallback.title,
            summary: deterministicFallback.summary,
            assistantMessage:
              "AI 2 translated the structured request into a reviewable Timeline 2 branch after the structured planner failed.",
            operations: deterministicFallback.operations,
          });
        }
        if (stagedOperations.length === 0 && !deterministicFallback) {
          emit({
            type: "error",
            message: TIMELINE2_AI2_ERROR_USER_MESSAGES.fallback_refusal,
            errorCategory: "fallback_refusal",
          });
          emit({
            type: "done",
            message: "Timeline 2 AI 2 stopped after a planner error.",
            conversationId: convId,
          });
          return null;
        }
        throw NoObjectGeneratedError.isInstance(err)
          ? new Timeline2Ai2Error("structured_output_failure", { cause: err })
          : new Timeline2Ai2Error("config_provider_failure", { cause: err });
      }

      emit({ type: "trace", trace: plannerStep.trace });

      if (plannerStep.kind === "ask_clarifying_question") {
        const assistantText = plannerStep.context
          ? `${plannerStep.question}\n\n${plannerStep.context}`
          : plannerStep.question;
        await appendAi2Message(input.tenantId, convId, "assistant", assistantText);
        emit({
          type: "question",
          question: plannerStep.question,
          questionContext: plannerStep.context ?? undefined,
        });
        emit({ type: "done", message: "Awaiting your answer.", conversationId: convId });
        return null;
      }

      if (plannerStep.kind === "fail_with_reason") {
        emit({
          type: "analysis_summary",
          summary: plannerStep.message,
        });
        emitTool("fail_with_reason", plannerStep.reason, "tool_done");
        throw new Timeline2Ai2Error("planning_domain_failure", { userMessage: plannerStep.message });
      }

      if (plannerStep.kind === "finalize_branch") {
        const requiredClarification = shouldClarifyMixedReplayIntent({
          message: effectiveMessage,
          toolHistory,
          stagedOperations,
        });
        if (requiredClarification) {
          return await emitDeterministicClarifyingQuestion(
            requiredClarification.question,
            requiredClarification.context,
            "Clarify whether to recreate the replay hint before deleting the source nodes",
          );
        }
        if (stagedOperations.length === 0) {
          throw new Timeline2Ai2Error("planning_domain_failure", {
            userMessage: "Timeline 2 AI 2 cannot finalize an empty branch.",
          });
        }
        emit({
          type: "analysis_summary",
          summary: plannerStep.finalSummary,
        });
        emitTool("finalize_branch", `Staged ${stagedOperations.length} operations.`, "tool_done");
        return await finishWithBranch({
          title: plannerStep.title,
          summary: plannerStep.summary,
          assistantMessage: plannerStep.finalSummary,
          operations: stagedOperations,
        });
      }

      emitTool(plannerStep.toolName, plannerStep.trace, "tool_start");

      let toolResult: unknown;
      try {
        switch (plannerStep.toolName) {
        case "get_plan_overview": {
          toolResult = buildPlanOverview(workingState, stagedOperations.length);
          break;
        }
        case "search_nodes": {
          toolResult = searchWorkingNodes(workingState, plannerStep.arguments);
          break;
        }
        case "get_node_subtree": {
          toolResult = buildNodeSubtree(workingState, plannerStep.arguments);
          break;
        }
        case "get_dependency_graph": {
          toolResult = buildDependencyGraph(workingState, plannerStep.arguments);
          break;
        }
        case "analyze_critical_path": {
          toolResult = computeGraphCriticalPath(workingState, plannerStep.arguments.rootNodeId ?? null);
          break;
        }
        case "get_at_risk_tasks": {
          toolResult = formatAtRiskTasksOverview(workingState, todayIso);
          break;
        }
        case "get_team_workload": {
          toolResult = formatTeamWorkloadOverview(
            workingState,
            todayIso,
            plannerStep.arguments.windowDays ?? 14,
          );
          break;
        }
        case "stage_create_node": {
          const args = plannerStep.arguments;
          const parentId = resolveReferenceId(args.parentId ?? null, refMap);
          validateWorkingParentChoice(workingState, null, parentId);
          if ((args.assigneeUserIds ?? []).some((userId) => !workingState.teamMembers.some((member) => member.userId === userId))) {
            throw new Error("Assignees must be members of this project.");
          }
          const refKey = normalizeAiReference(args.ref ?? args.title);
          const clientTempId = `proposal-${randomUUID()}`;
          refMap.set(refKey, clientTempId);
          const siblings = workingState.nodes.filter((node) => node.parentId === parentId);
          stageOperation({
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              clientTempId,
              parentId,
              kind: args.kind,
              title: args.title,
              description: args.description ?? null,
              status: args.status,
              priority: args.priority,
              startDate: args.startDate ?? null,
              dueDate: args.dueDate ?? null,
              sortOrder: args.sortOrder ?? siblings.length,
              actionRequired: {
                required: Boolean(args.actionRequiredNote),
                note: args.actionRequiredNote ?? null,
              },
              assigneeUserIds: args.assigneeUserIds ?? [],
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { ref: refKey, nodeId: clientTempId, parentId };
          break;
        }
        case "stage_update_node": {
          const args = plannerStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for update.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for update.");
          const patch: Record<string, unknown> = {};
          if (args.title !== undefined) patch.title = args.title;
          if (args.description !== undefined) patch.description = args.description;
          if (args.status !== undefined) patch.status = args.status;
          if (args.priority !== undefined) patch.priority = args.priority;
          if (args.startDate !== undefined) patch.startDate = args.startDate;
          if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
          if (args.actionRequiredNote !== undefined) {
            patch.actionRequired = {
              required: Boolean(args.actionRequiredNote),
              note: args.actionRequiredNote ?? null,
            };
          }
          stageOperation({
            operationType: "update_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: patch,
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, updatedFields: Object.keys(patch) };
          break;
        }
        case "stage_move_node": {
          const args = plannerStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for move.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for move.");
          const parentId = resolveReferenceId(args.parentId, refMap);
          validateWorkingParentChoice(workingState, nodeId, parentId);
          stageOperation({
            operationType: "move_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: {
              parentId,
              ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, parentId, sortOrder: args.sortOrder ?? null };
          break;
        }
        case "stage_set_assignees": {
          const args = plannerStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for assignee update.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for assignee update.");
          if (args.assigneeUserIds.some((userId) => !workingState.teamMembers.some((member) => member.userId === userId))) {
            throw new Error("Assignees must be members of this project.");
          }
          stageOperation({
            operationType: "set_assignees",
            targetNodeId: nodeId,
            dependencyId: null,
            before: { assigneeUserIds: existing.assignees.map((assignee) => assignee.userId) },
            after: { assigneeUserIds: args.assigneeUserIds },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, assigneeUserIds: args.assigneeUserIds };
          break;
        }
        case "stage_set_dependency": {
          const args = plannerStep.arguments;
          const fromNodeId = resolveReferenceId(args.fromNodeId, refMap);
          const toNodeId = resolveReferenceId(args.toNodeId, refMap);
          if (!fromNodeId || !toNodeId) throw new Error("Dependency nodes must both exist in this Timeline 2 plan.");
          validateWorkingDependencyChoice(workingState, fromNodeId, toNodeId);
          const existing = findDependency(workingState, { fromNodeId, toNodeId });
          stageOperation({
            operationType: "set_dependency",
            targetNodeId: null,
            dependencyId: existing?.id ?? null,
            before: existing ? { ...existing } : null,
            after: {
              fromNodeId,
              toNodeId,
              relation: args.relation,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { fromNodeId, toNodeId, relation: args.relation, updated: Boolean(existing) };
          break;
        }
        case "stage_remove_dependency": {
          const args = plannerStep.arguments;
          const dependencyId = args.dependencyId ?? null;
          const fromNodeId = resolveReferenceId(args.fromNodeId ?? null, refMap);
          const toNodeId = resolveReferenceId(args.toNodeId ?? null, refMap);
          const existing = findDependency(workingState, {
            dependencyId,
            fromNodeId,
            toNodeId,
          });
          if (!existing) throw new Error("Dependency not found for removal.");
          stageOperation({
            operationType: "remove_dependency",
            targetNodeId: null,
            dependencyId: existing.id,
            before: { ...existing },
            after: {
              fromNodeId: existing.fromNodeId,
              toNodeId: existing.toNodeId,
              relation: existing.relation,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { dependencyId: existing.id };
          break;
        }
        case "stage_delete_node": {
          const args = plannerStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for deletion.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for deletion.");
          const descendantIds = collectDescendantIds(workingState, nodeId);
          if (!args.includeDescendants && descendantIds.size > 0) {
            throw new Error("This node has descendants, so includeDescendants must be true for staged deletion.");
          }
          stageOperation({
            operationType: "delete_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: {
              includeDescendants: args.includeDescendants ?? true,
              descendantCount: descendantIds.size,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = {
            nodeId,
            deletedTitle: existing.title,
            includeDescendants: args.includeDescendants ?? true,
            descendantCount: descendantIds.size,
          };
          break;
        }
      }
      } catch (toolErr: unknown) {
        const message = toolErr instanceof Error ? toolErr.message : String(toolErr);
        log.warn(
          {
            reqId,
            route: streamRoute,
            projectId: input.projectId,
            conversationId: convId,
            stepIndex,
            toolName: plannerStep.toolName,
            err: toolErr,
            msg: "ai2-tool-threw",
          },
          "Timeline 2 AI 2 tool execution failed (returning error to planner)",
        );
        toolResult = { ok: false, error: message };
      }

      emitTool(plannerStep.toolName, typeof toolResult === "string" ? toolResult : safeJson(toolResult), "tool_done");
      toolHistory.push({ trace: plannerStep.trace, toolName: plannerStep.toolName, result: toolResult });
      if (plannerStep.toolName === "get_node_subtree" && stagedOperations.length === 0) {
        const requiredClarification = shouldClarifyMixedReplayIntent({
          message: effectiveMessage,
          toolHistory,
          stagedOperations,
        });
        if (requiredClarification) {
          return await emitDeterministicClarifyingQuestion(
            requiredClarification.question,
            requiredClarification.context,
            "Clarify whether to recreate the replay hint before deleting the source nodes",
          );
        }
      }
    }

    throw new Timeline2Ai2Error("unknown_failure", {
      cause: new Error("Timeline 2 AI 2 reached its planning step limit before finalizing a branch."),
    });
  }

  async function createLegacyBranchFromChat(input: {
    tenantId: string;
    projectId: string;
    planId: string;
    actorUserId: string;
    message: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }): Promise<Timeline2Branch> {
    const snapshot = await buildSnapshot(input.tenantId, input.projectId, false);
    const context = buildAiContext(snapshot);
    const deterministicFallback = buildProposalFromMessage(input.message, snapshot);

    const emit = (event: Record<string, unknown>) => {
      input.onEvent?.(event);
    };
    const emitTool = (toolName: string, summary: string, type: "tool_start" | "tool_done") => {
      emit({ type, toolName, summary });
    };

    let llmProvider: ReturnType<typeof createLlmProvider> | null = null;
    try {
      llmProvider = configuredTimeline2Provider();
    } catch (error) {
      if (deterministicFallback) {
        fastify.log.warn({ ...timeline2ProviderLogMeta(), err: error, projectId: input.projectId }, "Timeline 2 legacy AI provider unavailable; using deterministic fallback");
        emit({
          type: "trace",
          trace: "Timeline 2 AI provider is unavailable, so I used the deterministic planning fallback for this structured creation request.",
        });
        emit({
          type: "analysis_summary",
          summary: "Used the deterministic fallback to create a reviewable branch from the structured request.",
        });
        return persistAiBranch({
          queryTenant: fastify.db.queryTenant.bind(fastify.db),
          loadBranchesForProject: loadBranches,
          tenantId: input.tenantId,
          projectId: input.projectId,
          planId: input.planId,
          actorUserId: input.actorUserId,
          message: input.message,
          context,
          snapshot,
          proposal: {
            title: deterministicFallback.title,
            summary: deterministicFallback.summary,
            assistantMessage:
              "I translated the structured request into a reviewable Timeline 2 branch using deterministic planning because the configured AI provider was unavailable.",
            operations: deterministicFallback.operations,
          },
        });
      }
      throw error;
    }

    const workingState = cloneWorkingState(snapshot);
    const stagedOperations: BranchDraftOperation[] = [];
    const toolHistory: Array<{ trace: string; toolName: string; result: unknown }> = [];
    const refMap = new Map<string, string>();
    const maxSteps = 8;
    const planningDeadline = Date.now() + 90_000;

    const stageOperation = (operation: BranchDraftOperation) => {
      stagedOperations.push(operation);
      applyWorkingOperation(workingState, operation, new Date().toISOString());
      return operation;
    };

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      if (Date.now() > planningDeadline) {
        emit({
          type: "trace",
          trace: "AI 2 hit the 90-second planning budget before it could finish staging a safe branch.",
        });
        throw new Timeline2Ai2Error("planning_domain_failure", {
          userMessage: "Timeline 2 AI hit its 90-second planning budget. Please retry with a narrower request.",
        });
      }
      const planOverview = buildPlanOverview(workingState, stagedOperations.length);
      const agentInstructions = [
        "You are the Timeline 2 planning agent for one current project plan.",
        "Operate only inside the current Timeline 2 plan. Never create a new workspace project row.",
        "Investigate with tools before staging non-obvious changes.",
        "When the user names a task or group by title, prefer search_nodes first unless nodeId is already listed in PLAN GROUPS or returned by a prior tool. Never invent UUIDs for get_node_subtree.",
        "If the request mentions description, sub-task, or implementing from notes, inspect the relevant node with get_node_subtree before staging changes.",
        "Treat descriptions as notes by default. A description that starts with 'Created from AI request:' is a replay hint, not executable intent on its own.",
        "Allowed tool names: get_plan_overview, search_nodes, get_node_subtree, get_dependency_graph, analyze_critical_path, stage_create_node, stage_update_node, stage_move_node, stage_set_assignees, stage_set_dependency, stage_remove_dependency, stage_delete_node, finalize_branch, fail.",
        "If the user asks to delete a node, use stage_delete_node after inspection. Do not treat cancelled status as a substitute for deletion.",
        "Before finalize_branch, verify that every major requested action has been satisfied or explicitly deferred with a clarifying question.",
        "If the user asks you to implement from a description and also delete the source nodes, ask a clarifying question unless the target location for the recreated work is explicit.",
        "Return exactly one JSON object and nothing else.",
        "Prefer deterministic analysis: when critical path is requested, inspect dependencies and run analyze_critical_path.",
        "If the request is blocked by insufficient data, use fail with a precise explanation instead of inventing a generic task.",
        `Current date: ${new Date().toISOString().slice(0, 10)}`,
        `User request: ${input.message.replace(/\s+/g, " ").trim()}`,
        `Current plan overview:\n${planOverview}`,
        `Recent tool history:\n${buildAgentHistorySnippet(toolHistory)}`,
        "Response JSON shape:",
        safeJson({
          trace: "Loaded 84 nodes and found no dependencies, so I am checking the likely critical path.",
          toolName: "get_plan_overview",
          arguments: {},
        }),
      ].join("\n\n");

      const raw = await llmProvider.generateResponse({
        message: agentInstructions,
        projectContext: {
          totalTasks: context.nodes.length,
          completed: context.nodes.filter((node) => node.status === "completed").length,
          blocked: context.nodes.filter((node) => node.status === "blocked").length,
          highRisk: context.nodes.filter(
            (node) => node.priority === "critical" || node.actionRequired.required,
          ).length,
          completionRate:
            context.nodes.length === 0
              ? 0
              : Math.round(
                  (context.nodes.filter((node) => node.status === "completed").length /
                    context.nodes.length) *
                    100,
                ) / 100,
        },
      });

      const parsed = AgentStepSchema.safeParse(extractFirstJsonObject(raw));
      if (!parsed.success) {
        if (stagedOperations.length === 0 && deterministicFallback) {
          fastify.log.warn(
            {
              ...timeline2ProviderLogMeta(),
              projectId: input.projectId,
              rawPreview: raw.slice(0, 600),
              issues: parsed.error.issues.map((issue) => issue.message),
            },
            "Timeline 2 legacy AI returned an invalid planning step; using deterministic fallback",
          );
          emit({
            type: "trace",
            trace: "The AI response was invalid, so I used the deterministic fallback for this structured creation request.",
          });
          emit({
            type: "analysis_summary",
            summary: "Used the deterministic fallback because the model did not return a valid planning step.",
          });
          return persistAiBranch({
            queryTenant: fastify.db.queryTenant.bind(fastify.db),
            loadBranchesForProject: loadBranches,
            tenantId: input.tenantId,
            projectId: input.projectId,
            planId: input.planId,
            actorUserId: input.actorUserId,
            message: input.message,
            context,
            snapshot,
            proposal: {
              title: deterministicFallback.title,
              summary: deterministicFallback.summary,
              assistantMessage:
                "I translated the structured request into a reviewable Timeline 2 branch after the AI returned an invalid planning step.",
              operations: deterministicFallback.operations,
            },
          });
        }
        fastify.log.warn(
          {
            ...timeline2ProviderLogMeta(),
            projectId: input.projectId,
            rawPreview: raw.slice(0, 600),
            issues: parsed.error.issues.map((issue) => issue.message),
          },
          "Timeline 2 legacy AI returned an invalid planning step",
        );
        throw new Error("Timeline 2 AI could not produce a valid planning step.");
      }

      const agentStep = parsed.data;
      emit({ type: "trace", trace: agentStep.trace });
      emitTool(agentStep.toolName, agentStep.trace, "tool_start");

      let toolResult: unknown;
      switch (agentStep.toolName) {
        case "get_plan_overview": {
          toolResult = buildPlanOverview(workingState, stagedOperations.length);
          break;
        }
        case "search_nodes": {
          toolResult = searchWorkingNodes(workingState, agentStep.arguments);
          break;
        }
        case "get_node_subtree": {
          toolResult = buildNodeSubtree(workingState, agentStep.arguments);
          break;
        }
        case "get_dependency_graph": {
          toolResult = buildDependencyGraph(workingState, agentStep.arguments);
          break;
        }
        case "analyze_critical_path": {
          toolResult = computeGraphCriticalPath(workingState, agentStep.arguments.rootNodeId ?? null);
          break;
        }
        case "stage_create_node": {
          const args = agentStep.arguments;
          const parentId = resolveReferenceId(args.parentId ?? null, refMap);
          validateWorkingParentChoice(workingState, null, parentId);
          if ((args.assigneeUserIds ?? []).some((userId) => !workingState.teamMembers.some((member) => member.userId === userId))) {
            throw new Error("Assignees must be members of this project.");
          }
          const refKey = normalizeAiReference(args.ref ?? args.title);
          const clientTempId = `proposal-${randomUUID()}`;
          refMap.set(refKey, clientTempId);
          const siblings = workingState.nodes.filter((node) => node.parentId === parentId);
          stageOperation({
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              clientTempId,
              parentId,
              kind: args.kind,
              title: args.title,
              description: args.description ?? null,
              status: args.status,
              priority: args.priority,
              startDate: args.startDate ?? null,
              dueDate: args.dueDate ?? null,
              sortOrder: args.sortOrder ?? siblings.length,
              actionRequired: {
                required: Boolean(args.actionRequiredNote),
                note: args.actionRequiredNote ?? null,
              },
              assigneeUserIds: args.assigneeUserIds ?? [],
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { ref: refKey, nodeId: clientTempId, parentId };
          break;
        }
        case "stage_update_node": {
          const args = agentStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for update.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for update.");
          const patch: Record<string, unknown> = {};
          if (args.title !== undefined) patch.title = args.title;
          if (args.description !== undefined) patch.description = args.description;
          if (args.status !== undefined) patch.status = args.status;
          if (args.priority !== undefined) patch.priority = args.priority;
          if (args.startDate !== undefined) patch.startDate = args.startDate;
          if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
          if (args.actionRequiredNote !== undefined) {
            patch.actionRequired = {
              required: Boolean(args.actionRequiredNote),
              note: args.actionRequiredNote ?? null,
            };
          }
          stageOperation({
            operationType: "update_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: patch,
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, updatedFields: Object.keys(patch) };
          break;
        }
        case "stage_move_node": {
          const args = agentStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for move.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for move.");
          const parentId = resolveReferenceId(args.parentId, refMap);
          validateWorkingParentChoice(workingState, nodeId, parentId);
          stageOperation({
            operationType: "move_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: {
              parentId,
              ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, parentId, sortOrder: args.sortOrder ?? null };
          break;
        }
        case "stage_set_assignees": {
          const args = agentStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for assignee update.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for assignee update.");
          if (args.assigneeUserIds.some((userId) => !workingState.teamMembers.some((member) => member.userId === userId))) {
            throw new Error("Assignees must be members of this project.");
          }
          stageOperation({
            operationType: "set_assignees",
            targetNodeId: nodeId,
            dependencyId: null,
            before: { assigneeUserIds: existing.assignees.map((assignee) => assignee.userId) },
            after: { assigneeUserIds: args.assigneeUserIds },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { nodeId, assigneeUserIds: args.assigneeUserIds };
          break;
        }
        case "stage_set_dependency": {
          const args = agentStep.arguments;
          const fromNodeId = resolveReferenceId(args.fromNodeId, refMap);
          const toNodeId = resolveReferenceId(args.toNodeId, refMap);
          if (!fromNodeId || !toNodeId) throw new Error("Dependency nodes must both exist in this Timeline 2 plan.");
          validateWorkingDependencyChoice(workingState, fromNodeId, toNodeId);
          const existing = findDependency(workingState, { fromNodeId, toNodeId });
          stageOperation({
            operationType: "set_dependency",
            targetNodeId: null,
            dependencyId: existing?.id ?? null,
            before: existing ? { ...existing } : null,
            after: {
              fromNodeId,
              toNodeId,
              relation: args.relation,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { fromNodeId, toNodeId, relation: args.relation, updated: Boolean(existing) };
          break;
        }
        case "stage_remove_dependency": {
          const args = agentStep.arguments;
          const dependencyId = args.dependencyId ?? null;
          const fromNodeId = resolveReferenceId(args.fromNodeId ?? null, refMap);
          const toNodeId = resolveReferenceId(args.toNodeId ?? null, refMap);
          const existing = findDependency(workingState, {
            dependencyId,
            fromNodeId,
            toNodeId,
          });
          if (!existing) throw new Error("Dependency not found for removal.");
          stageOperation({
            operationType: "remove_dependency",
            targetNodeId: null,
            dependencyId: existing.id,
            before: { ...existing },
            after: {
              fromNodeId: existing.fromNodeId,
              toNodeId: existing.toNodeId,
              relation: existing.relation,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = { dependencyId: existing.id };
          break;
        }
        case "stage_delete_node": {
          const args = agentStep.arguments;
          const nodeId = resolveReferenceId(args.nodeId, refMap);
          if (!nodeId) throw new Error("Node not found for deletion.");
          const existing = workingNodeById(workingState, nodeId);
          if (!existing) throw new Error("Node not found for deletion.");
          const descendantIds = collectDescendantIds(workingState, nodeId);
          if (!args.includeDescendants && descendantIds.size > 0) {
            throw new Error("This node has descendants, so includeDescendants must be true for staged deletion.");
          }
          stageOperation({
            operationType: "delete_node",
            targetNodeId: nodeId,
            dependencyId: null,
            before: compactNode({ ...existing, children: [] }),
            after: {
              includeDescendants: args.includeDescendants ?? true,
              descendantCount: descendantIds.size,
            },
            rationale: args.rationale,
            sortOrder: stagedOperations.length,
          });
          toolResult = {
            nodeId,
            deletedTitle: existing.title,
            includeDescendants: args.includeDescendants ?? true,
            descendantCount: descendantIds.size,
          };
          break;
        }
        case "finalize_branch": {
          if (stagedOperations.length === 0) {
            throw new Error("Timeline 2 AI cannot finalize an empty branch.");
          }
          emit({
            type: "analysis_summary",
            summary: agentStep.arguments.finalSummary,
          });
          emitTool(agentStep.toolName, `Staged ${stagedOperations.length} operations.`, "tool_done");
          return persistAiBranch({
            queryTenant: fastify.db.queryTenant.bind(fastify.db),
            loadBranchesForProject: loadBranches,
            tenantId: input.tenantId,
            projectId: input.projectId,
            planId: input.planId,
            actorUserId: input.actorUserId,
            message: input.message,
            context,
            snapshot,
            proposal: {
              title: agentStep.arguments.title,
              summary: agentStep.arguments.summary,
              assistantMessage: agentStep.arguments.finalSummary,
              operations: stagedOperations,
            },
          });
        }
        case "fail": {
          emit({
            type: "analysis_summary",
            summary: agentStep.arguments.message,
          });
          emitTool(agentStep.toolName, agentStep.arguments.reason, "tool_done");
          throw new Error(agentStep.arguments.message);
        }
      }

      emitTool(agentStep.toolName, typeof toolResult === "string" ? toolResult : safeJson(toolResult), "tool_done");
      toolHistory.push({ trace: agentStep.trace, toolName: agentStep.toolName, result: toolResult });
    }

    throw new Error("Timeline 2 AI reached its planning step limit before finalizing a branch.");
  }

  async function applyOperation(input: {
    tenantId: string;
    planId: string;
    actorUserId: string;
    operation: Timeline2Operation;
    tempIdMap: Map<string, string>;
  }) {
    const after = input.operation.after ?? {};
    const resolveNodeId = (value: unknown): string | null => {
      if (typeof value !== "string" || value.length === 0) return null;
      return input.tempIdMap.get(value) ?? value;
    };

    if (input.operation.operationType === "create_node") {
      const parsed = NodeInputSchema.parse({
        parentId: resolveNodeId(after.parentId),
        kind: after.kind,
        title: after.title,
        description: after.description,
        status: after.status,
        priority: after.priority,
        startDate: after.startDate,
        dueDate: after.dueDate,
        sortOrder: after.sortOrder,
        progress: after.progress,
        actionRequired: after.actionRequired,
        assigneeUserIds: after.assigneeUserIds,
      });
      if (parsed.kind === "group" && parsed.progress !== undefined) {
        throw fastify.httpErrors.badRequest("Group progress is derived from child items and cannot be set directly.");
      }
      await validateParent(input.tenantId, input.planId, null, parsed.parentId ?? null);
      const rows = await fastify.db.queryTenant<{ id: string }>(
        input.tenantId,
        `INSERT INTO timeline2_nodes
           (tenant_id, plan_id, parent_node_id, kind, title, description, status,
            priority, start_date, due_date, sort_order, progress, action_required,
            action_required_note, created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
         RETURNING id`,
        [
          input.tenantId,
          input.planId,
          parsed.parentId ?? null,
          parsed.kind,
          parsed.title,
          parsed.description ?? null,
          parsed.status,
          parsed.priority,
          parsed.startDate ?? null,
          parsed.dueDate ?? null,
          parsed.sortOrder ?? 0,
          parsed.progress ?? 0,
          parsed.actionRequired?.required ?? false,
          parsed.actionRequired?.note ?? null,
          input.actorUserId,
        ],
      );
      const createdId = rows[0].id;
      if (typeof after.clientTempId === "string") input.tempIdMap.set(after.clientTempId, createdId);
      await setAssignees(input.tenantId, createdId, parsed.assigneeUserIds ?? [], input.actorUserId);
      return;
    }

    if (input.operation.operationType === "update_node" || input.operation.operationType === "move_node") {
      const nodeId = input.operation.targetNodeId;
      if (!nodeId) throw fastify.httpErrors.badRequest("Operation target node is required.");
      const patch = NodePatchSchema.parse({
        ...after,
        parentId: after.parentId === undefined ? undefined : resolveNodeId(after.parentId),
      });
      await patchNode(input.tenantId, input.planId, nodeId, patch, input.actorUserId, false);
      return;
    }

    if (input.operation.operationType === "delete_node") {
      if (!input.operation.targetNodeId) throw fastify.httpErrors.badRequest("Operation target node is required.");
      await fastify.db.queryTenant(
        input.tenantId,
        `DELETE FROM timeline2_nodes WHERE tenant_id = $1 AND plan_id = $2 AND id = $3`,
        [input.tenantId, input.planId, input.operation.targetNodeId],
      );
      return;
    }

    if (input.operation.operationType === "set_assignees") {
      const nodeId = input.operation.targetNodeId;
      if (!nodeId) throw fastify.httpErrors.badRequest("Operation target node is required.");
      const ids = z.array(UUID).parse(after.assigneeUserIds ?? after.userIds ?? []);
      await setAssignees(input.tenantId, nodeId, ids, input.actorUserId);
      return;
    }

    if (input.operation.operationType === "set_dependency") {
      const fromNodeId = resolveNodeId(after.fromNodeId);
      const toNodeId = resolveNodeId(after.toNodeId);
      if (!fromNodeId || !toNodeId) throw fastify.httpErrors.badRequest("Dependency operation requires node ids.");
      const relation = DependencyRelationSchema.parse(after.relation ?? "finish_to_start");
      const lagDays = z.number().int().min(-3650).max(3650).parse(after.lagDays ?? 0);
      await validateDependency(input.tenantId, input.planId, fromNodeId, toNodeId);
      await fastify.db.queryTenant(
        input.tenantId,
        `INSERT INTO timeline2_dependencies
           (tenant_id, plan_id, from_node_id, to_node_id, relation, lag_days, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, plan_id, from_node_id, to_node_id)
         DO UPDATE SET relation = EXCLUDED.relation, lag_days = EXCLUDED.lag_days`,
        [input.tenantId, input.planId, fromNodeId, toNodeId, relation, lagDays, input.actorUserId],
      );
      return;
    }

    if (input.operation.operationType === "remove_dependency") {
      if (!input.operation.dependencyId) throw fastify.httpErrors.badRequest("Dependency operation requires dependency id.");
      await fastify.db.queryTenant(
        input.tenantId,
        `DELETE FROM timeline2_dependencies WHERE tenant_id = $1 AND plan_id = $2 AND id = $3`,
        [input.tenantId, input.planId, input.operation.dependencyId],
      );
    }
  }

  async function patchNode(
    tenantId: string,
    planId: string,
    nodeId: string,
    patch: z.infer<typeof NodePatchSchema>,
    actorUserId: string,
    writeRevision: boolean,
  ) {
    if (patch.progress !== undefined) {
      const nodeRows = await fastify.db.queryTenant<{ kind: Timeline2NodeKind }>(
        tenantId,
        `SELECT kind
           FROM timeline2_nodes
          WHERE tenant_id = $1 AND plan_id = $2 AND id = $3
          LIMIT 1`,
        [tenantId, planId, nodeId],
      );
      const currentNode = nodeRows[0];
      if (!currentNode) throw fastify.httpErrors.notFound("Timeline 2 node not found.");
      const effectiveKind = patch.kind ?? currentNode.kind;
      if (effectiveKind === "group") {
        throw fastify.httpErrors.badRequest("Group progress is derived from child items and cannot be set directly.");
      }
    }
    if (patch.parentId !== undefined) {
      await validateParent(tenantId, planId, nodeId, patch.parentId ?? null);
    }
    if (patch.kind !== undefined) {
      await validateKindChange(tenantId, planId, nodeId, patch.kind);
    }
    const setClauses = ["updated_at = NOW()", "updated_by_user_id = $4"];
    const values: unknown[] = [tenantId, planId, nodeId, actorUserId];
    let idx = 5;
    const addSet = (column: string, value: unknown) => {
      setClauses.push(`${column} = $${idx++}`);
      values.push(value);
    };
    if (patch.parentId !== undefined) addSet("parent_node_id", patch.parentId);
    if (patch.kind !== undefined) addSet("kind", patch.kind);
    if (patch.title !== undefined) addSet("title", patch.title);
    if (patch.description !== undefined) addSet("description", patch.description);
    if (patch.status !== undefined) addSet("status", patch.status);
    if (patch.priority !== undefined) addSet("priority", patch.priority);
    if (patch.startDate !== undefined) addSet("start_date", patch.startDate);
    if (patch.dueDate !== undefined) addSet("due_date", patch.dueDate);
    if (patch.sortOrder !== undefined) addSet("sort_order", patch.sortOrder);
    if (patch.progress !== undefined) addSet("progress", patch.progress);
    if (patch.actionRequired !== undefined) {
      addSet("action_required", patch.actionRequired.required);
      addSet("action_required_note", patch.actionRequired.note ?? null);
    }
    const rows = await fastify.db.queryTenant<{ id: string }>(
      tenantId,
      `UPDATE timeline2_nodes
          SET ${setClauses.join(", ")}
        WHERE tenant_id = $1 AND plan_id = $2 AND id = $3
        RETURNING id`,
      values,
    );
    if (!rows[0]) throw fastify.httpErrors.notFound("Timeline 2 node not found.");
    if (patch.assigneeUserIds !== undefined) {
      await setAssignees(tenantId, nodeId, patch.assigneeUserIds, actorUserId);
    }
    if (writeRevision) await recordRevision(tenantId, planId, actorUserId, "Human updated Timeline 2 node");
  }

  const routeContext = {
    fastify,
    devSampleSeedEnabled,
    parseOrBadRequest,
    ProjectParamSchema,
    NodeParamSchema,
    BranchParamSchema,
    DependencyParamSchema,
    NodeInputSchema,
    NodePatchSchema,
    AssigneesSchema,
    DependencyInputSchema,
    AcceptBranchSchema,
    RejectBranchSchema,
    AiChatSchema,
    Ai2ChatBodySchema,
    assertProjectAccess,
    ensurePlan,
    seedDevPlaceholderPlanIfEmpty,
    buildSnapshot,
    loadTimeline2UserPreferences,
    saveTimeline2UserPreferences,
    buildTimeline2CriticalPath,
    validateParent,
    setAssignees,
    recordRevision,
    loadNodePlan,
    patchNode,
    loadDependencyPlan,
    validateDependency,
    loadBranches,
    applyOperation,
    createLegacyAiBranchFromChat: createLegacyBranchFromChat,
    createPrimaryAi2BranchFromChat: createAi2BranchFromChat,
    configuredTimeline2ModelConfig,
    sanitizeBaseUrl,
    timeline2ProviderLogMeta,
  };

  registerTimeline2ManualRoutes(routeContext);
  registerTimeline2BranchRoutes(routeContext);
  registerTimeline2AiRoutes(routeContext);
};
