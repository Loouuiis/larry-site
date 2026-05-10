import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { z } from "zod";
import type {
  Timeline2Branch,
  Timeline2Operation,
  Timeline2Snapshot,
  Timeline2UserPreferences,
} from "@larry/shared";
import type { Ai2DebugTraceCollector } from "../../../lib/timeline2-ai2-trace.js";
import {
  AcceptBranchSchema,
  Ai2ChatBodySchema,
  AiChatSchema,
  AssigneesSchema,
  BranchDraftOperation,
  BranchParamSchema,
  DependencyInputSchema,
  DependencyParamSchema,
  NodeInputSchema,
  NodeParamSchema,
  NodePatchSchema,
  ProjectParamSchema,
  RejectBranchSchema,
  Timeline2ModelConfig,
} from "./contracts.js";

type PlanRef = { planId: string; projectId: string };

export type Timeline2RouteContext = {
  fastify: FastifyInstance;
  devSampleSeedEnabled: boolean;
  parseOrBadRequest: <T>(schema: z.ZodType<T>, value: unknown) => T;
  ProjectParamSchema: typeof ProjectParamSchema;
  NodeParamSchema: typeof NodeParamSchema;
  BranchParamSchema: typeof BranchParamSchema;
  DependencyParamSchema: typeof DependencyParamSchema;
  NodeInputSchema: typeof NodeInputSchema;
  NodePatchSchema: typeof NodePatchSchema;
  AssigneesSchema: typeof AssigneesSchema;
  DependencyInputSchema: typeof DependencyInputSchema;
  AcceptBranchSchema: typeof AcceptBranchSchema;
  RejectBranchSchema: typeof RejectBranchSchema;
  AiChatSchema: typeof AiChatSchema;
  Ai2ChatBodySchema: typeof Ai2ChatBodySchema;
  assertProjectAccess: (input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
    mode: "read" | "write";
  }) => Promise<unknown>;
  ensurePlan: (
    tenantId: string,
    projectId: string,
    actorUserId: string | null,
  ) => Promise<{ id: string }>;
  seedDevPlaceholderPlanIfEmpty: (
    tenantId: string,
    projectId: string,
    planId: string,
    actorUserId: string | null,
  ) => Promise<boolean>;
  buildSnapshot: (
    tenantId: string,
    projectId: string,
    includeBranches?: boolean,
  ) => Promise<Timeline2Snapshot>;
  loadTimeline2UserPreferences: (
    tenantId: string,
    userId: string,
    projectId: string,
  ) => Promise<Timeline2UserPreferences>;
  saveTimeline2UserPreferences: (
    tenantId: string,
    userId: string,
    projectId: string,
    preferences: Timeline2UserPreferences,
  ) => Promise<Timeline2UserPreferences>;
  buildTimeline2CriticalPath: (
    tenantId: string,
    projectId: string,
  ) => Promise<{
    criticalNodeIds: string[];
    floatDaysByNodeId: Record<string, number | null>;
    projectedEndDate: string;
    warnings: string[];
  }>;
  validateParent: (
    tenantId: string,
    planId: string,
    nodeId: string | null,
    parentId: string | null,
  ) => Promise<void>;
  setAssignees: (
    tenantId: string,
    nodeId: string,
    assigneeUserIds: string[],
    actorUserId: string | null,
  ) => Promise<void>;
  recordRevision: (
    tenantId: string,
    planId: string,
    actorUserId: string | null,
    reason: string,
  ) => Promise<string>;
  loadNodePlan: (tenantId: string, nodeId: string) => Promise<PlanRef | null>;
  patchNode: (
    tenantId: string,
    planId: string,
    nodeId: string,
    patch: z.infer<typeof NodePatchSchema>,
    actorUserId: string,
    writeRevision: boolean,
  ) => Promise<void>;
  loadDependencyPlan: (tenantId: string, dependencyId: string) => Promise<PlanRef | null>;
  validateDependency: (
    tenantId: string,
    planId: string,
    fromNodeId: string,
    toNodeId: string,
  ) => Promise<void>;
  loadBranches: (
    tenantId: string,
    projectId: string,
    status?: "open" | "accepted" | "rejected",
  ) => Promise<Timeline2Branch[]>;
  applyOperation: (input: {
    tenantId: string;
    planId: string;
    actorUserId: string;
    operation: Timeline2Operation;
    tempIdMap: Map<string, string>;
  }) => Promise<void>;
  createLegacyAiBranchFromChat: (input: {
    tenantId: string;
    projectId: string;
    planId: string;
    actorUserId: string;
    message: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }) => Promise<Timeline2Branch | null>;
  createPrimaryAi2BranchFromChat: (input: {
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
  }) => Promise<Timeline2Branch | null>;
  configuredTimeline2ModelConfig: () => { provider: string; model: string };
  sanitizeBaseUrl: (value: string | undefined) => string | null;
  timeline2ProviderLogMeta: (
    modelConfig?: Timeline2ModelConfig | undefined,
  ) => Record<string, unknown>;
};

export type Timeline2BranchDraftProposal = {
  title: string;
  summary: string;
  assistantMessage: string;
  operations: BranchDraftOperation[];
};
