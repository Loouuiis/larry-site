"use client";

import { create } from "zustand";
import type { NodeSheetState } from "./timeline2-ui";

type TaskCenterFocusRequest =
  | { type: "parent" | "dependency"; nodeId: string }
  | null;

type Timeline2DragState =
  | {
      nodeId: string;
      mode: "move" | "resize_start" | "resize_end";
      startDate: string | null;
      dueDate: string | null;
      previewStartDate: string | null;
      previewDueDate: string | null;
    }
  | null;

interface Timeline2UiState {
  sheet: NodeSheetState | null;
  aiOpen: boolean;
  dependencyMode: boolean;
  taskCenterFocusRequest: TaskCenterFocusRequest;
  timelineDependencySourceId: string | null;
  collapsedNodeIds: string[];
  dragState: Timeline2DragState;
  setSheet: (sheet: NodeSheetState | null) => void;
  setAiOpen: (open: boolean) => void;
  setDependencyMode: (next: boolean) => void;
  setTaskCenterFocusRequest: (request: TaskCenterFocusRequest) => void;
  setTimelineDependencySourceId: (nodeId: string | null) => void;
  setCollapsedNodeIds: (nodeIds: string[]) => void;
  toggleCollapsedNodeId: (nodeId: string) => void;
  setDragState: (dragState: Timeline2DragState) => void;
  reset: () => void;
}

const initialState = {
  sheet: null,
  aiOpen: false,
  dependencyMode: false,
  taskCenterFocusRequest: null,
  timelineDependencySourceId: null,
  collapsedNodeIds: [],
  dragState: null,
} satisfies Omit<
  Timeline2UiState,
  | "setSheet"
  | "setAiOpen"
  | "setDependencyMode"
  | "setTaskCenterFocusRequest"
  | "setTimelineDependencySourceId"
  | "setCollapsedNodeIds"
  | "toggleCollapsedNodeId"
  | "setDragState"
  | "reset"
>;

export const useTimeline2UiStore = create<Timeline2UiState>((set) => ({
  ...initialState,
  setSheet: (sheet) => set({ sheet }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setDependencyMode: (dependencyMode) => set({ dependencyMode }),
  setTaskCenterFocusRequest: (taskCenterFocusRequest) => set({ taskCenterFocusRequest }),
  setTimelineDependencySourceId: (timelineDependencySourceId) => set({ timelineDependencySourceId }),
  setCollapsedNodeIds: (collapsedNodeIds) => set({ collapsedNodeIds }),
  toggleCollapsedNodeId: (nodeId) =>
    set((state) => ({
      collapsedNodeIds: state.collapsedNodeIds.includes(nodeId)
        ? state.collapsedNodeIds.filter((id) => id !== nodeId)
        : [...state.collapsedNodeIds, nodeId],
    })),
  setDragState: (dragState) => set({ dragState }),
  reset: () => set(initialState),
}));
