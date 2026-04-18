"use client";

import { useCallback, useEffect, useState } from "react";
import { getTimezone } from "@/lib/timezone-context";
import type {
  CanonicalEventRuntimeStatus,
  WorkspaceCanonicalEventRuntimeEntry,
  WorkspaceCanonicalEventRuntimeResponse,
  WorkspaceCanonicalEventRuntimeSummary,
} from "@/app/dashboard/types";
import { SettingsSubnav } from "../SettingsSubnav";

type RuntimeStatusFilter = "all" | CanonicalEventRuntimeStatus;
type RuntimeSourceFilter = "all" | "slack" | "email" | "calendar" | "transcript";

interface BulkRetryResponse {
  dryRun: boolean;
  candidateCount: number;
  queuedCount?: number;
  skippedCount?: number;
  error?: string;
}

const EMPTY_SUMMARY: WorkspaceCanonicalEventRuntimeSummary = {
  runningCount: 0,
  succeededCount: 0,
  retryableFailedCount: 0,
  deadLetteredCount: 0,
  unprocessedCount: 0,
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  return new Date(value).toLocaleString("en-GB", { timeZone: getTimezone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSource(value: string): string {
  switch (value) {
    case "slack":
      return "Slack";
    case "email":
      return "Email";
    case "calendar":
      return "Calendar";
    case "transcript":
      return "Transcript";
    default:
      return value;
  }
}

function formatStatus(value: CanonicalEventRuntimeStatus | null): string {
  if (!value) return "Unprocessed";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(value: CanonicalEventRuntimeStatus | null): { bg: string; color: string; border: string } {
  if (value === "running") {
    return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
  }
  if (value === "succeeded") {
    return { bg: "#ecfdf3", color: "#166534", border: "#bbf7d0" };
  }
  if (value === "retryable_failed") {
    return { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" };
  }
  if (value === "dead_lettered") {
    return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" };
  }
  return { bg: "var(--surface-2)", color: "var(--text-2)", border: "var(--border)" };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function ReliabilityPage() {
  const [statusFilter, setStatusFilter] = useState<RuntimeStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<RuntimeSourceFilter>("all");
  const [limit, setLimit] = useState(25);
  const [items, setItems] = useState<WorkspaceCanonicalEventRuntimeEntry[]>([]);
  const [summary, setSummary] = useState<WorkspaceCanonicalEventRuntimeSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkRetryResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      params.set("limit", String(limit));

      const response = await fetch(`/api/workspace/larry/runtime/canonical-events?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await readJson<WorkspaceCanonicalEventRuntimeResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load reliability runtime data.");
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
      setSummary(payload.summary ?? EMPTY_SUMMARY);
    } catch (loadError) {
      setItems([]);
      setSummary(EMPTY_SUMMARY);
      setError(loadError instanceof Error ? loadError.message : "Failed to load reliability runtime data.");
    } finally {
      setLoading(false);
    }
  }, [limit, sourceFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryOne(canonicalEventId: string) {
    setRetryingId(canonicalEventId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspace/larry/runtime/canonical-events/${encodeURIComponent(canonicalEventId)}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Manual operator retry from workspace reliability view." }),
        }
      );
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to queue retry.");
      }
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed to queue retry.");
    } finally {
      setRetryingId(null);
    }
  }

  async function runBulkRetry(execute: boolean) {
    setBulkBusy(true);
    setError(null);
    setBulkResult(null);
    try {
      const payload = {
        status:
          statusFilter === "all" || statusFilter === "running" || statusFilter === "succeeded"
            ? "all"
            : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit,
        execute,
        reason: execute ? "Bulk retry queued from workspace reliability view." : undefined,
      };
      const response = await fetch("/api/workspace/larry/runtime/canonical-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJson<BulkRetryResponse>(response);
      if (!response.ok) {
        throw new Error(body.error ?? "Bulk retry request failed.");
      }
      setBulkResult(body);
      if (execute) {
        await load();
      }
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk retry request failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px 32px",
        }}
      >
        <h1 className="text-h1">Settings</h1>
        <p className="text-body-sm" style={{ marginTop: "4px" }}>
          Operator recovery for canonical event processing retries and dead-letter triage
        </p>
        <SettingsSubnav active="reliability" />
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 py-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Running", value: summary.runningCount },
            { label: "Succeeded", value: summary.succeededCount },
            { label: "Retryable", value: summary.retryableFailedCount },
            { label: "Dead-letter", value: summary.deadLetteredCount },
            { label: "Unprocessed", value: summary.unprocessedCount },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "14px 16px",
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                {card.label}
              </p>
              <p className="mt-2 text-[24px] font-semibold" style={{ color: "var(--text-1)" }}>
                {card.value}
              </p>
            </div>
          ))}
        </section>

        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "16px",
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as RuntimeStatusFilter)}
                className="rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <option value="all">All</option>
                <option value="running">Running</option>
                <option value="succeeded">Succeeded</option>
                <option value="retryable_failed">Retryable failed</option>
                <option value="dead_lettered">Dead-lettered</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
              Source
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as RuntimeSourceFilter)}
                className="rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <option value="all">All</option>
                <option value="slack">Slack</option>
                <option value="email">Email</option>
                <option value="calendar">Calendar</option>
                <option value="transcript">Transcript</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
              Limit
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(event) => {
                  const numeric = Number(event.target.value);
                  if (!Number.isFinite(numeric)) return;
                  setLimit(Math.max(1, Math.min(100, Math.floor(numeric))));
                }}
                className="w-[90px] rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              />
            </label>
            <button type="button" className="pm-btn pm-btn-secondary pm-btn-sm" onClick={() => void load()}>
              Refresh
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-secondary pm-btn-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkRetry(false)}
            >
              {bulkBusy ? "Working..." : "Preview bulk retry"}
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-primary pm-btn-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkRetry(true)}
            >
              {bulkBusy ? "Queueing..." : "Queue bulk retry"}
            </button>
          </div>

          {bulkResult && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--text-2)" }}>
              {bulkResult.dryRun
                ? `Dry-run candidates: ${bulkResult.candidateCount}`
                : `Queued ${bulkResult.queuedCount ?? 0} of ${bulkResult.candidateCount} candidates (skipped ${bulkResult.skippedCount ?? 0}).`}
            </p>
          )}
        </section>

        {error && (
          <div
            className="rounded-[14px] border px-4 py-3 text-[13px]"
            style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  {["Canonical event", "Source", "Latest status", "Attempt", "Idempotency", "Latest update", "Actions"].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-4 text-[13px]" colSpan={7} style={{ color: "var(--text-2)" }}>
                      Loading runtime reliability data...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-[13px]" colSpan={7} style={{ color: "var(--text-2)" }}>
                      No canonical event runtime entries match this filter.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const tone = statusTone(item.latestStatus);
                    const canRetry =
                      item.latestStatus === "retryable_failed" || item.latestStatus === "dead_lettered";
                    return (
                      <tr key={item.canonicalEventId} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-3 align-top text-[12px]" style={{ color: "var(--text-2)" }}>
                          <p className="font-semibold" style={{ color: "var(--text-1)" }}>
                            {item.canonicalEventId}
                          </p>
                          <p className="mt-1">{item.eventType}</p>
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]" style={{ color: "var(--text-2)" }}>
                          {formatSource(item.source)}
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]">
                          <span
                            className="inline-flex rounded-full border px-2 py-0.5 font-semibold"
                            style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}
                          >
                            {formatStatus(item.latestStatus)}
                          </span>
                          {item.latestErrorMessage && (
                            <p className="mt-1 max-w-[260px]" style={{ color: "var(--text-muted)" }}>
                              {item.latestErrorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]" style={{ color: "var(--text-2)" }}>
                          {item.latestAttemptNumber ?? 0}/{item.latestMaxAttempts ?? 0}
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]" style={{ color: "var(--text-2)" }}>
                          <p>{item.idempotencyKey ?? "n/a"}</p>
                          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            siblings: {item.canonicalSiblingCount}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]" style={{ color: "var(--text-2)" }}>
                          <p>{formatDate(item.latestUpdatedAt ?? item.canonicalCreatedAt)}</p>
                          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            started {formatDate(item.latestStartedAt)}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top text-[12px]">
                          <button
                            type="button"
                            disabled={!canRetry || retryingId === item.canonicalEventId}
                            onClick={() => {
                              void retryOne(item.canonicalEventId);
                            }}
                            className="rounded-full border px-3 py-1 font-semibold"
                            style={{
                              borderColor: canRetry ? "var(--cta)" : "var(--border)",
                              color: canRetry ? "var(--cta)" : "var(--text-muted)",
                              background: "var(--surface)",
                            }}
                          >
                            {retryingId === item.canonicalEventId ? "Queueing..." : "Retry"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
