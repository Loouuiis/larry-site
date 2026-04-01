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

