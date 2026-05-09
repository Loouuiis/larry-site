"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Link2,
  Milestone,
  MoveRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import type {
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
} from "@larry/shared";
import { timeline2DisplayStatus } from "@larry/shared/timeline2";
import type { Timeline2NodePatch } from "@/hooks/useTimeline2";
import {
  DEPENDENCY_LABELS,
  formatDate,
  KIND_LABELS,
  nodeToDraft,
  normalizeText,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type NodeSheetState,
  type OutlineTimeline2Node,
} from "./timeline2-ui";
import { PersonAvatar, StatusBadge } from "./Timeline2Primitives";
import {
  STATUS_GROUPS,
  createDraft,
  dependencyCount,
  projectedWbs,
  relationPreview,
  rowSearchableText,
  visibleRows,
  type DependencyDirection,
  type StatusFilter,
  type ViewMode,
} from "./taskcenter2-helpers";

type FocusMode =
  | {
    kind: "parent";
    sourceNodeId: string;
    search: string;
    previewParentId: string | null;
  }
  | {
    kind: "dependency";
    sourceNodeId: string;
    search: string;
    relation: Timeline2DependencyRelation;
    direction: DependencyDirection;
    previewNodeId: string | null;
  }
  | null;

function OutlineGuide({ row, hasChildren, collapsed, onToggle }: {
  row: OutlineTimeline2Node;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center">
      {row.ancestorHasNext.map((hasNext, index) => (
        <span key={`${row.node.id}-ancestor-${index}`} className="relative h-10 w-[18px]">
          {hasNext && <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2" style={{ background: "var(--border)" }} />}
        </span>
      ))}
      {row.depth > 0 && (
        <span className="relative h-10 w-[18px]">
          <span className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2" style={{ background: "var(--border)" }} />
          <span className="absolute left-1/2 top-1/2 h-px w-[18px]" style={{ background: "var(--border)" }} />
          {!row.isLastSibling && <span className="absolute left-1/2 top-1/2 bottom-0 w-px -translate-x-1/2" style={{ background: "var(--border)" }} />}
        </span>
      )}
      {hasChildren ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white"
          aria-label={`Toggle ${row.node.title}`}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      ) : (
        <span className="flex h-6 w-6 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--border)" }} />
        </span>
      )}
    </span>
  );
}

function KindMarker({ row }: { row: OutlineTimeline2Node }) {
  if (row.node.kind === "milestone") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-[6px] border"
        style={{ borderColor: "#c8d0df", background: "#f7f9fc" }}
      >
        <Milestone size={12} style={{ color: "#637089" }} />
      </span>
    );
  }
  if (row.node.kind === "group") {
    return (
      <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: "#6ea97e", background: "#ecf8ee" }} />
    );
  }
  return (
    <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: "#b7c0d0", background: "#ffffff" }} />
  );
}

function PeopleLabel({ row }: { row: OutlineTimeline2Node }) {
  const assignee = row.node.assignees[0] ?? row.node.rollup.assignees[0] ?? null;
  if (!assignee) {
    return <span className="text-[12px]" style={{ color: "var(--text-disabled)" }}>Unassigned</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <PersonAvatar name={assignee.name} />
      <span className="truncate text-[12px] font-medium" style={{ color: "var(--text-2)" }}>
        {assignee.name}
        {(row.node.assignees.length || row.node.rollup.assignees.length) > 1 ? ` +${(row.node.assignees.length || row.node.rollup.assignees.length) - 1}` : ""}
      </span>
    </span>
  );
}

export function TaskCenter2Surface({
  nodes,
  tree,
  dependencies,
  onOpenSheet,
  onPatchNode,
  onCreateDependency,
  onDeleteDependency,
  focusRequest,
  onFocusRequestHandled,
}: {
  nodes: Timeline2Node[];
  tree: Timeline2Node[];
  dependencies: Timeline2Dependency[];
  onOpenSheet: (state: NodeSheetState) => void;
  onPatchNode: (nodeId: string, patch: Timeline2NodePatch) => Promise<unknown>;
  onCreateDependency: (input: {
    fromNodeId: string;
    toNodeId: string;
    relation?: Timeline2DependencyRelation;
  }) => Promise<unknown>;
  onDeleteDependency: (dependencyId: string) => Promise<unknown>;
  focusRequest?: { type: "parent" | "dependency"; nodeId: string } | null;
  onFocusRequestHandled?: () => void;
}) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("outline");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [focusMode, setFocusMode] = useState<FocusMode>(null);

  const applyFocusRequest = useEffectEvent((nextFocusRequest: NonNullable<typeof focusRequest>) => {
    if (nextFocusRequest.type === "parent") {
      setViewMode("outline");
      setFocusMode({
        kind: "parent",
        sourceNodeId: nextFocusRequest.nodeId,
        search: "",
        previewParentId: nodes.find((node) => node.id === nextFocusRequest.nodeId)?.parentId ?? null,
      });
      return;
    }
    setFocusMode({
      kind: "dependency",
      sourceNodeId: nextFocusRequest.nodeId,
      search: "",
      relation: "finish_to_start",
      direction: "unblocks",
      previewNodeId: null,
    });
  });

  const clearMissingFocusMode = useEffectEvent(() => {
    setFocusMode(null);
  });

  useEffect(() => {
    if (!focusRequest) return;
    applyFocusRequest(focusRequest);
    onFocusRequestHandled?.();
  }, [focusRequest, onFocusRequestHandled]);

  const rows = useMemo(() => visibleRows(nodes, tree, collapsedNodes), [collapsedNodes, nodes, tree]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const filteredRows = useMemo(
    () => rows.filter((row) => statusFilter === "all" || timeline2DisplayStatus(row.node) === statusFilter),
    [rows, statusFilter],
  );
  const sourceNode = focusMode ? nodeById.get(focusMode.sourceNodeId) ?? null : null;
  const focusSearch = normalizeText(focusMode?.search ?? "");

  useEffect(() => {
    if (!focusMode) return;
    if (!nodeById.has(focusMode.sourceNodeId)) clearMissingFocusMode();
  }, [focusMode, nodeById]);

  const parentCandidates = useMemo(() => {
    if (!focusMode || focusMode.kind !== "parent" || !sourceNode) return [];
    return rows.map((row) => {
      const valid = row.node.id !== sourceNode.id && !row.parentIds.includes(sourceNode.id) && row.node.kind !== "milestone";
      const matches = !focusSearch || rowSearchableText(row).includes(focusSearch);
      return { row, valid, matches };
    });
  }, [focusMode, focusSearch, rows, sourceNode]);

  const dependencyCandidates = useMemo(() => {
    if (!focusMode || focusMode.kind !== "dependency" || !sourceNode) return [];
    return rows.map((row) => {
      const matches = !focusSearch || rowSearchableText(row).includes(focusSearch);
      const valid = row.node.id !== sourceNode.id;
      const [fromNodeId, toNodeId] = focusMode.direction === "blocked_by"
        ? [row.node.id, sourceNode.id]
        : [sourceNode.id, row.node.id];
      const existing = dependencies.find(
        (dependency) => dependency.fromNodeId === fromNodeId && dependency.toNodeId === toNodeId,
      ) ?? null;
      return { row, valid, matches, existing, fromNodeId, toNodeId };
    });
  }, [dependencies, focusMode, focusSearch, rows, sourceNode]);

  const groupedRows = useMemo(() => {
    if (viewMode === "outline") return [];
    if (viewMode === "status") {
      return STATUS_GROUPS.map((status) => ({
        id: status,
        label: STATUS_LABELS[status],
        rows: filteredRows.filter((row) => timeline2DisplayStatus(row.node) === status),
      })).filter((group) => group.rows.length > 0);
    }
    const groups = new Map<string, { id: string; label: string; rows: OutlineTimeline2Node[] }>();
    for (const row of filteredRows) {
      const assignee = row.node.assignees[0] ?? row.node.rollup.assignees[0] ?? null;
      const key = assignee?.userId ?? "unassigned";
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          label: assignee?.name ?? "Unassigned",
          rows: [],
        });
      }
      groups.get(key)!.rows.push(row);
    }
    return [...groups.values()];
  }, [filteredRows, viewMode]);

  const previewParentLabel = useMemo(() => {
    if (!focusMode || focusMode.kind !== "parent" || !sourceNode) return null;
    if (focusMode.previewParentId === null) {
      const wbs = projectedWbs(tree, sourceNode.id, null);
      return { wbs, label: "Top level" };
    }
    const candidate = rows.find((row) => row.node.id === focusMode.previewParentId);
    if (!candidate) return null;
    const wbs = projectedWbs(tree, sourceNode.id, candidate.node.id);
    return { wbs, label: `${candidate.wbs} ${candidate.node.title}` };
  }, [focusMode, rows, sourceNode, tree]);

  const previewDependency = useMemo(() => {
    if (!focusMode || focusMode.kind !== "dependency" || !sourceNode || !focusMode.previewNodeId) return null;
    const candidate = rows.find((row) => row.node.id === focusMode.previewNodeId);
    if (!candidate) return null;
    return relationPreview(
      focusMode.relation,
      sourceNode.title,
      candidate.node.title,
      focusMode.direction,
    );
  }, [focusMode, rows, sourceNode]);

  const toggleNode = (nodeId: string) => setCollapsedNodes((prev) => {
    const next = new Set(prev);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    return next;
  });

  const openNode = (node: Timeline2Node) => onOpenSheet({
    mode: "edit",
    nodeId: node.id,
    draft: nodeToDraft(node),
  });

  const startParentFocus = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    setViewMode("outline");
    setFocusMode({
      kind: "parent",
      sourceNodeId: nodeId,
      search: "",
      previewParentId: node.parentId,
    });
  };

  const startDependencyFocus = (nodeId: string) => {
    if (!nodeById.has(nodeId)) return;
    setFocusMode({
      kind: "dependency",
      sourceNodeId: nodeId,
      search: "",
      relation: "finish_to_start",
      direction: "unblocks",
      previewNodeId: null,
    });
  };

  const addChild = (row: OutlineTimeline2Node) => {
    if (row.node.kind === "milestone") return;
    onOpenSheet({
      mode: "create",
      draft: createDraft({ parentId: row.node.id, kind: "task" }),
    });
  };

  async function applyParentSelection() {
    if (!focusMode || focusMode.kind !== "parent") return;
    const source = nodeById.get(focusMode.sourceNodeId);
    if (!source) return;
    if (focusMode.previewParentId === source.parentId) {
      setFocusMode(null);
      return;
    }
    await onPatchNode(source.id, { parentId: focusMode.previewParentId });
    setFocusMode(null);
  }

  async function applyDependencySelection() {
    if (!focusMode || focusMode.kind !== "dependency" || !focusMode.previewNodeId) return;
    const candidate = dependencyCandidates.find((item) => item.row.node.id === focusMode.previewNodeId);
    if (!candidate || !candidate.valid) return;
    if (candidate.existing) {
      await onDeleteDependency(candidate.existing.id);
    } else {
      await onCreateDependency({
        fromNodeId: candidate.fromNodeId,
        toNodeId: candidate.toNodeId,
        relation: focusMode.relation,
      });
    }
    setFocusMode(null);
  }

  const renderRow = (row: OutlineTimeline2Node, groupLabel?: string) => {
    const node = row.node;
    const hasChildren = node.children.length > 0;
    const collapsed = collapsedNodes.has(node.id);
    const links = dependencyCount(node.id, dependencies);
    const rowIsSource = focusMode?.sourceNodeId === node.id;
    const inParentMode = focusMode?.kind === "parent" && sourceNode;
    const inDependencyMode = focusMode?.kind === "dependency" && sourceNode;
    const parentCandidate = inParentMode ? parentCandidates.find((item) => item.row.node.id === node.id) : null;
    const dependencyCandidate = inDependencyMode ? dependencyCandidates.find((item) => item.row.node.id === node.id) : null;
    const selectedParent = focusMode?.kind === "parent" && focusMode.previewParentId === node.id;
    const selectedDependency = focusMode?.kind === "dependency" && focusMode.previewNodeId === node.id;
    const dimmed = Boolean(
      focusMode &&
      !rowIsSource &&
      ((focusMode.kind === "parent" && (!parentCandidate?.matches || !parentCandidate.valid)) ||
        (focusMode.kind === "dependency" && (!dependencyCandidate?.matches || !dependencyCandidate.valid))),
    );

    return (
      <div
        key={`${groupLabel ?? "outline"}-${node.id}`}
        className="group grid min-h-[48px] items-center gap-3 border-b px-3 py-1.5 sm:px-4"
        style={{
          gridTemplateColumns: "minmax(0, 1.7fr) 120px 92px 150px 92px 130px",
          borderColor: "var(--border-subtle)",
          background: rowIsSource
            ? "#f5f8fc"
            : selectedParent || selectedDependency
              ? "#f9fbfd"
              : row.depth === 0 || node.kind === "group"
                ? "#fcfdff"
                : "#fff",
          opacity: dimmed ? 0.38 : 1,
        }}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <OutlineGuide row={row} hasChildren={hasChildren} collapsed={collapsed} onToggle={() => toggleNode(node.id)} />
            <span className="w-10 shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>
              {row.wbs}
            </span>
            <KindMarker row={row} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (focusMode?.kind === "parent") {
                    if (!parentCandidate?.valid || !parentCandidate.matches) return;
                    setFocusMode({ ...focusMode, previewParentId: node.id });
                    return;
                  }
                  if (focusMode?.kind === "dependency") {
                    if (!dependencyCandidate?.valid || !dependencyCandidate.matches) return;
                    setFocusMode({ ...focusMode, previewNodeId: node.id });
                    return;
                  }
                  openNode(node);
                }}
                className="block min-w-0 text-left"
              >
                <span className={`block truncate text-[13px] ${node.kind === "group" ? "font-semibold" : "font-medium"}`} style={{ color: "var(--text-1)" }}>
                  {node.title}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span>{KIND_LABELS[node.kind]}</span>
                  {node.rollup.descendantCount > 0 && <span>{node.rollup.descendantCount} below</span>}
                  {node.rollup.actionRequiredCount > 0 && (
                    <span className="inline-flex items-center gap-1" style={{ color: "#b4233a" }}>
                      <AlertTriangle size={11} />
                      action
                    </span>
                  )}
                  {focusMode?.kind === "parent" && parentCandidate?.valid && parentCandidate.matches && (
                    <span style={{ color: selectedParent ? "#0f6b48" : "var(--text-muted)" }}>
                      {selectedParent ? "Selected parent" : "Valid parent"}
                    </span>
                  )}
                  {focusMode?.kind === "dependency" && dependencyCandidate?.valid && dependencyCandidate.matches && (
                    <span style={{ color: selectedDependency ? "#0f6b48" : "var(--text-muted)" }}>
                      {dependencyCandidate.existing ? "Existing link" : "Candidate link"}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="hidden sm:block">
          <StatusBadge status={timeline2DisplayStatus(node)} />
        </div>

        <div className="hidden text-[12px] font-medium sm:block" style={{ color: node.dueDate ? "var(--text-2)" : "var(--text-disabled)" }}>
          {formatDate(node.dueDate ?? node.rollup.dueDate)}
        </div>

        <div className="hidden min-w-0 md:block">
          <PeopleLabel row={row} />
        </div>

        <div className="hidden md:block">
          {node.kind === "group" ? (
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
              {node.progress}%
            </span>
          ) : (
            <label className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              <input
                type="number"
                min={0}
                max={100}
                value={node.progress}
                onChange={(event) => {
                  const next = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                  void onPatchNode(node.id, { progress: next });
                }}
                className="h-8 w-16 rounded-lg border px-2 text-[12px]"
                style={{ borderColor: "var(--border)" }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>%</span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5">
          {links > 0 && (
            <span
              className="hidden h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold lg:inline-flex"
              style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "#fff" }}
              title={`${links} dependency links`}
            >
              <GitBranch size={11} />
              {links}
            </span>
          )}
          <span
            className="hidden rounded-full px-2 py-1 text-[11px] font-semibold lg:inline-flex"
            style={{ background: "#f3f6fa", color: "var(--text-2)" }}
            title={`Priority: ${PRIORITY_LABELS[node.priority]}`}
          >
            {PRIORITY_LABELS[node.priority]}
          </span>
          <div className="hidden items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 lg:flex">
            {node.kind !== "milestone" && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  addChild(row);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 text-[11px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                title="Add subtask"
              >
                <Plus size={12} />
                Subtask
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startParentFocus(node.id);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 text-[11px] font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              title="Set parent"
            >
              <MoveRight size={12} />
              Parent
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startDependencyFocus(node.id);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 text-[11px] font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              title="Set dependency"
            >
              <Link2 size={12} />
              Link
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: "var(--border)" }}>
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Task outline</p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {nodes.length} items. Scan the work breakdown first, then filter by status when needed.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "#fff" }}>
              {([
                ["outline", "Outline"],
                ["status", "Status"],
                ["people", "People"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setViewMode(value)}
                  className="h-8 rounded-lg px-3 text-[11px] font-semibold"
                  style={viewMode === value ? { background: "#edf3f9", color: "var(--text-1)" } : { color: "var(--text-2)" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              Workflow
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="bg-transparent outline-none"
              >
                <option value="all">All statuses</option>
                {STATUS_GROUPS.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {focusMode && sourceNode && (
        <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)", background: "#f8fbfd" }}>
          {focusMode.kind === "parent" ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                  Set parent for {sourceNode.title}
                </p>
                <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                  Search narrows valid parents in place. Milestones and descendants are disabled.
                  {previewParentLabel?.wbs ? ` Preview WBS: ${previewParentLabel.wbs}` : ""}
                  {previewParentLabel?.label ? ` under ${previewParentLabel.label}.` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex h-10 min-w-[240px] items-center gap-2 rounded-xl border bg-white px-3 text-[12px]" style={{ borderColor: "var(--border)" }}>
                  <Search size={14} style={{ color: "var(--text-muted)" }} />
                  <input
                    value={focusMode.search}
                    onChange={(event) => setFocusMode({ ...focusMode, search: event.target.value })}
                    placeholder="Find a parent by WBS or name"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFocusMode({ ...focusMode, previewParentId: null })}
                  className="h-10 rounded-xl border bg-white px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                >
                  Move to top level
                </button>
                <button
                  type="button"
                  onClick={() => void applyParentSelection()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white"
                  style={{ background: "#214968" }}
                >
                  <Check size={14} />
                  Apply parent
                </button>
                <button
                  type="button"
                  onClick={() => setFocusMode(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                    Set dependencies for {sourceNode.title}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                    Choose whether this task is blocked by another item or whether it unblocks something else.
                    {previewDependency ? ` ${previewDependency}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 min-w-[240px] items-center gap-2 rounded-xl border bg-white px-3 text-[12px]" style={{ borderColor: "var(--border)" }}>
                    <Search size={14} style={{ color: "var(--text-muted)" }} />
                    <input
                      value={focusMode.search}
                      onChange={(event) => setFocusMode({ ...focusMode, search: event.target.value })}
                      placeholder="Find a related task"
                      className="min-w-0 flex-1 bg-transparent outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setFocusMode({ ...focusMode, direction: "blocked_by", previewNodeId: null })}
                    className="h-10 rounded-xl px-3 text-[12px] font-semibold"
                    style={focusMode.direction === "blocked_by" ? { background: "#f0f6fb", color: "#214968" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
                  >
                    Blocked by
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusMode({ ...focusMode, direction: "unblocks", previewNodeId: null })}
                    className="h-10 rounded-xl px-3 text-[12px] font-semibold"
                    style={focusMode.direction === "unblocks" ? { background: "#f0f6fb", color: "#214968" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
                  >
                    Unblocks
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(DEPENDENCY_LABELS) as Array<[Timeline2DependencyRelation, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFocusMode({ ...focusMode, relation: value })}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                      style={focusMode.relation === value ? { background: "#214968", color: "#fff" } : { background: "#fff", color: "var(--text-2)", border: "1px solid var(--border)" }}
                      title={label}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void applyDependencySelection()}
                    disabled={!focusMode.previewNodeId}
                    className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "#214968" }}
                  >
                    <Link2 size={14} />
                    Apply link
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusMode(null)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[12px] font-semibold"
                    style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="hidden border-b px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] sm:grid sm:px-5" style={{ gridTemplateColumns: "minmax(0, 1.8fr) 120px 92px 150px 130px", borderColor: "var(--border)", background: "#f7f9fc", color: "var(--text-2)" }}>
        <span>Task</span>
        <span>Status</span>
        <span>Due</span>
        <span>Owner</span>
        <span className="text-right">Signals</span>
      </div>

      <div>
        {viewMode === "outline" ? (
          filteredRows.map((row) => {
            const inParentMode = focusMode?.kind === "parent" && sourceNode;
            const inDependencyMode = focusMode?.kind === "dependency" && sourceNode;
            const parentCandidate = inParentMode ? parentCandidates.find((item) => item.row.node.id === row.node.id) : null;
            const dependencyCandidate = inDependencyMode ? dependencyCandidates.find((item) => item.row.node.id === row.node.id) : null;
            return (
              <div
                key={row.node.id}
                onMouseEnter={() => {
                  if (focusMode?.kind === "parent" && parentCandidate?.valid && parentCandidate.matches) {
                    setFocusMode({ ...focusMode, previewParentId: row.node.id });
                  }
                  if (focusMode?.kind === "dependency" && dependencyCandidate?.valid && dependencyCandidate.matches) {
                    setFocusMode({ ...focusMode, previewNodeId: row.node.id });
                  }
                }}
                onClick={() => {
                  if (focusMode?.kind === "parent") {
                    if (!parentCandidate?.valid || !parentCandidate.matches) return;
                    setFocusMode({ ...focusMode, previewParentId: row.node.id });
                    return;
                  }
                  if (focusMode?.kind === "dependency") {
                    if (!dependencyCandidate?.valid || !dependencyCandidate.matches) return;
                    setFocusMode({ ...focusMode, previewNodeId: row.node.id });
                    return;
                  }
                  openNode(row.node);
                }}
                className="block w-full text-left"
              >
                {renderRow(row)}
              </div>
            );
          })
        ) : (
          groupedRows.map((group) => (
            <section key={group.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="px-4 py-2 sm:px-5" style={{ background: "#fbfcfe" }}>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>{group.label}</span>
                <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{group.rows.length}</span>
              </div>
              {group.rows.map((row) => renderRow(row, group.id))}
            </section>
          ))
        )}

        {viewMode === "outline" && filteredRows.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No tasks match the current status filter.
          </div>
        )}
      </div>
    </section>
  );
}
