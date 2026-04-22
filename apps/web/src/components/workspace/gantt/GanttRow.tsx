"use client";
import type { FlatRow } from "./gantt-utils";
import { GanttBar } from "./GanttBar";
import { rollUpBar, type TimelineRange } from "./gantt-utils";
import type { GanttNode, GanttTask } from "./gantt-types";

type NodeRow = Extract<FlatRow, { kind: "node" }>;

interface Props {
  row: NodeRow;
  range: TimelineRange;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
  onTaskBarClick?: (taskId: string, projectId: string) => void;
}

function gatherDescendantTasks(node: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  // Timeline Slice 2 — subtask now carries `children`; walk them too so a
  // parent task's rolled-up bar includes deeply-nested subtask spans.
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    for (const c of n.children) walk(c);
  }
  walk(node);
  return out;
}

export function GanttRow({ row, range, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu, onTaskBarClick }: Props) {
  const n = row.node;
  const highlighted = hoveredKey === row.key;
  const selected = selectedKey === row.key;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    e.preventDefault();
    onContextMenu(row.key, n.kind, e);
  };

  let content: React.ReactNode = null;
  if (n.kind === "task" || n.kind === "subtask") {
    const t = n.task;

    if (n.children.length > 0) {
      // Parent task: bar spans all descendant date ranges (feature 6).
      const descendants: GanttTask[] = [];
      const walkDesc = (node: GanttNode) => {
        if (node.kind === "task" || node.kind === "subtask") descendants.push(node.task);
        for (const c of node.children) walkDesc(c);
      };
      for (const c of n.children) walkDesc(c);
      const r = rollUpBar(descendants);
      if (r) {
        content = (
          <GanttBar
            variant={n.kind}
            start={r.start}
            end={r.end}
            progressPercent={r.progressPercent}
            range={range}
            categoryColor={row.categoryColor}
            status={t.status}
            label={t.title}
            task={t}
            highlighted={highlighted}
            selected={selected}
            dimmed={row.dimmed ?? false}
            onClick={() => onTaskBarClick ? onTaskBarClick(t.id, t.projectId) : onSelectKey(row.key)}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => onHoverKey(row.key)}
            onMouseLeave={() => onHoverKey(null)}
          />
        );
      }
    } else {
      // Leaf task: render its own date range.
      const todayIso = new Date().toISOString().slice(0, 10);
      const end = t.endDate ?? t.dueDate;
      const endNorm = end ? String(end).slice(0, 10) : null;
      const startNorm = t.startDate
        ? String(t.startDate).slice(0, 10)
        : (endNorm && endNorm > todayIso ? todayIso : endNorm);
      if (startNorm && endNorm) {
        content = (
          <GanttBar
            variant={n.kind}
            start={startNorm}
            end={endNorm}
            progressPercent={t.progressPercent}
            range={range}
            categoryColor={row.categoryColor}
            status={t.status}
            label={t.title}
            task={t}
            highlighted={highlighted}
            selected={selected}
            dimmed={row.dimmed ?? false}
            onClick={() => onTaskBarClick ? onTaskBarClick(t.id, t.projectId) : onSelectKey(row.key)}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => onHoverKey(row.key)}
            onMouseLeave={() => onHoverKey(null)}
          />
        );
      }
    }
  } else if (n.kind === "category" || n.kind === "project") {
    const r = rollUpBar(gatherDescendantTasks(n));
    if (r) {
      content = (
        <GanttBar
          variant={n.kind}
          start={r.start}
          end={r.end}
          progressPercent={r.progressPercent}
          range={range}
          categoryColor={row.categoryColor}
          label={n.name}
          highlighted={highlighted}
          selected={selected}
          dimmed={row.dimmed ?? false}
          onClick={() => onSelectKey(row.key)}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  }

  return (
    <div
      style={{
        height: row.height,
        position: "relative",
        background: (highlighted || selected) ? "var(--surface-2)" : "transparent",
        transition: "background-color 150ms ease-out",
      }}
      onContextMenu={handleContextMenu}
    >
      {content}
    </div>
  );
}
