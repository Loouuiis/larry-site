export type TaskStatus =
  | "backlog"
  | "not_started"
  | "in_progress"
  | "waiting"
  | "blocked"
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

export interface WorkspaceTask {
  id: string;
  projectId: string;
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
  updatedAt?: string | null;
}


export interface WorkspaceTimelineTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  dueDate: string | null;
  riskLevel: string;
  assigneeUserId?: string | null;
}

export interface WorkspaceTimeline {
  gantt?: WorkspaceTimelineTask[];
  kanban?: Record<string, Array<{ id: string }>>;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; relation: string }>;
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
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId: string | null;
  agentRunId: string | null;
  agentRunState: string | null;
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
  key: "todo" | "in_progress" | "blocked" | "completed";
  label: string;
  accentClass: string;
  targetStatus: TaskStatus;
  tasks: BoardTaskRow[];
}


export type BoardView = "table" | "kanban" | "gantt";

