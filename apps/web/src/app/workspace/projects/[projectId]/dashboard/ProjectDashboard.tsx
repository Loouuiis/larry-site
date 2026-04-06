"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Pencil, X } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  WorkspaceTask,
  WorkspaceTimeline,
  WorkspaceProjectMember,
} from "@/app/dashboard/types";

interface HistoryPoint {
  period: string;
  label: string;
  completed: number;
  created: number;
  active: number;
}

interface DashboardData {
  health?: {
    completionRate?: number;
    blockedCount?: number;
    avgRiskScore?: number;
    riskLevel?: string;
    taskCount?: number;
  };
  outcomes?: {
    narrative?: string;
    metrics?: Record<string, number>;
  };
  breakdown?: {
    byStatus?: Record<string, number>;
    byAssignee?: Record<string, { total: number; completed: number }>;
  };
  history?: {
    history: HistoryPoint[];
  };
}

/* ── Status config — new order & colors from design spec ───────────── */

const STATUS_5_CONFIG = [
  {
    key: "not_started",
    label: "Not Started",
    color: "#b0b0b0",
    bg: "rgba(196,196,196,0.15)",
    border: "rgba(196,196,196,0.35)",
  },
  {
    key: "on_track",
    label: "In Progress",
    color: "#7ab0d8",
    bg: "rgba(122,176,216,0.12)",
    border: "rgba(122,176,216,0.35)",
  },
  {
    key: "at_risk",
    label: "At Risk",
    color: "#d4b84a",
    bg: "rgba(234,217,122,0.18)",
    border: "rgba(234,217,122,0.45)",
  },
  {
    key: "overdue",
    label: "Overdue",
    color: "#e87878",
    bg: "rgba(232,120,120,0.10)",
    border: "rgba(232,120,120,0.30)",
  },
  {
    key: "completed",
    label: "Completed",
    color: "#6ab86a",
    bg: "rgba(136,196,122,0.12)",
    border: "rgba(136,196,122,0.35)",
  },
] as const;

function mapToFiveStatuses(byStatus: Record<string, number>): Record<string, number> {
  return {
    completed:   byStatus.completed   ?? 0,
    not_started: (byStatus.not_started ?? 0) + (byStatus.backlog ?? 0),
    on_track:    (byStatus.in_progress ?? 0) + (byStatus.waiting ?? 0),
    at_risk:     byStatus.blocked     ?? 0,
    overdue:     byStatus.overdue     ?? 0,
  };
}

function bucketTaskStatus(status: string): string {
  if (status === "backlog") return "not_started";
  if (status === "in_progress" || status === "waiting") return "on_track";
  if (status === "blocked") return "at_risk";
  return status;
}

/* ── Progress bar ───────────────────────────────────────────────────── */

function DashboardProgress({
  completionRate,
  taskCount,
  avgRiskScore,
  riskLevel,
}: {
  completionRate: number;
  taskCount: number;
  avgRiskScore: number;
  riskLevel?: string;
}) {
  const pct = Math.round(completionRate);
  const completed = Math.round((completionRate / 100) * taskCount);
  const riskColor =
    avgRiskScore >= 70 ? "#ef4444" : avgRiskScore >= 35 ? "#f59e0b" : "#22c55e";
  const riskLabel =
    riskLevel ?? (avgRiskScore >= 70 ? "High" : avgRiskScore >= 35 ? "Medium" : "Low");

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <p className="text-[11px] font-semibold tracking-wide uppercase mb-3" style={{ color: "var(--text-muted)" }}>
        Overall Progress
      </p>

      {/* Bar */}
      <div
        className="w-full overflow-hidden"
        style={{ height: "12px", borderRadius: "6px", background: "var(--surface-2)" }}
      >
        <div
          style={{
            width: `${pct > 0 ? Math.max(pct, 2) : 0}%`,
            height: "100%",
            borderRadius: "6px",
            background: "linear-gradient(90deg, #6c44f6, #9b7aff)",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Below bar: % + task count */}
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[28px] font-extrabold leading-none" style={{ color: "#6c44f6" }}>
          {pct}%
        </p>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {completed} of {taskCount} tasks completed
        </span>
      </div>

      {/* Divider + risk row */}
      <div
        className="mt-3 pt-3 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
          Risk Score
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-extrabold" style={{ color: riskColor }}>
            {Math.round(avgRiskScore)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: `${riskColor}18`, color: riskColor }}
          >
            {riskLabel} Risk
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Risk score widget ──────────────────────────────────────────────── */

function RiskScoreWidget({
  avgRiskScore,
  riskLevel,
}: {
  avgRiskScore: number;
  riskLevel?: string;
}) {
  const color =
    avgRiskScore >= 70 ? "#ef4444" : avgRiskScore >= 35 ? "#f59e0b" : "#22c55e";
  const label =
    riskLevel ?? (avgRiskScore >= 70 ? "High" : avgRiskScore >= 35 ? "Medium" : "Low");
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
        minWidth: "160px",
      }}
    >
      <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
        Risk Score
      </p>
      <p className="text-[28px] font-extrabold" style={{ color }}>
        {Math.round(avgRiskScore)}
      </p>
      <p className="text-[11px] mt-1 font-semibold" style={{ color }}>
        {label} Risk
      </p>
    </div>
  );
}

/* ── 5 status boxes ─────────────────────────────────────────────────── */

function StatusFiveBoxes({ byStatus }: { byStatus: Record<string, number> }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#ffffff", border: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-5 gap-2.5">
        {STATUS_5_CONFIG.map((cfg) => (
          <div
            key={cfg.key}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: "var(--radius-card)",
              padding: "14px 8px",
              textAlign: "center",
            }}
          >
            <p className="text-[24px] font-extrabold" style={{ color: cfg.color }}>
              {counts[cfg.key]}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              {cfg.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bar chart ──────────────────────────────────────────────────────── */

function StatusBarChart({ byStatus, memberName, title = "Tasks by Status" }: { byStatus: Record<string, number>; memberName?: string | null; title?: string }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  const maxVal = Math.max(...STATUS_5_CONFIG.map((c) => counts[c.key]), 1);
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          {title}
        </h2>
        {memberName && (
          <p className="text-[11px] mt-0.5" style={{ color: "#6c44f6" }}>
            {memberName}
          </p>
        )}
      </div>
      <div className="flex items-end gap-3" style={{ height: "160px" }}>
        {STATUS_5_CONFIG.map((cfg) => {
          const val = counts[cfg.key];
          const heightPct = (val / maxVal) * 100;
          return (
            <div key={cfg.key} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>
                {val}
              </span>
              <div className="w-full flex items-end" style={{ height: "120px" }}>
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    background: cfg.color,
                    borderRadius: "4px 4px 0 0",
                    minHeight: val > 0 ? "4px" : "0",
                    transition: "height 0.4s ease",
                  }}
                />
              </div>
              <span className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Overview-style donut ───────────────────────────────────────────── */

function OverviewDonutWidget({ byStatus, memberName, title = "Task Distribution" }: { byStatus: Record<string, number>; memberName?: string | null; title?: string }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  const total = useMemo(
    () => STATUS_5_CONFIG.reduce((s, cfg) => s + counts[cfg.key], 0),
    [counts],
  );

  const segments = useMemo(() => {
    const safeTotal = total || 1;
    let cumAngle = 0;
    return STATUS_5_CONFIG.filter((cfg) => counts[cfg.key] > 0).map((cfg) => {
      const angle = (counts[cfg.key] / safeTotal) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      return { ...cfg, count: counts[cfg.key], angle, startAngle };
    });
  }, [counts, total]);

  const R = 80;
  const innerR = 52;
  const cx = 100;
  const cy = 100;

  const polarToXY = (r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
        width: "100%",
      }}
    >
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          {title}
        </h2>
        {memberName && (
          <p className="text-[11px] mt-0.5" style={{ color: "#6c44f6" }}>
            {memberName}
          </p>
        )}
      </div>
      <div className="flex items-center gap-6">
        <svg width={200} height={200} viewBox="0 0 200 200">
          {total === 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={(R + innerR) / 2}
              fill="none"
              stroke="var(--border)"
              strokeWidth={R - innerR}
            />
          ) : (
            segments.map((seg) => {
              if (seg.angle <= 0) return null;
              // Full circle — arc path degenerates when start === end, use circle instead
              if (seg.angle >= 359.9) {
                return (
                  <circle
                    key={seg.key}
                    cx={cx}
                    cy={cy}
                    r={(R + innerR) / 2}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={R - innerR}
                  />
                );
              }
              const start = polarToXY(R, seg.startAngle);
              const end = polarToXY(R, seg.startAngle + seg.angle);
              const large = seg.angle > 180 ? 1 : 0;
              const innerStart = polarToXY(innerR, seg.startAngle + seg.angle);
              const innerEnd = polarToXY(innerR, seg.startAngle);
              const d = [
                `M ${start.x} ${start.y}`,
                `A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`,
                `L ${innerStart.x} ${innerStart.y}`,
                `A ${innerR} ${innerR} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
                "Z",
              ].join(" ");
              return <path key={seg.key} d={d} fill={seg.color} />;
            })
          )}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontSize={18}
            fontWeight={800}
            fill="var(--text-1)"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize={12}
            fill="var(--text-muted)"
          >
            total
          </text>
        </svg>
        <div className="space-y-2">
          {STATUS_5_CONFIG.map((cfg) => {
            const val = counts[cfg.key];
            return (
              <div key={cfg.key} className="flex items-center gap-2 text-[13px]">
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ background: cfg.color }}
                />
                <span style={{ color: "var(--text-2)" }}>{cfg.label}</span>
                <span className="font-semibold" style={{ color: "var(--text-1)" }}>
                  {val}
                </span>
                {total > 0 && (
                  <span style={{ color: "var(--text-muted)" }}>
                    ({Math.round((val / total) * 100)}%)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Status history line chart ──────────────────────────────────────── */

const HISTORY_SERIES = [
  { key: "completed", label: "Completed", color: "#6ab86a" },
  { key: "active",    label: "In Progress", color: "#7ab0d8" },
  { key: "created",   label: "New Tasks",  color: "#9b7aff" },
] as const;

function HistoryTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-[11px] shadow-lg"
      style={{ background: "var(--surface)", borderColor: "var(--border)", minWidth: "120px" }}
    >
      <p className="mb-1.5 font-semibold" style={{ color: "var(--text-2)" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatusHistoryChart({ history, memberName }: { history: HistoryPoint[] | null | undefined; memberName?: string | null }) {
  const [period, setPeriod] = useState<3 | 6 | 12>(6);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const sliced = useMemo(() => {
    if (!history?.length) return [];
    return history.slice(-period);
  }, [history, period]);

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
            Status Over Time
          </h2>
          {memberName && (
            <p className="text-[11px] mt-0.5" style={{ color: "#6c44f6" }}>
              {memberName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Series toggles */}
          <div className="flex items-center gap-1">
            {HISTORY_SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-opacity"
                style={{
                  background: hidden.has(s.key) ? "var(--surface-2)" : `${s.color}20`,
                  color: hidden.has(s.key) ? "var(--text-muted)" : s.color,
                  border: `1px solid ${hidden.has(s.key) ? "var(--border)" : s.color}40`,
                  opacity: hidden.has(s.key) ? 0.5 : 1,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
          {/* Period buttons */}
          <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: "var(--surface-2)" }}>
            {([3, 6, 12] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="rounded px-2 py-0.5 text-[10px] font-semibold transition-colors"
                style={{
                  background: period === p ? "var(--surface)" : "transparent",
                  color: period === p ? "var(--text-1)" : "var(--text-muted)",
                  boxShadow: period === p ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {p}M
              </button>
            ))}
          </div>
        </div>
      </div>

      {!history?.length ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Not enough historical data yet — check back after more tasks are completed.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={sliced} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<HistoryTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            {HISTORY_SERIES.map((s) =>
              hidden.has(s.key) ? null : (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: s.color }}
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ── Per-widget helpers ─────────────────────────────────────────────── */

function computeByStatusForMember(
  tasks: WorkspaceTask[],
  memberId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cfg of STATUS_5_CONFIG) counts[cfg.key] = 0;
  for (const t of tasks) {
    if (t.assigneeUserId !== memberId) continue;
    const bucket = bucketTaskStatus(t.status);
    if (bucket in counts) counts[bucket]++;
  }
  return counts;
}

function computeHistoryForMember(
  tasks: WorkspaceTask[],
  memberId: string,
  history: HistoryPoint[] | null | undefined,
): HistoryPoint[] | null {
  if (!history?.length) return history ?? null;
  let completed = 0;
  let active = 0;
  for (const t of tasks) {
    if (t.assigneeUserId !== memberId) continue;
    const bucket = bucketTaskStatus(t.status);
    if (bucket === "completed") completed++;
    else active++;
  }
  return history.map((p) => ({ ...p, completed, active, created: completed + active }));
}

/* ── Hoverable edit wrapper ─────────────────────────────────────────── */

function EditableWidgetWrapper({
  children,
  onEdit,
  style,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: "relative", ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit widget"
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 9px",
          fontSize: "11px",
          fontWeight: 500,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          color: "var(--text-2)",
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          transition: "opacity 0.15s ease, transform 0.15s ease",
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
          transform: hovered ? "translateY(0)" : "translateY(-2px)",
          zIndex: 5,
        }}
      >
        <Pencil size={10} />
        Edit
      </button>
    </div>
  );
}

/* ── Chart edit modal ───────────────────────────────────────────────── */

type WidgetKey = "bar" | "donut" | "history";
type ChartType = "bar" | "donut";
type WidgetSize = "half" | "full";

interface WidgetConfig {
  chartType: ChartType;
  size: WidgetSize;
  memberId: string | null;
}

const WIDGET_LABELS: Record<WidgetKey, string> = {
  bar: "Tasks by Status",
  donut: "Task Distribution",
  history: "Status Over Time",
};

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      style={{
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        border: `2px solid ${selected ? "#6c44f6" : "var(--border)"}`,
        background: selected ? "#6c44f6" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {selected && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff", display: "block" }} />}
    </span>
  );
}

function ChartEditModal({
  widgetKey,
  members,
  config,
  onSave,
  onClose,
}: {
  widgetKey: WidgetKey;
  members: WorkspaceProjectMember[];
  config: WidgetConfig;
  onSave: (config: WidgetConfig) => void;
  onClose: () => void;
}) {
  const [localChartType, setLocalChartType] = useState<ChartType>(config.chartType);
  const [localSize, setLocalSize] = useState<WidgetSize>(config.size);
  const [localMemberId, setLocalMemberId] = useState<string | null>(config.memberId);
  const widgetLabel = WIDGET_LABELS[widgetKey];
  const showChartType = widgetKey !== "history";

  const optionBtn = (active: boolean) => ({
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "10px",
    flex: 1,
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1.5px solid ${active ? "#6c44f6" : "var(--border)"}`,
    background: active ? "rgba(108,68,246,0.07)" : "var(--surface-2)",
    cursor: "pointer" as const,
    transition: "all 0.15s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />

      {/* Modal card */}
      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "24px",
          width: "380px",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>
              Edit widget
            </p>
            <h3 className="text-[15px] font-bold" style={{ color: "var(--text-1)" }}>{widgetLabel}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", marginRight: "-4px", paddingRight: "4px" }}>

          {/* ── CONFIGURATION ── */}
          <p className="text-[13px] font-bold mb-4" style={{ color: "var(--text-1)" }}>Configuration</p>

          {/* Chart type */}
          {showChartType && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "var(--text-muted)" }}>
                Chart type
              </p>
              <div className="flex gap-2">
                {/* Bar option */}
                <button type="button" onClick={() => setLocalChartType("bar")} style={optionBtn(localChartType === "bar")}>
                  {/* Mini bar chart icon */}
                  <svg width="28" height="20" viewBox="0 0 28 20" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="1" y="11" width="5" height="9" rx="1" fill={localChartType === "bar" ? "#6c44f6" : "var(--border)"} />
                    <rect x="8" y="5" width="5" height="15" rx="1" fill={localChartType === "bar" ? "#9b7aff" : "var(--border)"} />
                    <rect x="15" y="8" width="5" height="12" rx="1" fill={localChartType === "bar" ? "#6c44f6" : "var(--border)"} />
                    <rect x="22" y="2" width="5" height="18" rx="1" fill={localChartType === "bar" ? "#9b7aff" : "var(--border)"} />
                  </svg>
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: localChartType === "bar" ? "#6c44f6" : "var(--text-1)" }}>Bar chart</p>
                  </div>
                </button>
                {/* Donut option */}
                <button type="button" onClick={() => setLocalChartType("donut")} style={optionBtn(localChartType === "donut")}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="9" fill="none" stroke={localChartType === "donut" ? "#6c44f6" : "var(--border)"} strokeWidth="4.5" strokeDasharray="18 39" strokeDashoffset="-5" />
                    <circle cx="11" cy="11" r="9" fill="none" stroke={localChartType === "donut" ? "#9b7aff" : "#e5e7eb"} strokeWidth="4.5" strokeDasharray="39 18" strokeDashoffset="13" />
                  </svg>
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: localChartType === "donut" ? "#6c44f6" : "var(--text-1)" }}>Donut chart</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Widget size */}
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "var(--text-muted)" }}>
              Widget size
            </p>
            <div className="flex gap-2">
              {/* Half width */}
              <button type="button" onClick={() => setLocalSize("half")} style={optionBtn(localSize === "half")}>
                <svg width="28" height="18" viewBox="0 0 28 18" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="0.5" y="0.5" width="12" height="17" rx="2" fill={localSize === "half" ? "rgba(108,68,246,0.15)" : "var(--surface)"} stroke={localSize === "half" ? "#6c44f6" : "var(--border)"} />
                  <rect x="15.5" y="0.5" width="12" height="17" rx="2" fill={localSize === "half" ? "rgba(108,68,246,0.08)" : "var(--surface-2)"} stroke={localSize === "half" ? "#9b7aff" : "var(--border)"} strokeDasharray="3 2" />
                </svg>
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: localSize === "half" ? "#6c44f6" : "var(--text-1)" }}>Half width</p>
                </div>
              </button>
              {/* Full width */}
              <button type="button" onClick={() => setLocalSize("full")} style={optionBtn(localSize === "full")}>
                <svg width="28" height="18" viewBox="0 0 28 18" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="0.5" y="0.5" width="27" height="17" rx="2" fill={localSize === "full" ? "rgba(108,68,246,0.15)" : "var(--surface)"} stroke={localSize === "full" ? "#6c44f6" : "var(--border)"} />
                </svg>
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: localSize === "full" ? "#6c44f6" : "var(--text-1)" }}>Full width</p>
                </div>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--border)", margin: "4px 0 20px" }} />

          {/* ── FILTERS ── */}
          <p className="text-[13px] font-bold mb-4" style={{ color: "var(--text-1)" }}>Filters</p>
          <div className="space-y-1">
            {/* All members */}
            <button type="button" onClick={() => setLocalMemberId(null)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: localMemberId === null ? "rgba(108,68,246,0.08)" : "transparent", border: `1px solid ${localMemberId === null ? "rgba(108,68,246,0.3)" : "transparent"}`, color: "var(--text-1)", cursor: "pointer", textAlign: "left" }}
            >
              <RadioDot selected={localMemberId === null} />
              <span>All members</span>
            </button>
            {members.map((m) => (
              <button key={m.userId} type="button" onClick={() => setLocalMemberId(m.userId)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: localMemberId === m.userId ? "rgba(108,68,246,0.08)" : "transparent", border: `1px solid ${localMemberId === m.userId ? "rgba(108,68,246,0.3)" : "transparent"}`, color: "var(--text-1)", cursor: "pointer", textAlign: "left" }}
              >
                <RadioDot selected={localMemberId === m.userId} />
                <div style={{ minWidth: 0 }}>
                  <p className="font-medium truncate">{m.name || m.email}</p>
                  {m.name && <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{m.email}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium rounded-lg"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button type="button"
            onClick={() => { onSave({ chartType: localChartType, size: localSize, memberId: localMemberId }); onClose(); }}
            className="px-4 py-2 text-[13px] font-medium rounded-lg"
            style={{ background: "#6c44f6", border: "none", color: "#fff", cursor: "pointer" }}
          >
            Save chart
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export function ProjectDashboard({
  projectId,
  tasks = [],
  timeline,
  members = [],
}: {
  projectId: string;
  tasks?: WorkspaceTask[];
  timeline?: WorkspaceTimeline | null;
  members?: WorkspaceProjectMember[];
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  /* ── Filter state ─────────────────────────────────────────────────── */
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  /* ── Per-widget config ────────────────────────────────────────────── */
  const [widgetConfig, setWidgetConfig] = useState<Record<WidgetKey, WidgetConfig>>({
    bar:     { chartType: "bar",   size: "half", memberId: null },
    donut:   { chartType: "donut", size: "half", memberId: null },
    history: { chartType: "bar",   size: "half", memberId: null },
  });
  const [editingWidget, setEditingWidget] = useState<WidgetKey | null>(null);

  useEffect(() => {
    if (!areaDropdownOpen && !employeeDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setAreaDropdownOpen(false);
        setEmployeeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [areaDropdownOpen, employeeDropdownOpen]);

  /* ── Derived filter data ──────────────────────────────────────────── */
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

  const filteredByStatus = useMemo(() => {
    if (!selectedAreas.length && !selectedEmployees.length) return null;
    const counts: Record<string, number> = {};
    for (const cfg of STATUS_5_CONFIG) counts[cfg.key] = 0;
    for (const t of filteredTasks) {
      const bucket = bucketTaskStatus(t.status);
      if (bucket in counts) counts[bucket]++;
    }
    return counts;
  }, [filteredTasks, selectedAreas, selectedEmployees]);

  const filteredCompletionRate = useMemo(() => {
    if (!filteredByStatus) return null;
    const total = filteredTasks.length;
    if (total === 0) return 0;
    return ((filteredByStatus.completed ?? 0) / total) * 100;
  }, [filteredByStatus, filteredTasks]);

  /* ── Per-widget member-filtered data ─────────────────────────────── */
  const barByStatus = useMemo(
    () => widgetConfig.bar.memberId ? computeByStatusForMember(tasks, widgetConfig.bar.memberId) : null,
    [widgetConfig.bar.memberId, tasks],
  );
  const donutByStatus = useMemo(
    () => widgetConfig.donut.memberId ? computeByStatusForMember(tasks, widgetConfig.donut.memberId) : null,
    [widgetConfig.donut.memberId, tasks],
  );
  const historyMemberId = widgetConfig.history.memberId;

  const toggleArea = (area: string) =>
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );

  const toggleEmployee = (userId: string) =>
    setSelectedEmployees((prev) =>
      prev.includes(userId) ? prev.filter((e) => e !== userId) : [...prev, userId],
    );

  /* ── API load ─────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/projects/${projectId}/dashboard`);
      if (res.ok) {
        const d = (await res.json()) as DashboardData;
        setData(d);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("project-dashboard.pdf");
    } catch {
      // Silently fail — user can try again
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <p className="text-[14px] py-4" style={{ color: "var(--text-muted)" }}>
        Loading analytics…
      </p>
    );
  }

  const apiByStatus = data?.breakdown?.byStatus ?? {};
  const health = data?.health ?? {};
  const history = data?.history?.history ?? null;

  /* ── Active (possibly filtered) values ───────────────────────────── */
  const activeByStatus = filteredByStatus ?? apiByStatus;
  const activeCompletionRate = filteredCompletionRate ?? health.completionRate ?? 0;
  const activeTaskCount = filteredByStatus ? filteredTasks.length : (health.taskCount ?? 0);

  /* ── Per-widget data resolved after API load ─────────────────────── */
  const resolvedBarByStatus = barByStatus ?? activeByStatus;
  const resolvedDonutByStatus = donutByStatus ?? activeByStatus;
  const resolvedHistoryData = historyMemberId
    ? computeHistoryForMember(tasks, historyMemberId, history)
    : history;

  const memberName = (key: WidgetKey) => {
    const id = widgetConfig[key].memberId;
    if (!id) return null;
    const m = members.find((mem) => mem.userId === id);
    return m?.name || m?.email || null;
  };

  return (
    <div ref={dashboardRef} className="space-y-3">
      {/* Top bar: + Add widget (left) | Filters (center) | Export PDF (right) */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            borderStyle: "dashed",
          }}
        >
          <Plus size={12} />
          Add widget
        </button>

        {/* Filter dropdowns — shown only when data is available */}
        {(areas.length > 0 || members.length > 0) && (
          <div ref={filterRef} className="flex items-center gap-1.5">
            {areas.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setAreaDropdownOpen((v) => !v);
                    setEmployeeDropdownOpen(false);
                  }}
                  className="text-[11px]"
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
                      left: 0,
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

            {members.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeDropdownOpen((v) => !v);
                    setAreaDropdownOpen(false);
                  }}
                  className="text-[11px]"
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
                      left: 0,
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
                            background: selectedEmployees.includes(m.userId)
                              ? "#6c44f6"
                              : "transparent",
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
        )}

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors disabled:opacity-50"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-2)",
          }}
        >
          <Download size={12} />
          {exporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>

      {/* Progress bar + Risk Score combined */}
      <DashboardProgress
        completionRate={activeCompletionRate}
        taskCount={activeTaskCount}
        avgRiskScore={health.avgRiskScore ?? 0}
        riskLevel={health.riskLevel}
      />

      {/* 5 status boxes in white card */}
      <StatusFiveBoxes byStatus={activeByStatus} />

      {/* Bar chart + Overview donut — flex row, respects full-width setting */}
      {(() => {
        const barFull = widgetConfig.bar.size === "full";
        const donutFull = widgetConfig.donut.size === "full";
        const stack = barFull || donutFull;

        const BarContent = widgetConfig.bar.chartType === "donut"
          ? <OverviewDonutWidget byStatus={resolvedBarByStatus} memberName={memberName("bar")} title="Tasks by Status" />
          : <StatusBarChart byStatus={resolvedBarByStatus} memberName={memberName("bar")} />;

        const DonutContent = widgetConfig.donut.chartType === "bar"
          ? <StatusBarChart byStatus={resolvedDonutByStatus} memberName={memberName("donut")} title="Task Distribution" />
          : <OverviewDonutWidget byStatus={resolvedDonutByStatus} memberName={memberName("donut")} />;

        if (stack) {
          return (
            <div className="space-y-3">
              <EditableWidgetWrapper onEdit={() => setEditingWidget("bar")} style={{ width: "100%" }}>
                {BarContent}
              </EditableWidgetWrapper>
              <EditableWidgetWrapper onEdit={() => setEditingWidget("donut")} style={{ width: "100%" }}>
                {DonutContent}
              </EditableWidgetWrapper>
            </div>
          );
        }
        return (
          <div className="flex gap-3">
            <EditableWidgetWrapper onEdit={() => setEditingWidget("bar")} style={{ flex: 1, minWidth: 0 }}>
              {BarContent}
            </EditableWidgetWrapper>
            <EditableWidgetWrapper onEdit={() => setEditingWidget("donut")} style={{ flex: 1, minWidth: 0 }}>
              {DonutContent}
            </EditableWidgetWrapper>
          </div>
        );
      })()}

      {/* Status over time — line chart */}
      <EditableWidgetWrapper
        onEdit={() => setEditingWidget("history")}
        style={{ width: "100%" }}
      >
        <StatusHistoryChart history={resolvedHistoryData} memberName={memberName("history")} />
      </EditableWidgetWrapper>

      {/* Chart edit modal */}
      {editingWidget && (
        <ChartEditModal
          widgetKey={editingWidget}
          members={members}
          config={widgetConfig[editingWidget]}
          onSave={(cfg) => setWidgetConfig((prev) => ({ ...prev, [editingWidget]: cfg }))}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
