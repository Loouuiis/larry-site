"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Flag, FolderTree, Loader2, Plus } from "lucide-react";
import { useTimeline2, type Timeline2NodeInput, type Timeline2RunAiEvent } from "@/hooks/useTimeline2";
import { EmptyState } from "./Timeline2Primitives";
import { TaskCenter2Surface } from "./TaskCenter2Surface";
import { Timeline2AiPanel } from "./Timeline2AiPanel";
import { Timeline2BranchReview } from "./Timeline2BranchReview";
import { Timeline2GanttSurface } from "./Timeline2GanttSurface";
import { Timeline2NodeDrawer } from "./Timeline2NodeDrawer";
import { useTimeline2UiStore } from "./timeline2-store";
import { type Mode } from "./timeline2-ui";

function defaultDraft(title = "", kind: Timeline2NodeInput["kind"] = "task"): Timeline2NodeInput {
  return {
    title,
    kind,
    status: "not_started",
    priority: "medium",
    progress: 0,
    parentId: null,
    assigneeUserIds: [],
    actionRequired: { required: false, note: null },
  };
}

export function Timeline2ProjectTab({
  projectId,
  projectDisplayName,
  mode,
}: {
  projectId: string;
  /** Workspace project title — drives the synthetic Timeline 2 project root row label in timeline mode. */
  projectDisplayName: string;
  mode: Mode;
}) {
  const router = useRouter();
  const timeline2 = useTimeline2(projectId);
  const [quickTitle, setQuickTitle] = useState("");
  const sheet = useTimeline2UiStore((state) => state.sheet);
  const aiOpen = useTimeline2UiStore((state) => state.aiOpen);
  const dependencyMode = useTimeline2UiStore((state) => state.dependencyMode);
  const taskCenterFocusRequest = useTimeline2UiStore((state) => state.taskCenterFocusRequest);
  const timelineDependencySourceId = useTimeline2UiStore((state) => state.timelineDependencySourceId);
  const setSheet = useTimeline2UiStore((state) => state.setSheet);
  const setAiOpen = useTimeline2UiStore((state) => state.setAiOpen);
  const setDependencyMode = useTimeline2UiStore((state) => state.setDependencyMode);
  const setTaskCenterFocusRequest = useTimeline2UiStore((state) => state.setTaskCenterFocusRequest);
  const setTimelineDependencySourceId = useTimeline2UiStore((state) => state.setTimelineDependencySourceId);
  const resetUi = useTimeline2UiStore((state) => state.reset);
  const lastProjectIdRef = useRef(projectId);

  useEffect(() => {
    if (lastProjectIdRef.current !== projectId) {
      resetUi();
      lastProjectIdRef.current = projectId;
    }
  }, [projectId, resetUi]);

  const snapshot = timeline2.snapshot;
  const nodes = snapshot?.nodes ?? [];
  const tree = snapshot?.tree ?? [];
  const dependencies = snapshot?.dependencies ?? [];

  const openCreateSheet = (title = "", kind: Timeline2NodeInput["kind"] = "task", parentId: string | null = null) => setSheet({
    mode: "create",
    draft: { ...defaultDraft(title, kind), parentId },
  });

  const runSafely = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      // Errors are surfaced by useTimeline2; this keeps the interactive shell stable.
    }
  };

  async function quickCreate() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle("");
    const draft = defaultDraft(title);
    await runSafely(async () => {
      const created = await timeline2.createNode(draft);
      setSheet({ mode: "edit", nodeId: created.id, draft });
    });
  }

  const rootCreateActions: Array<{ label: string; kind: NonNullable<Timeline2NodeInput["kind"]>; icon: typeof FolderTree }> = [
    { label: "New workstream", kind: "group", icon: FolderTree },
    { label: "New task", kind: "task", icon: Plus },
    { label: "New milestone", kind: "milestone", icon: Flag },
  ];

  async function safeRunAi(message: string, onEvent: (event: Timeline2RunAiEvent) => void) {
    await runSafely(() => timeline2.runAi(message, onEvent));
  }

  const loadingBlock = (
    <div className="flex h-[260px] items-center justify-center rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
      <Loader2 size={24} className="animate-spin" style={{ color: "var(--cta)" }} />
    </div>
  );

  const errorBlock = timeline2.error && !snapshot ? (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "#fecaca" }}>
      <p className="text-[16px] font-semibold" style={{ color: "#be123c" }}>Timeline 2 failed to load</p>
      <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>{timeline2.error}</p>
      <button type="button" onClick={() => void timeline2.refresh()} className="mt-4 inline-flex h-10 items-center rounded-xl px-4 text-[12px] font-semibold text-white" style={{ background: "var(--cta)" }}>
        Retry
      </button>
    </section>
  ) : null;

  const drawer = sheet && snapshot ? (
    <Timeline2NodeDrawer
      key={`${sheet.mode}-${sheet.nodeId ?? "new"}-${sheet.draft.title}`}
      state={sheet}
      nodes={nodes}
      dependencies={dependencies}
      teamMembers={snapshot.teamMembers}
      saving={timeline2.busy}
      onClose={() => setSheet(null)}
      onSave={async (draft) => {
        await runSafely(async () => {
          if (sheet.mode === "create") {
            const created = await timeline2.createNode(draft);
            setSheet({ mode: "edit", nodeId: created.id, draft });
            return;
          }
          if (sheet.nodeId) await timeline2.updateNode(sheet.nodeId, draft);
          setSheet(null);
        });
      }}
      onDelete={async (nodeId) => {
        await runSafely(() => timeline2.deleteNode(nodeId));
        setSheet(null);
      }}
      onDeleteDependency={(dependencyId) => timeline2.deleteDependency(dependencyId)}
      onEditDependenciesOnTimeline={(nodeId) => {
        setTimelineDependencySourceId(nodeId);
        setDependencyMode(true);
        setSheet(null);
        if (mode !== "timeline") router.push(`/workspace/projects/${encodeURIComponent(projectId)}?tab=timeline2`);
      }}
      onEditParentInTaskCenter={(nodeId) => {
        setTaskCenterFocusRequest({ type: "parent", nodeId });
        setSheet(null);
        if (mode !== "tasks") router.push(`/workspace/projects/${encodeURIComponent(projectId)}?tab=tasks2`);
      }}
    />
  ) : null;

  if (mode === "timeline") {
    return (
      <div className="space-y-3">
        {timeline2.error && (
          <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fff1f2", color: "#be123c" }}>
            {timeline2.error}
          </div>
        )}
        {timeline2.loading && !snapshot ? loadingBlock : errorBlock ?? (
          snapshot ? (
            <Timeline2GanttSurface
              projectDisplayName={projectDisplayName}
              nodes={nodes}
              tree={tree}
              dependencies={dependencies}
              branches={snapshot?.openBranches ?? []}
              dependencyMode={dependencyMode}
              onDependencyModeChange={setDependencyMode}
              focusDependencyNodeId={timelineDependencySourceId}
              onFocusDependencyHandled={() => setTimelineDependencySourceId(null)}
              onCreateDependency={(input) => timeline2.createDependency(input)}
              onDeleteDependency={(dependencyId) => timeline2.deleteDependency(dependencyId)}
              onUpdateNode={(nodeId, patch) => timeline2.updateNode(nodeId, patch)}
              onOpenSheet={setSheet}
              onOpenAi={() => setAiOpen(true)}
              persistKey={projectId}
              preferences={timeline2.preferences}
              onSavePreferences={timeline2.updatePreferences}
            />
          ) : null
        )}
        {drawer}
        <Timeline2AiPanel
          projectId={projectId}
          open={aiOpen}
          busy={timeline2.busy}
          onClose={() => setAiOpen(false)}
          onRun={safeRunAi}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[17px] font-semibold" style={{ color: "var(--text-1)" }}>Task Center 2</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
              Workflow status stays manual; health is computed from child work, risks, and dependencies.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rootCreateActions.map(({ label, kind, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => openCreateSheet("", kind)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setAiOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold" style={{ borderColor: "#ddd6fe", color: "var(--cta)" }}>
              <Bot size={14} />
              Timeline 2 AI
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3" style={{ borderColor: "var(--border)" }}>
            <Plus size={15} style={{ color: "var(--cta)" }} />
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void quickCreate();
                }
              }}
              placeholder="Add a task..."
              className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <button type="button" disabled={!quickTitle.trim() || timeline2.busy} onClick={() => void quickCreate()} className="h-10 rounded-xl px-4 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--cta)" }}>
            Quick-add task
          </button>
          <button type="button" disabled={!quickTitle.trim()} onClick={() => openCreateSheet(quickTitle, "task")} className="h-10 rounded-xl border bg-white px-4 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
            Add details first
          </button>
        </div>
      </section>

      {timeline2.error && (
        <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fff1f2", color: "#be123c" }}>
          {timeline2.error}
        </div>
      )}

      {timeline2.loading && !snapshot ? loadingBlock : errorBlock ?? (
        nodes.length === 0 ? (
          <EmptyState onCreate={() => openCreateSheet("", "group")} />
        ) : (
          <>
            <Timeline2BranchReview
              branches={snapshot?.openBranches ?? []}
              busy={timeline2.busy}
              onAccept={(branchId, operationIds) => timeline2.acceptBranch(branchId, operationIds)}
              onReject={(branchId, operationIds) => timeline2.rejectBranch(branchId, operationIds)}
            />
            <TaskCenter2Surface
              nodes={nodes}
              tree={tree}
              dependencies={dependencies}
              onOpenSheet={setSheet}
              onPatchNode={(nodeId, patch) => timeline2.updateNode(nodeId, patch)}
              onCreateDependency={(input) => timeline2.createDependency(input)}
              onDeleteDependency={(dependencyId) => timeline2.deleteDependency(dependencyId)}
              focusRequest={taskCenterFocusRequest}
              onFocusRequestHandled={() => setTaskCenterFocusRequest(null)}
            />
          </>
        )
      )}

      {drawer}
      <Timeline2AiPanel
        projectId={projectId}
        open={aiOpen}
        busy={timeline2.busy}
        onClose={() => setAiOpen(false)}
        onRun={safeRunAi}
      />
    </div>
  );
}
