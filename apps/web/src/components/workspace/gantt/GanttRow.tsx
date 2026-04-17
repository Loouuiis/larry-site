"use client";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";
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
}

function gatherDescendantTasks(node: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(node);
  return out;
}

export function GanttRow({ row, range, hoveredKey, selectedKey, onHoverKey, onSelectKey }: Props) {
  const n = row.node;
  const highlighted = hoveredKey === row.key;
  const selected = selectedKey === row.key;
  const isCategory = n.kind === "category";

  let content: React.ReactNode = null;
  if (n.kind === "task" || n.kind === "subtask") {
    const t = n.task;
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
          onClick={() => onSelectKey(row.key)}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
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
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  }

  return (
    <div style={{
      height: ROW_HEIGHT,
      position: "relative",
      borderBottom: "1px solid var(--border, #f0edfa)",
      background: isCategory
        ? "var(--surface-2, #f6f2fc)"
        : selected
          ? "rgba(108, 68, 246, 0.04)"
          : "transparent",
    }}>
      {content}
    </div>
  );
}
