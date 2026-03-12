import { FastifyBaseLogger } from "fastify";

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email?: string;
}

export type Role = "admin" | "pm" | "member" | "executive";

export interface RequestContext {
  tenantId: string;
  user: AuthUser;
  requestId: string;
}

export interface AppServices {
  logger: FastifyBaseLogger;
}

export interface CanonicalEvent {
  id: string;
  tenantId: string;
  source: "slack" | "email" | "calendar" | "transcript";
  sourceEventId: string;
  eventType:
    | "commitment"
    | "blocker"
    | "progress"
    | "decision"
    | "question"
    | "other";
  actor: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  confidence: number;
}

export interface ExtractedAction {
  title: string;
  owner?: string;
  dueDate?: string;
  description?: string;
  confidence: number;
  impact: "low" | "medium" | "high";
  reason: string;
  signals: string[];
}

export interface TaskDeltaProposal {
  taskId?: string;
  operation: "create" | "update";
  changes: Record<string, unknown>;
  reason: string;
  confidence: number;
}

export interface ApprovalDecision {
  actionId: string;
  decision: "approved" | "rejected" | "overridden";
  byUserId: string;
  note?: string;
  decidedAt: string;
}

export type AgentRunState =
  | "INGESTED"
  | "NORMALIZED"
  | "EXTRACTED"
  | "PROPOSED"
  | "APPROVAL_PENDING"
  | "EXECUTED"
  | "VERIFIED"
  | "FAILED";

export interface RiskScoreSnapshot {
  projectId: string;
  taskId?: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  computedAt: string;
  signals: string[];
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  actorUserId: string;
  actionType: string;
  objectType: string;
  objectId: string;
  details: Record<string, unknown>;
  createdAt: string;
}
