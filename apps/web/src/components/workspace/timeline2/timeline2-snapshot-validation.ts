import type { Timeline2Node, Timeline2Snapshot } from "@larry/shared";

export type TimelineSnapshotValidationPayload = Pick<Timeline2Snapshot, "nodes" | "tree" | "dependencies">;

export interface TimelineSnapshotValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** DFS descendant totals matching backend `computeRollup` descendantCount semantics. */
function descendantTotalBelow(node: Timeline2Node): number {
  return node.children.reduce((sum, child) => sum + 1 + descendantTotalBelow(child), 0);
}

function collectTreeNodes(nodes: Timeline2Node[], map = new Map<string, Timeline2Node>()) {
  for (const node of nodes) {
    map.set(node.id, node);
    collectTreeNodes(node.children, map);
  }
  return map;
}

function parentWalkStartsCycle(byId: Map<string, Timeline2Node>, startId: string): boolean {
  const visited = new Set<string>();
  let cur: string | null = startId;
  while (cur !== null) {
    if (visited.has(cur)) return true;
    visited.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/**
 * Dev-only frontend diagnostics for Timeline 2 snapshot integrity (shape sanity checks).
 * Does not mutate backend contracts — validates payloads already on the wire.
 */
export function validateTimelineSnapshot(
  payload: TimelineSnapshotValidationPayload,
  options?: { criticalPathNodeIds?: string[]; label?: string },
): TimelineSnapshotValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = options?.label ?? "";

  const { nodes, tree, dependencies } = payload;
  const prefix = label ? `[${label}] ` : "";

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const idDuplicates = new Map<string, number>();
  for (const node of nodes) {
    idDuplicates.set(node.id, (idDuplicates.get(node.id) ?? 0) + 1);
  }
  for (const [id, count] of idDuplicates) {
    if (count > 1) errors.push(`${prefix}duplicate node id "${id}" (${count} occurrences)`);
  }

  const treeMap = collectTreeNodes(tree);

  // 1 Parent refs + 2 upward cycle detection (single emission — walks terminate unless corrupted pointers repeat).
  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      errors.push(`${prefix}node ${node.id} parentId ${node.parentId} missing from snapshot.nodes`);
    }
  }
  let cycleDetected = false;
  for (const node of nodes) {
    if (parentWalkStartsCycle(byId, node.id)) {
      cycleDetected = true;
      break;
    }
  }
  if (cycleDetected) errors.push(`${prefix}parentId pointers contain at least one cycle`);

  const flatIds = new Set(nodes.map((node) => node.id));
  const treeIds = new Set(treeMap.keys());

  // 3–4 Tree ↔ flat identity contract (same ids, same cardinality).
  if (flatIds.size !== treeIds.size || flatIds.size !== nodes.length) {
    errors.push(
      `${prefix}tree vs flat count mismatch (nodes=${nodes.length}, flatUnique=${flatIds.size}, treeUnique=${treeIds.size})`,
    );
  }
  for (const id of flatIds) {
    if (!treeIds.has(id)) errors.push(`${prefix}node ${id} in snapshot.nodes but missing from snapshot.tree`);
  }
  for (const id of treeIds) {
    if (!flatIds.has(id)) errors.push(`${prefix}node ${id} in snapshot.tree but missing from snapshot.nodes`);
  }

  // Object identity: flat entries must reference same subtree objects as tree map when ids align.
  for (const node of nodes) {
    const treeNode = treeMap.get(node.id);
    if (!treeNode) continue;
    if (treeNode !== node) {
      warnings.push(
        `${prefix}node ${node.id}: snapshot.tree object differs from snapshot.nodes entry (duplicate subgraph?)`,
      );
    }
  }

  // 5 Roots — flat roots match tree roots one-for-one.
  const rootsFlat = nodes.filter((node) => node.parentId === null).map((node) => node.id).sort();
  const rootsTree = tree.map((node) => node.id).sort();
  if (rootsFlat.join("|") !== rootsTree.join("|")) {
    errors.push(`${prefix}root mismatch flatroots=[${rootsFlat}] treeroots=[${rootsTree}]`);
  }

  // 6 Descendant rollup counts vs tree DFS (proves rollup pass aligned with hierarchy).
  for (const node of nodes) {
    const treeNode = treeMap.get(node.id);
    if (!treeNode) continue;
    const expectedDescendants = descendantTotalBelow(treeNode);
    if (node.rollup.descendantCount !== expectedDescendants) {
      errors.push(
        `${prefix}node ${node.id}: rollup.descendantCount=${node.rollup.descendantCount}, tree-derived=${expectedDescendants}`,
      );
    }
  }

  // Groups / milestones with children — rollup windows exist when subtree has dated leaves (soft warning).
  for (const node of nodes) {
    const treeNode = treeMap.get(node.id);
    if (!treeNode || treeNode.children.length === 0) continue;
    if ((node.kind === "group" || node.kind === "milestone") && node.children.length > 0) {
      if (!node.rollup.startDate && !node.rollup.dueDate) {
        warnings.push(`${prefix}${node.kind} ${node.id} has children but rollup has no start/due window`);
      }
    }
  }

  // 7 Dependencies reference nodes.
  for (const dependency of dependencies) {
    if (!byId.has(dependency.fromNodeId)) {
      errors.push(`${prefix}dependency ${dependency.id} unknown fromNodeId=${dependency.fromNodeId}`);
    }
    if (!byId.has(dependency.toNodeId)) {
      errors.push(`${prefix}dependency ${dependency.id} unknown toNodeId=${dependency.toNodeId}`);
    }
  }

  // 8 Critical path ids — optional external schedule slice must land on real nodes.
  const cpIds = options?.criticalPathNodeIds;
  if (cpIds?.length) {
    for (const cpId of cpIds) {
      if (!byId.has(cpId)) errors.push(`${prefix}criticalPathNodeIds references unknown node ${cpId}`);
    }
    const flagged = new Set(nodes.filter((node) => node.isCriticalPath).map((node) => node.id));
    const missingFlag = cpIds.filter((id) => !flagged.has(id));
    if (missingFlag.length > 0) {
      warnings.push(
        `${prefix}criticalPathNodeIds not all flagged isCriticalPath on snapshot: ${missingFlag.slice(0, 12).join(",")}${missingFlag.length > 12 ? "…" : ""}`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
