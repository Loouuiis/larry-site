"use client";

import { useMemo, useState } from "react";
import type {
  WorkspaceTask,
  WorkspaceTimeline,
  WorkspaceProjectMember,
} from "@/app/dashboard/types";

interface ProgressBoxProps {
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimeline | null;
  targetDate?: string | null;
  members?: WorkspaceProjectMember[];
}

export function ProgressBox({ tasks, timeline, targetDate, members }: ProgressBoxProps) {
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);

  const areas = useMemo(() => {
    const cats = new Set<string>();
    for (const t of timeline?.gantt ?? []) {
      if (t.category) cats.add(t.category);
    }
    return Array.from(cats).sort();
  }, [timeline]);

  const taskIdsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const t of timeline?.gantt ?? []) {
      if (t.category) {
        if (!map.has(t.category)) map.set(t.category, new Set());
        map.get(t.category)!.add(t.id);
      }
    }
    return map;
  }, [timeline]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (selectedAreas.length > 0) {
      const allowedIds = new Set<string>();
      for (const area of selectedAreas) {
        const ids = taskIdsByCategory.get(area);
        if (ids) ids.forEach((id) => allowedIds.add(id));
      }
      result = result.filter((t) => allowedIds.has(t.id));
    }
    if (selectedEmployees.length > 0) {
      result = result.filter(
        (t) => t.assigneeUserId && selectedEmployees.includes(t.assigneeUserId),
      );
    }
    return result;
  }, [tasks, selectedAreas, selectedEmployees, taskIdsByCategory]);

  const completed = filteredTasks.filter((t) => t.status === "completed").length;
  const total = filteredTasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const toggleArea = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const toggleEmployee = (userId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(userId) ? prev.filter((e) => e !== userId) : [...prev, userId],
    );
  };

  const formatTarget = (date?: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 18px",
        flex: 1,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.8px]"
          style={{ color: "#b8a0ff" }}
        >
          Overall Progress
        </p>
        <div className="flex gap-1.5">
          {areas.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => {
                  setAreaDropdownOpen((v) => !v);
                  setEmployeeDropdownOpen(false);
                }}
                className="text-[10px]"
                style={{
                  color: selectedAreas.length > 0 ? "#6c44f6" : "var(--text-muted)",
                  padding: "3px 8px",
                  background: "var(--surface-2)",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Area{selectedAreas.length > 0 ? ` (${selectedAreas.length})` : ""} ▾
              </button>
              {areaDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "4px",
                    zIndex: 20,
                    minWidth: "160px",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  {areas.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area)}
                      className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px]"
                      style={{
                        background: selectedAreas.includes(area)
                          ? "rgba(108,68,246,0.1)"
                          : "transparent",
                        color: "var(--text-1)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          border: selectedAreas.includes(area)
                            ? "2px solid #6c44f6"
                            : "2px solid var(--border)",
                          background: selectedAreas.includes(area) ? "#6c44f6" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {selectedAreas.includes(area) ? "✓" : ""}
                      </span>
                      {area}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {members && members.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => {
                  setEmployeeDropdownOpen((v) => !v);
                  setAreaDropdownOpen(false);
                }}
                className="text-[10px]"
                style={{
                  color: selectedEmployees.length > 0 ? "#6c44f6" : "var(--text-muted)",
                  padding: "3px 8px",
                  background: "var(--surface-2)",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Employee{selectedEmployees.length > 0 ? ` (${selectedEmployees.length})` : ""} ▾
              </button>
              {employeeDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "4px",
                    zIndex: 20,
                    minWidth: "180px",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  {members.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleEmployee(m.userId)}
                      className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px]"
                      style={{
                        background: selectedEmployees.includes(m.userId)
                          ? "rgba(108,68,246,0.1)"
                          : "transparent",
                        color: "var(--text-1)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          border: selectedEmployees.includes(m.userId)
                            ? "2px solid #6c44f6"
                            : "2px solid var(--border)",
                          background: selectedEmployees.includes(m.userId) ? "#6c44f6" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {selectedEmployees.includes(m.userId) ? "✓" : ""}
                      </span>
                      {m.name || m.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <p className="text-[28px] font-extrabold" style={{ color: "#6c44f6" }}>
          {pct}%
        </p>
        <div style={{ flex: 1 }}>
          <div
            className="w-full overflow-hidden"
            style={{ height: "12px", borderRadius: "6px", background: "var(--surface-2)" }}
          >
            <div
              style={{
                width: `${Math.max(pct, 2)}%`,
                height: "100%",
                borderRadius: "6px",
                background: "linear-gradient(90deg, #6c44f6, #9b7aff)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            className="mt-1 flex items-center justify-between text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{completed} of {total} tasks completed</span>
            {targetDate && <span>Target: {formatTarget(targetDate)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
