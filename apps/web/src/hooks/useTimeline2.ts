"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Timeline2Branch,
  Timeline2ChatStreamEvent,
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
  Timeline2NodeKind,
  Timeline2Priority,
  Timeline2Snapshot,
  Timeline2Status,
  Timeline2UserPreferences,
} from "@larry/shared";
import { normalizeTimeline2UserPreferences } from "@larry/shared/timeline2";
import {
  apiJson,
  applyTimeline2AiStreamEvent,
  buildTimeline2AiRequestPayload,
  parseTimeline2SseBuffer,
  readJson,
  type Timeline2AiStreamState,
} from "./timeline2-transport";
import { recomputeTimeline2Rollups } from "@/lib/timeline2-local-rollup";
import { buildTimelineGanttVisibleRows, isTimeline2SyntheticProjectRootId } from "@/components/workspace/timeline2/timeline-render-types";

export interface Timeline2NodeInput {
  parentId?: string | null;
  kind?: Timeline2NodeKind;
  title: string;
  description?: string | null;
  status?: Timeline2Status;
  priority?: Timeline2Priority;
  startDate?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
  progress?: number;
  actionRequired?: {
    required: boolean;
    note?: string | null;
  };
  assigneeUserIds?: string[];
}

export type Timeline2NodePatch = Partial<Timeline2NodeInput>;

export interface Timeline2CriticalPathResult {
  criticalNodeIds: string[];
  floatDaysByNodeId: Record<string, number | null>;
  projectedEndDate: string;
  warnings: string[];
}

const DEFAULT_TIMELINE2_PREFERENCES: Timeline2UserPreferences = normalizeTimeline2UserPreferences({
  columnOrder: [],
  visibleColumns: [],
  columnWidths: {},
  outlineWidth: 640,
  dayWidth: 38,
  collapsedNodeIds: [],
});

export const timeline2SnapshotQueryKey = (projectId: string) =>
  ["timeline2", "snapshot", projectId] as const;
export const timeline2PreferencesQueryKey = (projectId: string) =>
  ["timeline2", "preferences", projectId] as const;
export const timeline2CriticalPathQueryKey = (projectId: string) =>
  ["timeline2", "critical-path", projectId] as const;

function patchTreeNodes(
  nodes: Timeline2Node[],
  nodeId: string,
  patch: Timeline2NodePatch,
): Timeline2Node[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        title: patch.title ?? node.title,
        description: patch.description === undefined ? node.description : patch.description,
        kind: patch.kind ?? node.kind,
        status: patch.status ?? node.status,
        priority: patch.priority ?? node.priority,
        startDate: patch.startDate === undefined ? node.startDate : patch.startDate,
        dueDate: patch.dueDate === undefined ? node.dueDate : patch.dueDate,
        progress: patch.progress ?? node.progress,
        sortOrder: patch.sortOrder ?? node.sortOrder,
        parentId: patch.parentId === undefined ? node.parentId : patch.parentId,
        actionRequired: patch.actionRequired === undefined ? node.actionRequired : {
          required: patch.actionRequired.required,
          note: patch.actionRequired.note ?? null,
        },
        assignees:
          patch.assigneeUserIds === undefined
            ? node.assignees
            : node.assignees.filter((assignee) => patch.assigneeUserIds?.includes(assignee.userId)),
      };
    }
    return {
      ...node,
      children: patchTreeNodes(node.children, nodeId, patch),
    };
  });
}

function patchFlatNodes(nodes: Timeline2Node[], nodeId: string, patch: Timeline2NodePatch): Timeline2Node[] {
  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          title: patch.title ?? node.title,
          description: patch.description === undefined ? node.description : patch.description,
          kind: patch.kind ?? node.kind,
          status: patch.status ?? node.status,
          priority: patch.priority ?? node.priority,
          startDate: patch.startDate === undefined ? node.startDate : patch.startDate,
          dueDate: patch.dueDate === undefined ? node.dueDate : patch.dueDate,
          progress: patch.progress ?? node.progress,
          sortOrder: patch.sortOrder ?? node.sortOrder,
          parentId: patch.parentId === undefined ? node.parentId : patch.parentId,
          actionRequired:
            patch.actionRequired === undefined
              ? node.actionRequired
              : {
                  required: patch.actionRequired.required,
                  note: patch.actionRequired.note ?? null,
                },
        }
      : node,
  );
}

function removeTreeNode(nodes: Timeline2Node[], nodeId: string): Timeline2Node[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({ ...node, children: removeTreeNode(node.children, nodeId) }));
}

function optimisticPatchSnapshot(
  snapshot: Timeline2Snapshot,
  nodeId: string,
  patch: Timeline2NodePatch,
): Timeline2Snapshot {
  return {
    ...snapshot,
    tree: patchTreeNodes(snapshot.tree, nodeId, patch),
    nodes: patchFlatNodes(snapshot.nodes, nodeId, patch),
  };
}

function optimisticDeleteNode(snapshot: Timeline2Snapshot, nodeId: string): Timeline2Snapshot {
  return {
    ...snapshot,
    tree: removeTreeNode(snapshot.tree, nodeId),
    nodes: snapshot.nodes.filter((node) => node.id !== nodeId && node.parentId !== nodeId),
    dependencies: snapshot.dependencies.filter(
      (dependency) => dependency.fromNodeId !== nodeId && dependency.toNodeId !== nodeId,
    ),
  };
}

function optimisticUpsertDependency(
  snapshot: Timeline2Snapshot,
  input: { fromNodeId: string; toNodeId: string; relation?: Timeline2DependencyRelation; lagDays?: number },
): Timeline2Snapshot {
  const existing = snapshot.dependencies.find(
    (dependency) =>
      dependency.fromNodeId === input.fromNodeId && dependency.toNodeId === input.toNodeId,
  );
  const nextDependency: Timeline2Dependency = existing
    ? {
        ...existing,
        relation: input.relation ?? existing.relation,
        lagDays: input.lagDays ?? existing.lagDays,
      }
    : {
        id: `optimistic-${input.fromNodeId}-${input.toNodeId}`,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        relation: input.relation ?? "finish_to_start",
        lagDays: input.lagDays ?? 0,
        createdAt: new Date().toISOString(),
      };
  return {
    ...snapshot,
    dependencies: existing
      ? snapshot.dependencies.map((dependency) =>
          dependency.id === existing.id ? nextDependency : dependency,
        )
      : [...snapshot.dependencies, nextDependency],
  };
}

function optimisticDeleteDependency(snapshot: Timeline2Snapshot, dependencyId: string): Timeline2Snapshot {
  return {
    ...snapshot,
    dependencies: snapshot.dependencies.filter((dependency) => dependency.id !== dependencyId),
  };
}

export function useTimeline2(projectId: string) {
  const qc = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const ai2ConversationIdRef = useRef<string | null>(null);
  const lastUserTurnRef = useRef<string | null>(null);
  const pairNextMessageAsAnswerRef = useRef(false);

  const base = `/api/workspace/timeline2/projects/${encodeURIComponent(projectId)}`;
  const snapshotKey = timeline2SnapshotQueryKey(projectId);
  const preferencesKey = timeline2PreferencesQueryKey(projectId);
  const criticalPathKey = timeline2CriticalPathQueryKey(projectId);

  const snapshotQuery = useQuery({
    queryKey: snapshotKey,
    queryFn: async (): Promise<Timeline2Snapshot> => {
      await apiJson<{ planId: string }>(`${base}/ensure`, { method: "POST" });
      return apiJson<Timeline2Snapshot>(`${base}/snapshot`);
    },
  });

  const preferencesQuery = useQuery({
    queryKey: preferencesKey,
    queryFn: async (): Promise<Timeline2UserPreferences> =>
      apiJson<Timeline2UserPreferences>(`${base}/preferences`),
  });

  const criticalPathQuery = useQuery({
    queryKey: criticalPathKey,
    queryFn: async (): Promise<Timeline2CriticalPathResult> =>
      apiJson<Timeline2CriticalPathResult>(`${base}/critical-path`),
  });

  const invalidateSnapshotBundle = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: snapshotKey }),
      qc.invalidateQueries({ queryKey: criticalPathKey }),
    ]);
  }, [criticalPathKey, qc, snapshotKey]);

  const createNodeMutation = useMutation({
    mutationFn: async (input: Timeline2NodeInput) =>
      apiJson<{ id: string }>(`${base}/nodes`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: () => {
      setLocalError(null);
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSuccess: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async (input: { nodeId: string; patch: Timeline2NodePatch }) => {
      if (isTimeline2SyntheticProjectRootId(input.nodeId)) {
        throw new Error("The display-only project row cannot be updated.");
      }
      return apiJson<{ id: string }>(`/api/workspace/timeline2/nodes/${encodeURIComponent(input.nodeId)}`, {
        method: "PATCH",
        body: JSON.stringify(input.patch),
      });
    },
    onMutate: async (input) => {
      setLocalError(null);
      if (isTimeline2SyntheticProjectRootId(input.nodeId)) return { previousSnapshot: undefined };
      const shouldOptimisticallyPatch =
        input.patch.parentId === undefined &&
        input.patch.sortOrder === undefined &&
        input.patch.kind === undefined;
      if (!shouldOptimisticallyPatch) return { previousSnapshot: undefined };
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previousSnapshot = qc.getQueryData<Timeline2Snapshot>(snapshotKey);
      if (previousSnapshot) {
        const patched = optimisticPatchSnapshot(previousSnapshot, input.nodeId, input.patch);
        const nextSnap = recomputeTimeline2Rollups(patched);
        qc.setQueryData<Timeline2Snapshot>(snapshotKey, nextSnap);
        if (process.env.NODE_ENV === "development") {
          const child = nextSnap.nodes.find((node) => node.id === input.nodeId);
          const parentId = child?.parentId ?? null;
          const logProgress = input.patch.progress !== undefined;
          const logStatus =
            input.patch.status !== undefined && child?.kind === "task";
          const logDates =
            (input.patch.startDate !== undefined || input.patch.dueDate !== undefined) &&
            child?.kind === "task";

          if (child && parentId && (logProgress || logStatus || logDates)) {
            const emptyCollapsed = new Set<string>();
            const prevParentRow = buildTimelineGanttVisibleRows(
              {
                nodes: previousSnapshot.nodes,
                tree: previousSnapshot.tree,
                dependencies: previousSnapshot.dependencies,
              },
              emptyCollapsed,
            ).find((row) => row.id === parentId);
            const nextParentRow = buildTimelineGanttVisibleRows(
              {
                nodes: nextSnap.nodes,
                tree: nextSnap.tree,
                dependencies: nextSnap.dependencies,
              },
              emptyCollapsed,
            ).find((row) => row.id === parentId);

            if (logProgress) {
              const prevParent = previousSnapshot.nodes.find((node) => node.id === parentId);
              const nextParent = nextSnap.nodes.find((node) => node.id === parentId);
              console.info("[Timeline2 optimistic rollup probe]", {
                kind: "progress",
                editedChildId: child.id,
                editedChildProgress: child.progress,
                parentId,
                parentStoredProgress: nextParent?.progress ?? null,
                parentDisplayProgress: nextParentRow?.displayProgress ?? nextParent?.progress ?? null,
                parentStoredProgressBefore: prevParent?.progress ?? null,
                parentDisplayProgressBefore: prevParentRow?.displayProgress ?? prevParent?.progress ?? null,
                parentDisplayProgressChangedBeforeRefetch:
                  prevParentRow != null &&
                  nextParentRow != null &&
                  prevParentRow.displayProgress !== nextParentRow.displayProgress,
              });
            }

            if (logStatus) {
              console.info("[Timeline2 optimistic rollup probe]", {
                kind: "status",
                editedChildId: child.id,
                editedChildStatus: child.status,
                parentId,
                parentDisplayStatusPrevious: prevParentRow?.displayStatus ?? null,
                parentDisplayStatusNext: nextParentRow?.displayStatus ?? null,
                parentDisplayStatusChangedBeforeRefetch:
                  prevParentRow != null &&
                  nextParentRow != null &&
                  prevParentRow.displayStatus !== nextParentRow.displayStatus,
              });
            }

            if (logDates) {
              console.info("[Timeline2 optimistic rollup probe]", {
                kind: "dates",
                editedChildId: child.id,
                editedChildStartDate: child.startDate,
                editedChildDueDate: child.dueDate,
                parentId,
                parentDisplayStartDatePrevious: prevParentRow?.displayStartDate ?? null,
                parentDisplayDueDatePrevious: prevParentRow?.displayDueDate ?? null,
                parentDisplayStartDateNext: nextParentRow?.displayStartDate ?? null,
                parentDisplayDueDateNext: nextParentRow?.displayDueDate ?? null,
                parentSummarySpanChangedBeforeRefetch:
                  prevParentRow != null &&
                  nextParentRow != null &&
                  (prevParentRow.displayStartDate !== nextParentRow.displayStartDate ||
                    prevParentRow.displayDueDate !== nextParentRow.displayDueDate),
              });
            }
          }
        }
      }
      return { previousSnapshot };
    },
    onError: (error, _input, context) => {
      if (context?.previousSnapshot) {
        qc.setQueryData(snapshotKey, context.previousSnapshot);
      }
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSettled: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: string) =>
      apiJson<{ id: string }>(`/api/workspace/timeline2/nodes/${encodeURIComponent(nodeId)}`, {
        method: "DELETE",
      }),
    onMutate: async (nodeId) => {
      setLocalError(null);
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previousSnapshot = qc.getQueryData<Timeline2Snapshot>(snapshotKey);
      if (previousSnapshot) {
        qc.setQueryData<Timeline2Snapshot>(
          snapshotKey,
          recomputeTimeline2Rollups(optimisticDeleteNode(previousSnapshot, nodeId)),
        );
      }
      return { previousSnapshot };
    },
    onError: (error, _nodeId, context) => {
      if (context?.previousSnapshot) {
        qc.setQueryData(snapshotKey, context.previousSnapshot);
      }
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSettled: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const createDependencyMutation = useMutation({
    mutationFn: async (input: {
      fromNodeId: string;
      toNodeId: string;
      relation?: Timeline2DependencyRelation;
      lagDays?: number;
    }) =>
      apiJson<{ id: string }>(`${base}/dependencies`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      setLocalError(null);
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previousSnapshot = qc.getQueryData<Timeline2Snapshot>(snapshotKey);
      if (previousSnapshot) {
        qc.setQueryData<Timeline2Snapshot>(
          snapshotKey,
          recomputeTimeline2Rollups(optimisticUpsertDependency(previousSnapshot, input)),
        );
      }
      return { previousSnapshot };
    },
    onError: (error, _input, context) => {
      if (context?.previousSnapshot) {
        qc.setQueryData(snapshotKey, context.previousSnapshot);
      }
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSettled: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: async (dependencyId: string) =>
      apiJson<{ id: string }>(`/api/workspace/timeline2/dependencies/${encodeURIComponent(dependencyId)}`, {
        method: "DELETE",
      }),
    onMutate: async (dependencyId) => {
      setLocalError(null);
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previousSnapshot = qc.getQueryData<Timeline2Snapshot>(snapshotKey);
      if (previousSnapshot) {
        qc.setQueryData<Timeline2Snapshot>(
          snapshotKey,
          recomputeTimeline2Rollups(optimisticDeleteDependency(previousSnapshot, dependencyId)),
        );
      }
      return { previousSnapshot };
    },
    onError: (error, _dependencyId, context) => {
      if (context?.previousSnapshot) {
        qc.setQueryData(snapshotKey, context.previousSnapshot);
      }
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSettled: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const acceptBranchMutation = useMutation({
    mutationFn: async (input: { branchId: string; operationIds?: string[] }) =>
      apiJson<{ branchId: string; snapshot: Timeline2Snapshot }>(
        `/api/workspace/timeline2/branches/${encodeURIComponent(input.branchId)}/accept`,
        {
          method: "POST",
          body: JSON.stringify(input.operationIds ? { operationIds: input.operationIds } : {}),
        },
      ),
    onMutate: () => setLocalError(null),
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSuccess: async (result) => {
      qc.setQueryData(snapshotKey, result.snapshot);
      await qc.invalidateQueries({ queryKey: criticalPathKey });
    },
  });

  const rejectBranchMutation = useMutation({
    mutationFn: async (input: { branchId: string; operationIds?: string[] }) =>
      apiJson<{ branchId: string }>(
        `/api/workspace/timeline2/branches/${encodeURIComponent(input.branchId)}/reject`,
        {
          method: "POST",
          body: JSON.stringify(input.operationIds ? { operationIds: input.operationIds } : {}),
        },
      ),
    onMutate: () => setLocalError(null),
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSuccess: async () => {
      await invalidateSnapshotBundle();
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (preferences: Timeline2UserPreferences) =>
      apiJson<Timeline2UserPreferences>(`${base}/preferences`, {
        method: "PUT",
        body: JSON.stringify(preferences),
      }),
    onMutate: async (preferences) => {
      setLocalError(null);
      await qc.cancelQueries({ queryKey: preferencesKey });
      const previousPreferences = qc.getQueryData<Timeline2UserPreferences>(preferencesKey);
      qc.setQueryData<Timeline2UserPreferences>(preferencesKey, preferences);
      return { previousPreferences };
    },
    onError: (error, _preferences, context) => {
      if (context?.previousPreferences) {
        qc.setQueryData(preferencesKey, context.previousPreferences);
      }
      setLocalError(error instanceof Error ? error.message : "Timeline 2 mutation failed.");
    },
    onSuccess: (preferences) => {
      qc.setQueryData(preferencesKey, preferences);
    },
  });

  const refresh = useCallback(async () => {
    setLocalError(null);
    const [snapshotResult] = await Promise.allSettled([
      snapshotQuery.refetch(),
      preferencesQuery.refetch(),
      criticalPathQuery.refetch(),
    ]);
    if (snapshotResult.status === "rejected") {
      throw snapshotResult.reason;
    }
  }, [criticalPathQuery, preferencesQuery, snapshotQuery]);

  const runAi = useCallback(async (
    message: string,
    onEvent: (event: Timeline2ChatStreamEvent) => void,
  ): Promise<void> => {
    setAiBusy(true);
    setLocalError(null);
    try {
      const streamState: Timeline2AiStreamState = {
        conversationId: ai2ConversationIdRef.current,
        lastUserTurn: lastUserTurnRef.current,
        pairNextMessageAsAnswer: pairNextMessageAsAnswerRef.current,
      };
      const { payload, nextState } = buildTimeline2AiRequestPayload(message, streamState);
      ai2ConversationIdRef.current = nextState.conversationId;
      lastUserTurnRef.current = nextState.lastUserTurn;
      pairNextMessageAsAnswerRef.current = nextState.pairNextMessageAsAnswer;

      const response = await fetch(`${base}/ai2/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok || !response.body) {
        const data = await readJson<{ error?: string }>(response);
        throw new Error(data.error ?? "Timeline 2 AI failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsedBuffer = parseTimeline2SseBuffer(buffer);
        buffer = parsedBuffer.rest;
        for (const event of parsedBuffer.events) {
          const updatedState = applyTimeline2AiStreamEvent(
            {
              conversationId: ai2ConversationIdRef.current,
              lastUserTurn: lastUserTurnRef.current,
              pairNextMessageAsAnswer: pairNextMessageAsAnswerRef.current,
            },
            event,
          );
          ai2ConversationIdRef.current = updatedState.conversationId;
          lastUserTurnRef.current = updatedState.lastUserTurn;
          pairNextMessageAsAnswerRef.current = updatedState.pairNextMessageAsAnswer;
          if (event.type !== "keepalive") onEvent(event);
        }
      }
      await invalidateSnapshotBundle();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Timeline 2 AI failed.";
      setLocalError(messageText);
      onEvent({ type: "error", message: messageText });
    } finally {
      setAiBusy(false);
    }
  }, [base, invalidateSnapshotBundle]);

  return {
    snapshot: snapshotQuery.data ?? null,
    preferences: normalizeTimeline2UserPreferences(preferencesQuery.data ?? DEFAULT_TIMELINE2_PREFERENCES),
    criticalPath: criticalPathQuery.data ?? null,
    loading: snapshotQuery.isLoading,
    error:
      localError
      ?? (snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null),
    busy:
      aiBusy ||
      createNodeMutation.isPending ||
      updateNodeMutation.isPending ||
      deleteNodeMutation.isPending ||
      createDependencyMutation.isPending ||
      deleteDependencyMutation.isPending ||
      acceptBranchMutation.isPending ||
      rejectBranchMutation.isPending ||
      updatePreferencesMutation.isPending,
    refresh,
    createNode: async (input: Timeline2NodeInput) => createNodeMutation.mutateAsync(input),
    updateNode: async (nodeId: string, patch: Timeline2NodePatch) =>
      updateNodeMutation.mutateAsync({ nodeId, patch }),
    deleteNode: async (nodeId: string) => deleteNodeMutation.mutateAsync(nodeId),
    createDependency: async (input: {
      fromNodeId: string;
      toNodeId: string;
      relation?: Timeline2DependencyRelation;
      lagDays?: number;
    }) => createDependencyMutation.mutateAsync(input),
    deleteDependency: async (dependencyId: string) => deleteDependencyMutation.mutateAsync(dependencyId),
    acceptBranch: async (branchId: string, operationIds?: string[]) =>
      acceptBranchMutation.mutateAsync({ branchId, operationIds }),
    rejectBranch: async (branchId: string, operationIds?: string[]) =>
      rejectBranchMutation.mutateAsync({ branchId, operationIds }),
    updatePreferences: async (preferences: Timeline2UserPreferences) =>
      updatePreferencesMutation.mutateAsync(preferences),
    runAi,
  };
}

export type Timeline2RunAiEvent = Timeline2ChatStreamEvent;
export type { Timeline2Branch };
