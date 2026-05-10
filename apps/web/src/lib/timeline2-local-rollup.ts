import type {
  Timeline2Dependency,
  Timeline2Node,
  Timeline2Snapshot,
} from "@larry/shared";
import { computeTimeline2RollupAggregateForSummaryNode } from "@larry/shared/timeline2-rollup";
import { diffDays } from "../components/workspace/timeline2/timeline2-ui";

function sortTree(nodes: Timeline2Node[]) {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  for (const node of nodes) sortTree(node.children);
}

function linkTemplatesToCanonicalRoots(
  templateRoots: Timeline2Node[],
  byId: Map<string, Timeline2Node>,
): Timeline2Node[] {
  return templateRoots.flatMap((template) => {
    const node = byId.get(template.id);
    if (!node) return [];
    node.children = linkTemplatesToCanonicalRoots(template.children, byId);
    return [node];
  });
}

function buildDependencyWarnings(
  nodes: Timeline2Node[],
  dependencies: Timeline2Dependency[],
): Map<string, number> {
  const nodeDates = new Map(nodes.map((node) => [node.id, node]));
  const dependencyWarningsByNode = new Map<string, number>();
  for (const dep of dependencies) {
    const from = nodeDates.get(dep.fromNodeId);
    const to = nodeDates.get(dep.toNodeId);
    if (from?.dueDate && to?.startDate) {
      const earlyStartDays = diffDays(to.startDate, from.dueDate) + (dep.lagDays ?? 0);
      if (earlyStartDays > 0) {
        dependencyWarningsByNode.set(
          dep.toNodeId,
          (dependencyWarningsByNode.get(dep.toNodeId) ?? 0) + 1,
        );
      }
    }
  }
  return dependencyWarningsByNode;
}

/**
 * Mirrors `buildSnapshot` → `computeRollup` in the API so optimistic edits refresh parent rollups
 * immediately without waiting for refetch. Does **not** recompute critical-path flags.
 */
export function recomputeTimeline2Rollups(snapshot: Timeline2Snapshot): Timeline2Snapshot {
  let cloned: Timeline2Snapshot;
  try {
    cloned = structuredClone(snapshot);
  } catch {
    return snapshot;
  }

  const byId = new Map(cloned.nodes.map((node) => [node.id, node]));

  const roots = linkTemplatesToCanonicalRoots(cloned.tree, byId);
  sortTree(roots);
  cloned.tree = roots;

  const dependencyWarningsByNode = buildDependencyWarnings(cloned.nodes, cloned.dependencies);

  function computeRollup(node: Timeline2Node, seen = new Set<string>()): Timeline2Node["rollup"] {
    if (seen.has(node.id)) return node.rollup;
    seen.add(node.id);

    const childRollups = node.children.map((child) => computeRollup(child, new Set(seen)));

    if (node.children.length === 0) {
      node.rollup = {
        healthStatus: node.status,
        priority: node.priority,
        startDate: node.startDate,
        dueDate: node.dueDate,
        assignees: [...node.assignees],
        actionRequiredCount: node.actionRequired.required ? 1 : 0,
        dependencyWarningCount: dependencyWarningsByNode.get(node.id) ?? 0,
        descendantCount: 0,
      };
      return node.rollup;
    }

    const childInputs = node.children.map((child, i) => ({
      rollup: childRollups[i]!,
      progress: child.progress,
      directAssignees: child.assignees,
    }));

    const { rollup, weightedProgress } = computeTimeline2RollupAggregateForSummaryNode({
      children: childInputs,
      nodeOwnActionRequired: node.actionRequired.required,
      nodeDependencyWarnings: dependencyWarningsByNode.get(node.id) ?? 0,
    });

    node.rollup = rollup;
    node.progress = weightedProgress;

    return node.rollup;
  }

  for (const root of roots) computeRollup(root);

  return cloned;
}
