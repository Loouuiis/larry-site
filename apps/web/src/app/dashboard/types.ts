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
  status: string;
  riskLevel: string | null;
}

export interface WorkspaceTask {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeUserId?: string | null;
}

export interface WorkspaceAction {
  id: string;
  actionType?: string;
  impact: string;
  confidence: string | number;
  reason: string;
  state?: string;
  signals?: string[];
  payload?: Record<string, unknown>;
  reasoning?: {
    what?: string;
    why?: string;
    signals?: string[];
    threshold?: string;
    decision?: "auto_execute" | "approval_required";
    override?: string;
  };
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
  pendingActions: WorkspaceAction[];
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
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  riskLevel: string;
  progressPercent: number;
  assigneeUserId?: string | null;
}

export interface TaskGroup {
  key: "todo" | "in_progress" | "blocked" | "completed";
  label: string;
  accentClass: string;
  targetStatus: TaskStatus;
  tasks: BoardTaskRow[];
}

export interface ActionCardViewModel {
  id: string;
  impact: "low" | "medium" | "high";
  title: string;
  reason: string;
  confidence: string;
  threshold: string;
}

export type BoardView = "table" | "kanban" | "gantt";

