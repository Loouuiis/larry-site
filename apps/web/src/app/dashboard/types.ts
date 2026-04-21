import type { TimelineCategorySummary } from "@larry/shared";

export type TaskStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "overdue"
  | "completed";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface WorkspaceProject {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  riskLevel: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  riskScore?: number | null;
  completionRate?: number | null;
  updatedAt?: string | null;
}

export type ProjectMembershipRole = "owner" | "editor" | "viewer";

export interface WorkspaceProjectMember {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  projectRole: ProjectMembershipRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProjectMembers {
  projectId: string;
  currentUserRole: ProjectMembershipRole | null;
  canManage: boolean;
  members: WorkspaceProjectMember[];
}

export type WorkspaceProjectNoteVisibility = "shared" | "personal";

export interface WorkspaceProjectNote {
  id: string;
  projectId: string;
  authorUserId: string;
  authorName: string;
  visibility: WorkspaceProjectNoteVisibility;
  recipientUserId: string | null;
  recipientName: string | null;
  content: string;
  sourceKind: string | null;
  sourceRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProjectNotesResponse {
  projectId: string;
  visibility: "all" | WorkspaceProjectNoteVisibility;
  notes: WorkspaceProjectNote[];
  error?: string;
}

export interface WorkspaceTask {
  id: string;
  projectId: string;
  parentTaskId?: string | null;  // v4 — subtask parent (one level deep; API rejects grandchildren)
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate?: string | null;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  progressPercent?: number;
  riskLevel?: string;
  labels?: string[];
  updatedAt?: string | null;
}


export interface TimelineMilestone {
  id: string;
  title: string;
  date: string; // ISO date
}

export interface WorkspaceTimelineTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  category: string | null;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  riskLevel: string;
  milestones?: TimelineMilestone[];
  projectId?: string | null;
  parentTaskId?: string | null;
  categoryId?: string | null;
}

export interface WorkspaceTimelineProjectSummary {
  id: string;
  name: string;
  status: string;
  categoryId: string | null;
}

export interface WorkspaceTimeline {
  gantt?: WorkspaceTimelineTask[];
  kanban?: Record<string, Array<{ id: string }>>;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; relation: string }>;
  // Timeline Slice 2 (Bug 8) — project-timeline now carries its own
  // category slice so ProjectGanttClient no longer depends on the org
  // timeline cache for colour / nesting. Nullable for backwards compat
  // with the old response shape during the deploy roll-forward.
  project?: WorkspaceTimelineProjectSummary | null;
  categories?: TimelineCategorySummary[];
}

export interface WorkspaceHealth {
  completionRate?: number;
  blockedCount?: number;
  avgRiskScore?: number;
  riskLevel?: string;
  taskCount?: number;
}

export interface WorkspaceOutcomes {
  metrics?: {
    completionRate?: number;
    highRiskTaskRate?: number;
    pendingApprovals?: number;
    autoExecutedActions?: number;
    highPriorityCoverage?: number;
  };
  narrative?: string;
}

export interface ConnectorStatus {
  connected?: boolean;
  installUrl?: string;
  installError?: string;
  [key: string]: unknown;
}

export interface WorkspaceActivityItem {
  id: string;
  type: "signal" | "proposal" | "approval";
  title: string;
  subtitle?: string | null;
  source?: string | null;
  createdAt: string;
}

export type CanonicalEventRuntimeStatus =
  | "running"
  | "succeeded"
  | "retryable_failed"
  | "dead_lettered";

export interface WorkspaceCanonicalEventRuntimeEntry {
  canonicalEventId: string;
  source: "slack" | "email" | "calendar" | "transcript" | string;
  eventType: string;
  actor: string;
  occurredAt: string;
  canonicalCreatedAt: string;
  rawEventId: string | null;
  idempotencyKey: string | null;
  canonicalSiblingCount: number;
  latestAttemptId: string | null;
  latestStatus: CanonicalEventRuntimeStatus | null;
  latestAttemptNumber: number | null;
  latestMaxAttempts: number | null;
  latestQueueJobId: string | null;
  latestQueueJobName: string | null;
  latestErrorMessage: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestDurationMs: number | null;
  latestUpdatedAt: string | null;
}

export interface WorkspaceCanonicalEventRuntimeSummary {
  runningCount: number;
  succeededCount: number;
  retryableFailedCount: number;
  deadLetteredCount: number;
  unprocessedCount: number;
}

export interface WorkspaceCanonicalEventRuntimeResponse {
  items: WorkspaceCanonicalEventRuntimeEntry[];
  summary: WorkspaceCanonicalEventRuntimeSummary;
  filters?: {
    status?: CanonicalEventRuntimeStatus | null;
    source?: "slack" | "email" | "calendar" | "transcript" | null;
    limit?: number;
  };
  error?: string;
}

export interface WorkspaceCanonicalEventRuntimeDetailResponse {
  item?: WorkspaceCanonicalEventRuntimeEntry | null;
  error?: string;
}

export interface EmailDraft {
  id: string;
  projectId?: string | null;
  actionId?: string | null;
  recipient: string;
  subject: string;
  body: string;
  state: "draft" | "sent";
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMeeting {
  id: string;
  title: string | null;
  summary: string | null;
  transcript?: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId: string | null;
  /** @deprecated Transitional compatibility placeholder from legacy extraction runtime. */
  agentRunId?: string | null;
  /** @deprecated Transitional compatibility placeholder from legacy extraction runtime. */
  agentRunState?: string | null;
}

export interface WorkspaceSnapshot {
  connected: boolean;
  boardMeta?: {
    workspaceName?: string;
    generatedAt?: string;
  };
  selectedProjectId?: string | null;
  projects: WorkspaceProject[];
  tasks: WorkspaceTask[];
  timeline?: WorkspaceTimeline | null;
  health?: WorkspaceHealth | null;
  outcomes?: WorkspaceOutcomes | null;
  connectors?: {
    slack?: ConnectorStatus;
    calendar?: ConnectorStatus;
    email?: ConnectorStatus;
  };
  activity?: WorkspaceActivityItem[];
  emailDrafts?: EmailDraft[];
  error?: string;
}

export interface WorkspaceHomeData {
  projects: WorkspaceProject[];
  archivedProjects?: WorkspaceProject[];
  tasks: WorkspaceTask[];
  connectors: {
    slack?: ConnectorStatus;
    calendar?: ConnectorStatus;
    email?: ConnectorStatus;
  };
  error?: string;
}

export interface WorkspaceProjectOverview {
  project: WorkspaceProject | null;
  tasks: WorkspaceTask[];
  timeline?: WorkspaceTimeline | null;
  health?: WorkspaceHealth | null;
  outcomes?: WorkspaceOutcomes | null;
  meetings: WorkspaceMeeting[];
  error?: string;
}

export interface WorkspaceMyWorkData {
  viewerUserId: string | null;
  projects: WorkspaceProject[];
  tasks: WorkspaceTask[];
  error?: string;
}

export interface WorkspaceMeetingsOverview {
  projects: WorkspaceProject[];
  meetings: WorkspaceMeeting[];
  error?: string;
}

export interface WorkspaceLarryEvent {
  id: string;
  projectId: string;
  projectName: string | null;
  eventType: "auto_executed" | "suggested" | "accepted" | "dismissed";
  actionType: string;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
  executedAt: string | null;
  triggeredBy: "schedule" | "login" | "chat" | "signal";
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
  executedByKind: "larry" | "user" | null;
  executedByUserId: string | null;
  executedByName: string | null;
  executionMode: "auto" | "approval" | null;
  sourceKind: string | null;
  sourceRecordId: string | null;
  conversationTitle?: string | null;
  requestMessagePreview?: string | null;
  responseMessagePreview?: string | null;
  modifiedAt?: string | null;
  modifiedByUserId?: string | null;
  modifiedByName?: string | null;
}

export interface WorkspaceConversationPreview {
  id: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
}

export interface WorkspaceProjectActionCentre {
  suggested: WorkspaceLarryEvent[];
  activity: WorkspaceLarryEvent[];
  conversations: WorkspaceConversationPreview[];
  error?: string;
}

export interface WorkspaceProjectMemoryEntry {
  id: string;
  source: string;
  sourceKind: string;
  sourceRecordId: string | null;
  content: string;
  createdAt: string;
}

export interface BoardTaskRow {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate?: string | null;
  riskLevel: string;
  progressPercent: number;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
}

export interface TaskGroup {
  key: "not_started" | "on_track" | "at_risk" | "overdue" | "completed";
  label: string;
  accentClass: string;
  targetStatus: TaskStatus;
  tasks: BoardTaskRow[];
}


export type BoardView = "table" | "kanban" | "gantt";

export interface LarryDocument {
  id: string;
  projectId: string | null;
  larryEventId: string | null;
  title: string;
  docType: "email_draft" | "letter" | "memo" | "report" | "note" | "other";
  content: string;
  emailRecipient: string | null;
  emailSubject: string | null;
  emailSentAt: string | null;
  state: "draft" | "final" | "sent";
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  tenantId: string;
  projectId: string | null;
  parentId: string | null;
  name: string;
  folderType: "project" | "company" | "general";
  depth: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderBreadcrumbItem {
  id: string;
  name: string;
}
