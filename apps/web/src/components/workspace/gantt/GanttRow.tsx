"use client";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";
import { GanttBar } from "./GanttBar";
import { rollUpBar, type TimelineRange } from "./gantt-utils";
import type { GanttTask } from "./gantt-types";

interface Props {
  row: FlatRow;
  range: TimelineRange;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
}

function gatherDescendantTasks(row: FlatRow["node"]): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: FlatRow["node"]) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(row);
  return out;
}

export function GanttRow({ row, range, hoveredKey, selectedKey, onHoverKey, onSelectKey }: Props) {
  const n = row.node;
  const highlighted = hoveredKey === row.key;
  const selected = selectedKey === row.key;

  let content: React.ReactNode = null;
  if (n.kind === "task" || n.kind === "subtask") {
    const t = n.task;
    const start = t.startDate;
    const end = t.endDate ?? t.dueDate;
    if (start && end) {
      content = (
        <GanttBar
          variant={n.kind}
          start={start}
          end={end}
          progressPercent={t.progressPercent}
          range={range}
          label={t.title}
          task={t}
          highlighted={highlighted}
          dimmed={row.dimmed ?? false}
          onClick={() => onSelectKey(row.key)}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  } else {
    const r = rollUpBar(gatherDescendantTasks(n));
    if (r) {
      content = (
        <GanttBar
          variant={n.kind}
          start={r.start}
          end={r.end}
          progressPercent={r.progressPercent}
          range={range}
          label={n.kind === "category" ? n.name : n.kind === "project" ? n.name : ""}
          highlighted={highlighted}
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
      borderBottom: "1px solid var(--border, #eaeaea)",
      background: selected ? "rgba(108, 68, 246, 0.04)" : "transparent",
    }}>
      {content}
    </div>
  );
}
