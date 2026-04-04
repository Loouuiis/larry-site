"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import {
  EASE, type TimelineRange,
  parseDate, dateToPct,
} from "./timeline-utils";

interface Dependency {
  taskId: string;
  dependsOnTaskId: string;
  relation: string;
}

interface TimelineDependencyLinesProps {
  dependencies: Dependency[];
  tasks: WorkspaceTimelineTask[];
  range: TimelineRange;
  hoveredTaskId: string | null;
  taskPositions: Map<string, number>;
}

export function TimelineDependencyLines({
  dependencies, tasks, range, hoveredTaskId, taskPositions,
}: TimelineDependencyLinesProps) {
  if (!dependencies.length || !hoveredTaskId) return null;

  const relevant = dependencies.filter(
    (d) => d.taskId === hoveredTaskId || d.dependsOnTaskId === hoveredTaskId,
  );

  if (!relevant.length) return null;

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      style={{ overflow: "visible" }}
    >
      <AnimatePresence>
        {relevant.map((dep) => {
          const from = taskMap.get(dep.dependsOnTaskId);
          const to = taskMap.get(dep.taskId);
          if (!from || !to) return null;

          const fromEnd = parseDate(from.endDate) ?? parseDate(from.dueDate);
          const toStart = parseDate(to.startDate);
          if (!fromEnd || !toStart) return null;

          const x1 = dateToPct(fromEnd, range);
          const x2 = dateToPct(toStart, range);
          const y1 = taskPositions.get(dep.dependsOnTaskId) ?? 0;
          const y2 = taskPositions.get(dep.taskId) ?? 0;

          const midX = (x1 + x2) / 2;
          const path = `M ${x1}% ${y1} C ${midX}% ${y1}, ${midX}% ${y2}, ${x2}% ${y2}`;

          return (
            <motion.g key={`${dep.dependsOnTaskId}-${dep.taskId}`}>
              <motion.path
                d={path}
                fill="none"
                stroke="#6c44f6"
                strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE }}
                markerEnd="url(#arrowhead)"
              />
            </motion.g>
          );
        })}
      </AnimatePresence>

      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="6"
          refY="2"
          orient="auto"
        >
          <polygon points="0 0, 6 2, 0 4" fill="#6c44f6" opacity="0.7" />
        </marker>
      </defs>
    </svg>
  );
}
