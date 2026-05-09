import type {
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
  Timeline2Status,
} from "@larry/shared";
import type { Timeline2NodePatch } from "@/hooks/useTimeline2";
import {
  flattenTreeWithOutline,
  KIND_LABELS,
  normalizeText,
  type OutlineTimeline2Node,
} from "./timeline2-ui";

export type ViewMode = "outline" | "status" | "people";
export type StatusFilter = Timeline2Status | "all";
export type DependencyDirection = "blocked_by" | "unblocks";

export const STATUS_GROUPS: Timeline2Status[] = [
  "in_progress",
  "blocked",
  "waiting",
  "not_started",
  "completed",
  "cancelled",
];

export function createDraft(patch: Timeline2NodePatch = {}) {
  return {
    title: "",
    kind: "task" as const,
    status: patch.status ?? "not_started",
    priority: patch.priority ?? "medium",
    parentId: patch.parentId ?? null,
    assigneeUserIds: patch.assigneeUserIds ?? [],
    actionRequired: { required: false, note: null },
  };
}

export function visibleRows(
  nodes: Timeline2Node[],
  tree: Timeline2Node[],
  collapsedNodes: Set<string>,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return flattenTreeWithOutline(tree).filter(({ node }) => {
    let parent = node.parentId ? byId.get(node.parentId) ?? null : null;
    while (parent) {
      if (collapsedNodes.has(parent.id)) return false;
      parent = parent.parentId ? byId.get(parent.parentId) ?? null : null;
    }
    return true;
  });
}

export function cloneTree(nodes: Timeline2Node[]): Timeline2Node[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children),
  }));
}

export function removeNode(
  nodes: Timeline2Node[],
  nodeId: string,
): { next: Timeline2Node[]; removed: Timeline2Node | null } {
  const next: Timeline2Node[] = [];
  let removed: Timeline2Node | null = null;
  for (const node of nodes) {
    if (node.id === nodeId) {
      removed = { ...node, children: cloneTree(node.children) };
      continue;
    }
    const result = removeNode(node.children, nodeId);
    if (result.removed) {
      removed = result.removed;
      next.push({ ...node, children: result.next });
      continue;
    }
    next.push({ ...node, children: cloneTree(node.children) });
  }
  return { next, removed };
}

export function insertNode(
  nodes: Timeline2Node[],
  parentId: string | null,
  node: Timeline2Node,
): Timeline2Node[] {
  if (parentId === null) return [...nodes, { ...node, parentId: null }];
  return nodes.map((item) => {
    if (item.id === parentId) {
      return {
        ...item,
        children: [...cloneTree(item.children), { ...node, parentId }],
      };
    }
    return {
      ...item,
      children: insertNode(item.children, parentId, node),
    };
  });
}

export function projectedWbs(
  tree: Timeline2Node[],
  sourceNodeId: string,
  parentId: string | null,
): string | null {
  const cloned = cloneTree(tree);
  const removed = removeNode(cloned, sourceNodeId);
  if (!removed.removed) return null;
  const inserted = insertNode(removed.next, parentId, removed.removed);
  return flattenTreeWithOutline(inserted).find((row) => row.node.id === sourceNodeId)?.wbs ?? null;
}

export function dependencyCount(nodeId: string, dependencies: Timeline2Dependency[]) {
  return dependencies.filter(
    (dependency) => dependency.fromNodeId === nodeId || dependency.toNodeId === nodeId,
  ).length;
}

export function rowSearchableText(row: OutlineTimeline2Node) {
  return normalizeText(
    [row.wbs, row.node.title, KIND_LABELS[row.node.kind], ...row.node.assignees.map((a) => a.name)].join(
      " ",
    ),
  );
}

export function relationPreview(
  relation: Timeline2DependencyRelation,
  sourceTitle: string,
  candidateTitle: string,
  direction: DependencyDirection,
) {
  const [from, to] =
    direction === "blocked_by" ? [candidateTitle, sourceTitle] : [sourceTitle, candidateTitle];
  switch (relation) {
    case "finish_to_start":
      return `${from} finishes before ${to} starts.`;
    case "start_to_start":
      return `${from} starts with ${to}.`;
    case "finish_to_finish":
      return `${from} finishes with ${to}.`;
    case "start_to_finish":
      return `${from} starts before ${to} finishes.`;
    default:
      return `${from} links to ${to}.`;
  }
}
