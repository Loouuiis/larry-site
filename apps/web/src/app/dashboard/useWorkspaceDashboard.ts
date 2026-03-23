"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionCardViewModel,
  BoardTaskRow,
  BoardView,
  ConnectorStatus,
  TaskGroup,
  TaskStatus,
  WorkspaceAction,
  WorkspaceSnapshot,
  WorkspaceTask,
} from "./types";

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  connected: false,
  selectedProjectId: null,
  projects: [],
  tasks: [],
  pendingActions: [],
  timeline: null,
  health: null,
  outcomes: null,
  connectors: {
    slack: { connected: false },
    calendar: { connected: false },
    email: { connected: false },
  },
  activity: [],
  emailDrafts: [],
};

type LarryIntent = "create_plan" | "update_scope" | "request_summary" | "draft_follow_up" | "freeform";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function normalizeImpact(value: string | undefined): "low" | "medium" | "high" {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function coerceStatus(value: string): TaskStatus {
  if (
    value === "backlog" ||
    value === "not_started" ||
    value === "in_progress" ||
    value === "waiting" ||
    value === "blocked" ||
    value === "completed"
  ) {
    return value;
  }
  return "not_started";
}

function mapAction(action: WorkspaceAction): ActionCardViewModel {
  const confidence =
    typeof action.confidence === "number" ? action.confidence.toFixed(2) : String(action.confidence ?? "0.00");
  return {
    id: action.id,
    impact: normalizeImpact(action.impact),
    title: action.actionType ?? "proposal",
    reason: action.reasoning?.what ?? action.reason,
    confidence,
    threshold: action.reasoning?.threshold ?? "default policy",
  };
}

function buildTaskGroups(tasks: BoardTaskRow[]): TaskGroup[] {
  const todo = tasks.filter((task) => task.status === "backlog" || task.status === "not_started");
  const inProgress = tasks.filter((task) => task.status === "in_progress" || task.status === "waiting");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const completed = tasks.filter((task) => task.status === "completed");

  return [
    {
      key: "todo",
      label: "To-Do",
      accentClass: "bg-slate-400",
      targetStatus: "not_started",
      tasks: todo,
    },
    {
      key: "in_progress",
      label: "In Progress",
      accentClass: "bg-amber-500",
      targetStatus: "in_progress",
      tasks: inProgress,
    },
    {
      key: "blocked",
      label: "Blocked",
      accentClass: "bg-rose-500",
      targetStatus: "blocked",
      tasks: blocked,
    },
    {
      key: "completed",
      label: "Completed",
      accentClass: "bg-emerald-500",
      targetStatus: "completed",
      tasks: completed,
    },
  ];
}

export function useWorkspaceDashboard(projectIdFromUrl: string) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskTriageBusyId, setTaskTriageBusyId] = useState<string | null>(null);
  const [taskMoveBusyId, setTaskMoveBusyId] = useState<string | null>(null);

  const [boardView, setBoardView] = useState<BoardView>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    todo: false,
    in_progress: false,
    blocked: false,
    completed: false,
  });

  const [larryPrompt, setLarryPrompt] = useState("Action: Turn this week's updates into assignments and follow-ups.");
  const [larryIntent, setLarryIntent] = useState<LarryIntent>("freeform");
  const [larryBusy, setLarryBusy] = useState(false);
  const [lastLarryResponse, setLastLarryResponse] = useState("");
  const [larryPolling, setLarryPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [correctionBusyId, setCorrectionBusyId] = useState<string | null>(null);
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null);

  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const loadSnapshot = useCallback(async (projectId?: string) => {
    setLoading(true);
    setError("");
    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const response = await fetch(`/api/workspace/snapshot${query}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await readJson<WorkspaceSnapshot>(response);
      if (!response.ok) {
        setSnapshot({
          ...EMPTY_SNAPSHOT,
          connected: false,
          error: "error" in data && typeof data.error === "string" ? data.error : "Failed to load workspace.",
        });
        setError("error" in data && typeof data.error === "string" ? data.error : "Failed to load workspace.");
        return;
      }

      setSnapshot({
        connected: Boolean(data.connected),
        boardMeta: data.boardMeta,
        selectedProjectId: data.selectedProjectId ?? null,
        projects: Array.isArray(data.projects) ? data.projects : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        pendingActions: Array.isArray(data.pendingActions) ? data.pendingActions : [],
        timeline: data.timeline ?? null,
        health: data.health ?? null,
        outcomes: data.outcomes ?? null,
        connectors: data.connectors ?? EMPTY_SNAPSHOT.connectors,
        activity: Array.isArray(data.activity) ? data.activity : [],
        emailDrafts: Array.isArray(data.emailDrafts) ? data.emailDrafts : [],
        error: data.error,
      });
    } catch {
      setError("Workspace snapshot network error.");
      setSnapshot({ ...EMPTY_SNAPSHOT, error: "Workspace snapshot network error." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedProjectId(projectIdFromUrl);
  }, [projectIdFromUrl]);

  useEffect(() => {
    void loadSnapshot(projectIdFromUrl);
  }, [projectIdFromUrl, loadSnapshot]);

  useEffect(() => {
    const handler = () => {
      void loadSnapshot(projectIdFromUrl);
    };
    window.addEventListener("larry:refresh-snapshot", handler);
    return () => window.removeEventListener("larry:refresh-snapshot", handler);
  }, [loadSnapshot, projectIdFromUrl]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) clearInterval(pollTimerRef.current);
    };
  }, []);

  const boardTasks: BoardTaskRow[] = useMemo(() => {
    const fromTimeline = snapshot.timeline?.gantt ?? [];
    if (fromTimeline.length > 0) {
      return fromTimeline.map((task) => ({
        id: task.id,
        projectId: selectedProjectId,
        title: task.title,
        status: coerceStatus(task.status),
        priority: task.priority,
        dueDate: task.dueDate,
        riskLevel: task.riskLevel,
        progressPercent: task.progressPercent,
        assigneeUserId: task.assigneeUserId ?? null,
      }));
    }

    return snapshot.tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: coerceStatus(task.status),
      priority: task.priority,
      dueDate: task.dueDate,
      riskLevel: "low",
      progressPercent: task.status === "completed" ? 100 : task.status === "in_progress" ? 50 : 0,
      assigneeUserId: task.assigneeUserId ?? null,
    }));
  }, [snapshot.timeline, snapshot.tasks, selectedProjectId]);

  const filteredBoardTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return boardTasks;
    return boardTasks.filter((task) => task.title.toLowerCase().includes(query));
  }, [boardTasks, searchQuery]);

  const taskGroups = useMemo(() => buildTaskGroups(filteredBoardTasks), [filteredBoardTasks]);

  const groupedCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      backlog: 0,
      not_started: 0,
      in_progress: 0,
      waiting: 0,
      blocked: 0,
      completed: 0,
    };
    for (const task of boardTasks) {
      counts[task.status] += 1;
    }
    return counts;
  }, [boardTasks]);

  const actionCards = useMemo(
    () => snapshot.pendingActions.map(mapAction),
    [snapshot.pendingActions]
  );

  const canCreateTask = Boolean(selectedProjectId && taskTitle.trim().length > 0);
  const selectedProject =
    snapshot.projects.find((project) => project.id === selectedProjectId) ?? null;

  const connectors = snapshot.connectors ?? EMPTY_SNAPSHOT.connectors;

  const handleCreateProject = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = projectName.trim();
      if (!name) return;

      setProjectBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/workspace/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const body = await readJson<{ error?: string; id?: string }>(response);
        if (!response.ok) {
          setError(body.error ?? "Failed to create project.");
          return;
        }
        setProjectName("");
        const createdId = body.id ? String(body.id) : "";
        if (createdId) {
          router.push(`/workspace/projects/${createdId}`);
        }
        await loadSnapshot(createdId || selectedProjectId || projectIdFromUrl);
        setNotice("Project created.");
      } catch {
        setError("Create project network error.");
      } finally {
        setProjectBusy(false);
      }
    },
    [projectName, selectedProjectId, projectIdFromUrl, loadSnapshot, router]
  );

  const handleCreateTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const title = taskTitle.trim();
      if (!title || !selectedProjectId) return;

      setTaskBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/workspace/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selectedProjectId, title, priority: "medium" }),
        });
        const body = await readJson<{ error?: string; aiTriage?: { requested?: boolean; success?: boolean } }>(
          response
        );
        if (!response.ok) {
          setError(body.error ?? "Failed to create task.");
          return;
        }
        if (body.aiTriage?.requested && body.aiTriage.success === false) {
          setError("Task created, but AI triage failed. Use Send to AI.");
        }
        setTaskTitle("");
        await loadSnapshot(selectedProjectId);
        setNotice("Task created and sent for Larry triage.");
      } catch {
        setError("Create task network error.");
      } finally {
        setTaskBusy(false);
      }
    },
    [taskTitle, selectedProjectId, loadSnapshot]
  );

  const handleTaskTriage = useCallback(
    async (task: WorkspaceTask) => {
      setTaskTriageBusyId(task.id);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/workspace/tasks/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: task.id,
            projectId: task.projectId,
            title: task.title,
            dueDate: task.dueDate ?? undefined,
          }),
        });
        const body = await readJson<{ error?: string }>(response);
        if (!response.ok) {
          setError(body.error ?? "Failed to run AI triage for task.");
          return;
        }
        await loadSnapshot(selectedProjectId || undefined);
        setNotice("Larry triage completed.");
      } catch {
        setError("Task triage network error.");
      } finally {
        setTaskTriageBusyId(null);
      }
    },
    [loadSnapshot, selectedProjectId]
  );

  const handleMoveTask = useCallback(
    async (taskId: string, status: TaskStatus) => {
      setTaskMoveBusyId(taskId);
      setError("");
      setNotice("");
      try {
        const response = await fetch(`/api/workspace/tasks/${taskId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            progressPercent: status === "completed" ? 100 : undefined,
          }),
        });
        const body = await readJson<{ error?: string }>(response);
        if (!response.ok) {
          setError(body.error ?? "Failed to move task.");
          return;
        }
        await loadSnapshot(selectedProjectId || undefined);
        setNotice("Task status updated.");
      } catch {
        setError("Task move network error.");
      } finally {
        setTaskMoveBusyId(null);
      }
    },
    [loadSnapshot, selectedProjectId]
  );

  const handleActionDecision = useCallback(
    async (actionId: string, decision: "approve" | "reject") => {
      setActionBusyId(actionId);
      setError("");
      setNotice("");
      try {
        const response = await fetch(`/api/workspace/actions/${actionId}/${decision}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: `UI ${decision}` }),
        });
        const body = await readJson<{ error?: string }>(response);
        if (!response.ok) {
          setError(body.error ?? `Failed to ${decision} action.`);
          return;
        }
        await loadSnapshot(selectedProjectId || undefined);
        setNotice(decision === "approve" ? "Action approved." : "Action rejected.");
      } catch {
        setError(`Action ${decision} network error.`);
      } finally {
        setActionBusyId(null);
      }
    },
    [loadSnapshot, selectedProjectId]
  );

  const handleActionCorrect = useCallback(
    async (actionId: string) => {
      setCorrectionBusyId(actionId);
      setError("");
      setNotice("");
      try {
        const response = await fetch(`/api/workspace/actions/${actionId}/correct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correctionType: "bad_reasoning",
            note: "Needs PM correction",
            correctionPayload: { source: "workspace_ui" },
            tunePolicy: true,
          }),
        });
        const body = await readJson<{ error?: string; thresholdTuned?: boolean }>(response);
        if (!response.ok) {
          setError(body.error ?? "Failed to correct action.");
          return;
        }
        await loadSnapshot(selectedProjectId || undefined);
        setNotice(body.thresholdTuned ? "Correction captured + policy tuned." : "Correction captured.");
      } catch {
        setError("Action correction network error.");
      } finally {
        setCorrectionBusyId(null);
      }
    },
    [loadSnapshot, selectedProjectId]
  );

  const handleLarryRun = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const prompt = larryPrompt.trim();
      if (prompt.length < 3) return;

      setLarryBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/workspace/larry/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: larryIntent,
            input: prompt,
            projectId: selectedProjectId || undefined,
            mode: "execute",
          }),
        });
        const body = await readJson<{
          error?: string;
          message?: string;
          summary?: { narrative?: string };
          runId?: string;
        }>(response);
        if (!response.ok) {
          setError(body.error ?? "Larry command failed.");
          return;
        }
        const responseMessage =
          body.summary?.narrative ??
          body.message ??
          (body.runId ? `Larry command accepted (run ${body.runId.slice(0, 8)}...).` : "Larry processed your command.");
        setNotice(responseMessage);
        setLastLarryResponse(responseMessage);
        await loadSnapshot(selectedProjectId || undefined);

        // Poll /api/workspace/actions every 4s for up to 60s, stop on first result
        if (pollTimerRef.current !== null) clearInterval(pollTimerRef.current);
        setLarryPolling(true);
        const pollStart = Date.now();
        pollTimerRef.current = setInterval(() => {
          void (async () => {
            try {
              const res = await fetch("/api/workspace/actions", { cache: "no-store" });
              const data = await readJson<{ actions?: WorkspaceAction[] }>(res);
              const actions = data.actions ?? [];
              const timedOut = Date.now() - pollStart >= 60_000;
              if (actions.length > 0 || timedOut) {
                clearInterval(pollTimerRef.current!);
                pollTimerRef.current = null;
                setLarryPolling(false);
                if (actions.length > 0) {
                  setSnapshot((prev) => ({ ...prev, pendingActions: actions }));
                }
              }
            } catch {
              // ignore transient poll errors
            }
          })();
        }, 4_000);
      } catch {
        setError("Larry network error.");
      } finally {
        setLarryBusy(false);
      }
    },
    [larryPrompt, larryIntent, selectedProjectId, loadSnapshot]
  );

  const refreshConnectors = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/connectors/summary", {
        method: "GET",
        cache: "no-store",
      });
      const body = await readJson<{ connectors?: WorkspaceSnapshot["connectors"]; error?: string }>(response);
      if (!response.ok) {
        return;
      }
      if (body.connectors) {
        setSnapshot((prev) => ({ ...prev, connectors: body.connectors }));
      }
    } catch {
      // no-op
    }
  }, []);

  const openConnectorInstall = useCallback(
    async (connector: "slack" | "calendar" | "email") => {
      try {
        const response = await fetch("/api/workspace/connectors/summary", {
          method: "GET",
          cache: "no-store",
        });
        const body = await readJson<{
          connectors?: Record<string, ConnectorStatus>;
          error?: string;
        }>(response);
        if (!response.ok || !body.connectors) {
          setError(body.error ?? "Unable to load connector install URL.");
          return;
        }
        const target = body.connectors[connector];
        if (target?.installUrl && typeof window !== "undefined") {
          window.open(target.installUrl, "_blank", "noopener,noreferrer");
          setNotice(`Opening ${connector} connection flow.`);
        } else {
          setError((target?.installError as string) ?? `${connector} install URL is not available.`);
        }
        setSnapshot((prev) => ({ ...prev, connectors: body.connectors as WorkspaceSnapshot["connectors"] }));
      } catch {
        setError("Connector install flow failed.");
      }
    },
    []
  );

  const sendEmailDraft = useCallback(
    async (draftId: string) => {
      const draft = snapshot.emailDrafts?.find((item) => item.id === draftId);
      if (!draft) return;
      setDraftBusyId(draftId);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/workspace/email/drafts/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: draft.projectId ?? undefined,
            actionId: draft.actionId ?? undefined,
            to: draft.recipient,
            subject: draft.subject,
            body: draft.body,
            sendNow: true,
          }),
        });
        const body = await readJson<{ error?: string }>(response);
        if (!response.ok) {
          setError(body.error ?? "Failed to send email draft.");
          return;
        }
        setNotice("Email draft sent.");
        await loadSnapshot(selectedProjectId || undefined);
      } catch {
        setError("Email draft send network error.");
      } finally {
        setDraftBusyId(null);
      }
    },
    [snapshot.emailDrafts, loadSnapshot, selectedProjectId]
  );

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      router.push(`/workspace/projects/${projectId}`);
    },
    [router]
  );

  return {
    loading,
    error,
    notice,
    setNotice,
    snapshot,
    connectors,
    selectedProjectId,
    selectedProject,
    boardTasks: filteredBoardTasks,
    taskGroups,
    groupedCounts,
    actionCards,
    boardView,
    searchQuery,
    collapsedGroups,
    rightPanelOpen,
    projectName,
    projectBusy,
    taskTitle,
    taskBusy,
    canCreateTask,
    taskTriageBusyId,
    taskMoveBusyId,
    larryPrompt,
    larryIntent,
    larryBusy,
    larryPolling,
    lastLarryResponse,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
    setProjectName,
    setTaskTitle,
    setBoardView,
    setSearchQuery,
    setLarryPrompt,
    setLarryIntent,
    setRightPanelOpen,
    toggleGroupCollapse,
    selectProject,
    handleCreateProject,
    handleCreateTask,
    handleTaskTriage,
    handleMoveTask,
    handleActionDecision,
    handleActionCorrect,
    handleLarryRun,
    refreshConnectors,
    openConnectorInstall,
    sendEmailDraft,
    loadSnapshot,
  };
}
