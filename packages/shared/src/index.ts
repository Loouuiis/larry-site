export type Role = "admin" | "pm" | "member" | "executive";

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email?: string;
}

export interface RequestContext {
  tenantId: string;
  user: AuthUser;
  requestId: string;
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
  actionType?:
    | "status_update"
    | "task_create"
    | "deadline_change"
    | "owner_change"
    | "scope_change"
    | "risk_escalation"
    | "email_draft"
    | "meeting_invite"
    | "follow_up"
    | "other";
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

export interface ActionReasoning {
  what: string;
  why: string;
  signals: string[];
  threshold: string;
  decision: "auto_execute" | "approval_required";
  override: string;
}

export interface InterventionDecision {
  actionType: NonNullable<ExtractedAction["actionType"]>;
  impact: ExtractedAction["impact"];
  confidence: number;
  requiresApproval: boolean;
  threshold: string;
  decision: ActionReasoning["decision"];
  reason: string;
  signals: string[];
}

export interface CorrectionFeedback {
  actionId: string;
  correctionType:
    | "false_positive"
    | "false_negative"
    | "bad_reasoning"
    | "payload_edit"
    | "manual_override";
  note?: string;
  correctionPayload: Record<string, unknown>;
  correctedByUserId: string;
  createdAt: string;
}

export type QueueJobType =
  | "canonical_event.created"
  | "agent_run.ingested"
  | "agent_run.processed";

export const EVENT_QUEUE_NAME = "larry-events";

export interface QueueMessage {
  type: QueueJobType;
  tenantId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}
