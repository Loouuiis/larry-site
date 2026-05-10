import type {
  Timeline2Dependency,
  Timeline2Node,
  Timeline2Status,
} from "@larry/shared";

export interface Timeline2ScheduleNode
  extends Pick<
    Timeline2Node,
    "id" | "parentId" | "kind" | "title" | "startDate" | "dueDate" | "status" | "sortOrder" | "createdAt"
  > {}

export interface Timeline2CriticalPathMetrics {
  anchorIso: string;
  criticalNodeIds: string[];
  floatDaysByNodeId: Record<string, number | null>;
  projectedEndDate: string;
  warnings: string[];
}

function diffDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function nodeDurationDays(node: Pick<Timeline2ScheduleNode, "startDate" | "dueDate">) {
  if (!node.startDate || !node.dueDate) return 1;
  return Math.max(1, diffDays(node.startDate, node.dueDate) + 1);
}

function rootAncestorId(nodeId: string, byId: Map<string, Timeline2ScheduleNode>) {
  let cursor = byId.get(nodeId) ?? null;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    const parent = byId.get(cursor.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor?.id ?? nodeId;
}

function inferFallbackCriticalIds(
  nodes: Timeline2ScheduleNode[],
  byId: Map<string, Timeline2ScheduleNode>,
  rootNodeId?: string | null,
) {
  const actionable = nodes.filter((node) => node.kind !== "group");
  const filtered = actionable.filter((node) => {
    const rootId = rootAncestorId(node.id, byId);
    return rootNodeId ? rootId === rootNodeId : true;
  });
  const dated = filtered.filter((node) => node.startDate || node.dueDate);
  if (dated.length < 2) {
    return {
      criticalNodeIds: [],
      warnings: ["There are not enough dated tasks to infer a credible critical path."],
    };
  }

  const grouped = new Map<string, Timeline2ScheduleNode[]>();
  for (const node of dated) {
    const rootId = rootAncestorId(node.id, byId);
    const list = grouped.get(rootId) ?? [];
    list.push(node);
    grouped.set(rootId, list);
  }

  const best = [...grouped.entries()]
    .map(([candidateRootId, items]) => {
      const sorted = [...items].sort((a, b) =>
        (a.startDate ?? a.dueDate ?? "9999-12-31").localeCompare(b.startDate ?? b.dueDate ?? "9999-12-31") ||
        (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.localeCompare(b.createdAt),
      );
      const totalDurationDays = sorted.reduce((sum, node) => sum + nodeDurationDays(node), 0);
      return { rootId: candidateRootId, nodes: sorted, totalDurationDays };
    })
    .sort((a, b) => b.totalDurationDays - a.totalDurationDays || b.nodes.length - a.nodes.length)[0];

  if (!best || best.nodes.length < 2) {
    return {
      criticalNodeIds: [],
      warnings: ["No usable dated sequence could be inferred from the current plan."],
    };
  }

  const totalActionable = actionable.filter((node) => rootAncestorId(node.id, byId) === best.rootId).length;
  const coverage = totalActionable === 0 ? 0 : best.nodes.length / totalActionable;
  return {
    criticalNodeIds: best.nodes.map((node) => node.id),
    warnings:
      coverage < 0.8
        ? ["Some tasks in this workstream are missing dates, so the inferred path is only partial."]
        : [],
  };
}

function isActiveScheduleStatus(status: Timeline2Status) {
  return status !== "completed" && status !== "cancelled";
}

export function computeTimeline2CriticalPathMetrics(input: {
  nodes: Timeline2ScheduleNode[];
  dependencies: Array<Pick<Timeline2Dependency, "fromNodeId" | "toNodeId" | "relation" | "lagDays">>;
  todayIso: string;
  rootNodeId?: string | null;
}): Timeline2CriticalPathMetrics {
  const { nodes, dependencies, todayIso, rootNodeId } = input;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const actionable = nodes.filter((node) => node.kind !== "group");
  const actionableIds = new Set(
    actionable
      .filter((node) => (rootNodeId ? rootAncestorId(node.id, byId) === rootNodeId : true))
      .map((node) => node.id),
  );

  const datedAnchors: string[] = [];
  for (const node of actionable) {
    if (!actionableIds.has(node.id)) continue;
    if (node.startDate) datedAnchors.push(node.startDate);
    if (node.dueDate) datedAnchors.push(node.dueDate);
  }
  const anchorIso = datedAnchors.length > 0 ? datedAnchors.slice().sort()[0]! : todayIso;

  const fsDeps = dependencies.filter(
    (dependency) =>
      dependency.relation === "finish_to_start" &&
      actionableIds.has(dependency.fromNodeId) &&
      actionableIds.has(dependency.toNodeId),
  );

  const duration = new Map<string, number>();
  for (const node of actionable) {
    if (!actionableIds.has(node.id)) continue;
    duration.set(node.id, nodeDurationDays(node));
  }

  const preds = new Map<string, Array<{ nodeId: string; lagDays: number }>>();
  const succs = new Map<string, Array<{ nodeId: string; lagDays: number }>>();
  for (const id of actionableIds) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const dependency of fsDeps) {
    preds.get(dependency.toNodeId)!.push({ nodeId: dependency.fromNodeId, lagDays: dependency.lagDays ?? 0 });
    succs.get(dependency.fromNodeId)!.push({ nodeId: dependency.toNodeId, lagDays: dependency.lagDays ?? 0 });
  }

  const indegree = new Map<string, number>();
  for (const id of actionableIds) indegree.set(id, 0);
  for (const dependency of fsDeps) {
    indegree.set(dependency.toNodeId, (indegree.get(dependency.toNodeId) ?? 0) + 1);
  }

  const queue = [...actionableIds].filter((id) => (indegree.get(id) ?? 0) === 0);
  const topo: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    for (const successor of succs.get(id) ?? []) {
      indegree.set(successor.nodeId, (indegree.get(successor.nodeId) ?? 1) - 1);
      if (indegree.get(successor.nodeId) === 0) queue.push(successor.nodeId);
    }
  }

  const warnings: string[] = [];
  const useFallback = fsDeps.length === 0 || topo.length !== actionableIds.size;
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const floatDays = new Map<string, number | null>();
  const criticalIds = new Set<string>();

  if (useFallback) {
    if (fsDeps.length === 0) {
      warnings.push("There are no finish-to-start dependencies, so the critical path is inferred from dated tasks.");
    } else {
      warnings.push("The dependency graph contains a cycle, so the critical path is inferred from dated tasks.");
    }
    const inferred = inferFallbackCriticalIds(nodes, byId, rootNodeId);
    for (const id of inferred.criticalNodeIds) criticalIds.add(id);
    warnings.push(...inferred.warnings);

    let projectEndExclusive = 0;
    for (const node of actionable) {
      if (!actionableIds.has(node.id)) continue;
      const dur = duration.get(node.id)!;
      let startOffset = 0;
      if (node.startDate) startOffset = Math.max(0, diffDays(anchorIso, node.startDate));
      else if (node.dueDate) startOffset = Math.max(0, diffDays(anchorIso, node.dueDate) - dur + 1);
      es.set(node.id, startOffset);
      const endExclusive = startOffset + dur;
      ef.set(node.id, endExclusive);
      projectEndExclusive = Math.max(projectEndExclusive, endExclusive);
      floatDays.set(node.id, criticalIds.has(node.id) ? 0 : null);
    }
    const projectedEndDate =
      projectEndExclusive > 0 ? shiftIsoDate(anchorIso, Math.max(0, projectEndExclusive - 1)) : todayIso;
    return {
      anchorIso,
      criticalNodeIds: [...criticalIds],
      floatDaysByNodeId: Object.fromEntries([...floatDays.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      projectedEndDate,
      warnings,
    };
  }

  for (const id of topo) {
    let start = 0;
    for (const predecessor of preds.get(id) ?? []) {
      start = Math.max(start, (ef.get(predecessor.nodeId) ?? 0) + predecessor.lagDays);
    }
    const node = byId.get(id)!;
    if (node.startDate) {
      start = Math.max(start, diffDays(anchorIso, node.startDate));
    }
    es.set(id, start);
    ef.set(id, start + duration.get(id)!);
  }

  let projectEndExclusive = 0;
  for (const id of actionableIds) {
    projectEndExclusive = Math.max(projectEndExclusive, ef.get(id) ?? 0);
  }

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...topo].reverse()) {
    const outgoing = succs.get(id) ?? [];
    if (outgoing.length > 0) {
      const minLs = Math.min(...outgoing.map((successor) => (ls.get(successor.nodeId) ?? projectEndExclusive) - successor.lagDays));
      lf.set(id, minLs);
    } else {
      lf.set(id, projectEndExclusive);
    }
    ls.set(id, lf.get(id)! - duration.get(id)!);
  }

  for (const id of actionableIds) {
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    const rounded = Math.max(0, Math.round(totalFloat));
    floatDays.set(id, rounded);
    if (rounded === 0 && isActiveScheduleStatus(byId.get(id)?.status ?? "not_started")) {
      criticalIds.add(id);
    }
  }

  const projectedEndDate =
    projectEndExclusive > 0 ? shiftIsoDate(anchorIso, Math.max(0, projectEndExclusive - 1)) : todayIso;
  return {
    anchorIso,
    criticalNodeIds: [...criticalIds],
    floatDaysByNodeId: Object.fromEntries([...floatDays.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    projectedEndDate,
    warnings,
  };
}
