export type Role = "owner" | "admin" | "pm" | "member" | "executive";

export const ACTIVE_TENANT_ROLES = ["owner", "admin", "pm", "member"] as const;
export const INVITABLE_TENANT_ROLES = ["admin", "pm", "member"] as const;
export type ActiveTenantRole = (typeof ACTIVE_TENANT_ROLES)[number];
export type InvitableTenantRole = (typeof INVITABLE_TENANT_ROLES)[number];

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

export interface CanonicalEventCreatedPayload extends Record<string, unknown> {
  canonicalEventId: string;
  source: CanonicalEvent["source"];
  eventType: CanonicalEvent["eventType"];
}

export interface TranscriptCanonicalPayload extends Record<string, unknown> {
  transcript: string;
  meetingTitle?: string;
  projectId?: string;
  meetingNoteId?: string;
  submittedByUserId?: string;
}

export interface ExtractedAction {
  title: string;
  owner?: string;
  dueDate?: string;
  description?: string;
  actionType?:
    | "status_update"
    | "task_create"
    | "project_create"
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
  workstream?: string;
  blockerFlag?: boolean;
  dependsOn?: string[];
  followUpRequired?: boolean;
}


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

export type QueueJobType =
  | "canonical_event.created"
  | "escalation.scan"
  | "calendar.webhook.renew"
  | "larry.scan";

export const EVENT_QUEUE_NAME = "larry-events";

export interface QueueMessage {
  type: QueueJobType;
  tenantId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

// ── Larry Intelligence types ──────────────────────────────────────────────────

export type LarryActionType =
  | "task_create"
  | "status_update"
  | "risk_flag"
  | "reminder_send"
  | "deadline_change"
  | "owner_change"
  | "scope_change"
  | "email_draft"
  | "project_create"
  | "collaborator_add"
  | "collaborator_role_update"
  | "collaborator_remove"
  | "project_note_send"
  | "calendar_event_create"
  | "calendar_event_update"
  | "slack_message_draft"
  | "other";

export type LarryEventType = "auto_executed" | "suggested" | "accepted" | "dismissed";
export type LarryTriggeredBy = "schedule" | "login" | "chat" | "signal";
export type LarryExecutionMode = "auto" | "approval";
export type LarryExecutedByKind = "larry" | "user";

export interface LarryAction {
  type: LarryActionType;
  /** Plain English. Auto: past tense ("I moved X to At Risk"). Suggested: imperative ("Move X to At Risk"). */
  displayText: string;
  /** One sentence, specific signals. E.g. "7 days inactive, deadline Friday." */
  reasoning: string;
  payload: Record<string, unknown>;
  /** When true, Larry can execute this action himself without calling an external API mutation. */
  selfExecutable?: boolean;
  /** When true, Larry should offer to execute this action and show the output to the user. */
  offerExecution?: boolean;
  /** The document Larry produced when executing this action himself. */
  executionOutput?: {
    docType: "email_draft" | "letter" | "memo" | "report" | "note" | "other";
    title: string;
    content: string;
    emailRecipient?: string;
    emailSubject?: string;
  } | null;
}

export interface IntelligenceResult {
  /** Larry's internal chain-of-thought reasoning — logged but never shown to users. */
  thinking?: string;
  /** 2–4 sentence plain English summary of what is happening in this project. */
  briefing: string;
  /** Actions Larry will execute immediately — low-risk, reversible, operational. */
  autoActions: LarryAction[];
  /** Actions that need the project owner to approve — deadline/scope/ownership/external. */
  suggestedActions: LarryAction[];
  /** When non-empty, Larry needs more info before acting. autoActions and suggestedActions should be empty. */
  followUpQuestions?: Array<{
    field: string;    // e.g. "deadline", "assignee", "scope", "recipient", "task_target", "general"
    question: string; // e.g. "What deadline should I set for this task?"
  }>;
  /** A sentence or two Larry wants persisted as project context for future scans. Null means no update needed. */
  contextUpdate?: string | null;
}

export interface LarryConversationPreview {
  id: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
}

export interface LarryEventSummary {
  id: string;
  projectId: string;
  projectName: string | null;
  eventType: LarryEventType;
  actionType: string;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
  executedAt: string | null;
  triggeredBy: LarryTriggeredBy;
  chatMessage: string | null;
  createdAt: string;
  conversationId: string | null;
  requestMessageId: string | null;
  responseMessageId: string | null;
  requestedByUserId: string | null;
  requestedByName: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  dismissedByUserId: string | null;
  dismissedByName: string | null;
  dismissedAt: string | null;
  executedByKind: LarryExecutedByKind | null;
  executedByUserId: string | null;
  executedByName: string | null;
  executionMode: LarryExecutionMode | null;
  sourceKind: string | null;
  sourceRecordId: string | null;
  conversationTitle?: string | null;
  requestMessagePreview?: string | null;
  responseMessagePreview?: string | null;
}

export interface LarryMessageRecord {
  id: string;
  role: "user" | "larry";
  content: string;
  reasoning: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  linkedActions: LarryEventSummary[];
}

export interface LarryActionCentreData {
  suggested: LarryEventSummary[];
  activity: LarryEventSummary[];
  conversations: LarryConversationPreview[];
  error?: string;
}

export interface LarryClarification {
  field: string;
  question: string;
  context?: string;
}

export interface LarryChatRequest {
  projectId?: string;
  message: string;
  conversationId?: string;
}

export interface LarryChatResponse {
  conversationId: string;
  message: string;
  userMessage: LarryMessageRecord;
  assistantMessage: LarryMessageRecord;
  linkedActions: LarryEventSummary[];
  actionsExecuted: number;
  suggestionCount: number;
  error?: string;
  /** When true, Larry is asking follow-up questions before acting. */
  requiresClarification?: boolean;
  /** Structured clarification questions Larry needs answered before proceeding. */
  clarifications?: LarryClarification[];
}

export interface ProjectTaskSnapshot {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  progressPercent: number;
  riskScore: number;
  riskLevel: string;
  dueDate: string | null;
  startDate: string | null;
  /** ISO timestamp of last update — key signal for inactivity detection. */
  lastActivityAt: string;
  /** Titles of tasks this task depends on. */
  dependsOnTitles: string[];
}

export interface ProjectTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  activeTaskCount: number;
}

export interface ProjectActivityEntry {
  description: string;
  timestamp: string;
}

export interface ProjectSignal {
  source: string;
  content: string;
  timestamp: string;
}

export interface ProjectMemoryEntry {
  id: string;
  tenantId: string;
  projectId: string;
  /** Human-readable origin label, e.g. "Larry chat · 2026-03-30" */
  source: string;
  /** Normalized source kind: 'chat' | 'action' | 'meeting' | 'briefing' | 'schedule' | etc. */
  sourceKind: string;
  sourceRecordId: string | null;
  content: string;
  createdAt: string;
}

export interface ProjectSnapshot {
  project: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    status: string;
    riskScore: number;
    riskLevel: string;
    startDate: string | null;
    targetDate: string | null;
  };
  tasks: ProjectTaskSnapshot[];
  team: ProjectTeamMember[];
  recentActivity: ProjectActivityEntry[];
  /** Optional signals from external integrations (Slack, Calendar, Email). */
  signals: ProjectSignal[];
  /** Durable project memory from past Larry interactions (most recent first). */
  memoryEntries?: ProjectMemoryEntry[];
  /** Larry's accumulated understanding of this project, injected from persisted context updates. */
  larryContext?: string | null;
  /** Aggregated accept/dismiss counts per action type over the last 30 days. */
  feedbackHistory?: Array<{ actionType: string; state: string; count: number }>;
  generatedAt: string;
}

export interface IntelligenceConfig {
  provider: "openai" | "anthropic" | "gemini" | "groq" | "mock";
  apiKey?: string;
  model: string;
}

// ── Portfolio Gantt types ─────────────────────────────────────────────────────

export type GanttTaskStatus = "not_started" | "on_track" | "at_risk" | "overdue" | "completed";
export type GanttTaskPriority = "low" | "medium" | "high" | "critical";

export interface ProjectCategory {
  id: string;
  tenantId: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GanttTask {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: GanttTaskStatus;
  priority: GanttTaskPriority;
  assigneeUserId: string | null;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  progressPercent: number;
}

export interface PortfolioTimelineProject {
  id: string;
  name: string;
  status: "active" | "archived";
  startDate: string | null;
  targetDate: string | null;
  tasks: GanttTask[];
}

export interface PortfolioTimelineCategory {
  id: string | null;
  name: string;
  colour: string | null;
  sortOrder: number;
  // v4 — nesting. parentCategoryId !== null: child of another category.
  // projectId !== null: scoped to a specific project (rendered in the project
  // timeline, skipped from the org portfolio view).
  parentCategoryId?: string | null;
  projectId?: string | null;
  projects: PortfolioTimelineProject[];
}

export interface PortfolioTimelineResponse {
  categories: PortfolioTimelineCategory[];
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>;
}
