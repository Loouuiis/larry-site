"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface WorkspaceProject {
  id: string;
  name: string;
  status: string;
  riskLevel: string | null;
}

interface WorkspaceTask {
  id: string;
  projectId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

interface WorkspaceAction {
  id: string;
  impact: string;
  confidence: string | number;
  reason: string;
}

interface WorkspaceSnapshot {
  connected: boolean;
  projects: WorkspaceProject[];
  tasks: WorkspaceTask[];
  pendingActions: WorkspaceAction[];
  error?: string;
}

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  connected: false,
  projects: [],
  tasks: [],
  pendingActions: [],
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function WorkspaceDashboard() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [projectName, setProjectName] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/snapshot", {
        method: "GET",
        cache: "no-store",
      });
      const data = await readJson<WorkspaceSnapshot & { details?: unknown }>(response);
      if (!response.ok) {
        setSnapshot({
          ...EMPTY_SNAPSHOT,
          connected: false,
          error: data.error ?? "Failed to load workspace snapshot.",
        });
        setError(data.error ?? "Failed to load workspace snapshot.");
        return;
      }
      setSnapshot({
        connected: Boolean(data.connected),
        projects: Array.isArray(data.projects) ? data.projects : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        pendingActions: Array.isArray(data.pendingActions) ? data.pendingActions : [],
        error: data.error,
      });
    } catch {
      setSnapshot({
        ...EMPTY_SNAPSHOT,
        connected: false,
        error: "Workspace snapshot network error.",
      });
      setError("Workspace snapshot network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!selectedProjectId && snapshot.projects.length > 0) {
      setSelectedProjectId(snapshot.projects[0].id);
    }
  }, [selectedProjectId, snapshot.projects]);

  const projectCount = snapshot.projects.length;
  const taskCount = snapshot.tasks.length;
  const pendingActionCount = snapshot.pendingActions.length;

  const canCreateTask = useMemo(
    () => Boolean(selectedProjectId && taskTitle.trim().length > 0),
    [selectedProjectId, taskTitle]
  );

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;

    setProjectBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(body.error ?? "Failed to create project.");
        return;
      }
      setProjectName("");
      await loadSnapshot();
    } catch {
      setError("Create project network error.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title || !selectedProjectId) return;

    setTaskBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title,
          priority: "medium",
        }),
      });
      const body = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(body.error ?? "Failed to create task.");
        return;
      }
      setTaskTitle("");
      await loadSnapshot();
    } catch {
      setError("Create task network error.");
    } finally {
      setTaskBusy(false);
    }
  }

  async function handleActionDecision(actionId: string, decision: "approve" | "reject") {
    setActionBusyId(actionId);
    setError("");
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
      await loadSnapshot();
    } catch {
      setError(`Action ${decision} network error.`);
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Larry Workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Project Command Center
        </h1>
        <p className="mt-2 text-sm text-neutral-600 sm:text-base">
          Live per-user workspace data with project/task creation and action approvals.
        </p>
      </header>

      {(error || snapshot.error) && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-900">
          <p className="font-medium">Workspace notice</p>
          <p className="mt-1">{error || snapshot.error}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Projects</p>
          <p className="mt-2 text-3xl font-semibold text-neutral-900">{loading ? "-" : projectCount}</p>
        </article>
        <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Tasks</p>
          <p className="mt-2 text-3xl font-semibold text-neutral-900">{loading ? "-" : taskCount}</p>
        </article>
        <article className="rounded-2xl border border-neutral-200 bg-white/85 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Pending Actions</p>
          <p className="mt-2 text-3xl font-semibold text-neutral-900">{loading ? "-" : pendingActionCount}</p>
        </article>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form onSubmit={handleCreateProject} className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-neutral-900">Create Project</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="h-10 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={projectBusy || projectName.trim().length === 0}
              className="h-10 rounded-xl border border-neutral-900 px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {projectBusy ? "Adding..." : "Add"}
            </button>
          </div>
        </form>

        <form onSubmit={handleCreateTask} className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-neutral-900">Create Task</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500"
            />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Select project</option>
              {snapshot.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={taskBusy || !canCreateTask}
              className="h-10 rounded-xl border border-neutral-900 px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {taskBusy ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-neutral-900">Projects</h2>
          <div className="mt-3 space-y-3">
            {snapshot.projects.slice(0, 8).map((project) => (
              <article key={project.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                <p className="text-sm font-medium text-neutral-900">{project.name}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Status: <span className="font-medium">{project.status}</span>
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  Risk: <span className="font-medium">{project.riskLevel ?? "unknown"}</span>
                </p>
              </article>
            ))}
            {snapshot.projects.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                No projects yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-neutral-900">Tasks</h2>
          <div className="mt-3 space-y-3">
            {snapshot.tasks.slice(0, 10).map((task) => (
              <article key={task.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                <p className="text-sm font-medium text-neutral-900">{task.title}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  {task.status} · {task.priority}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "n/a"}
                </p>
              </article>
            ))}
            {snapshot.tasks.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                No tasks yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-neutral-900">Action Center</h2>
          <div className="mt-3 space-y-3">
            {snapshot.pendingActions.slice(0, 10).map((action) => {
              const busy = actionBusyId === action.id;
              return (
                <article key={action.id} className="rounded-xl border border-neutral-200/90 bg-white p-3">
                  <p className="text-xs uppercase tracking-wider text-neutral-500">{action.impact}</p>
                  <p className="mt-1 text-sm text-neutral-800">{action.reason}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Confidence:{" "}
                    {typeof action.confidence === "number"
                      ? action.confidence.toFixed(2)
                      : action.confidence}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleActionDecision(action.id, "approve")}
                      className="rounded-lg border border-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleActionDecision(action.id, "reject")}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
            {snapshot.pendingActions.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                No pending approval actions.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
