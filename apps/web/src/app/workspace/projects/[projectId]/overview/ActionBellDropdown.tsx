"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

interface ActionBellDropdownProps {
  suggested: WorkspaceLarryEvent[];
  onNavigateToAction: () => void;
}

export function ActionBellDropdown({ suggested, onNavigateToAction }: ActionBellDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = suggested.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          position: "relative",
        }}
        title={`${count} pending action${count !== 1 ? "s" : ""}`}
      >
        <Bell size={16} style={{ color: "var(--text-2)" }} />
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "#ef4444",
              color: "#fff",
              fontSize: "9px",
              fontWeight: 700,
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "320px",
            maxHeight: "340px",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "var(--shadow-1)",
            zIndex: 50,
          }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{
              padding: "10px 14px 6px",
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Pending Actions ({count})
          </div>
          {count === 0 ? (
            <p
              className="text-[12px]"
              style={{ padding: "16px 14px", color: "var(--text-muted)", textAlign: "center" }}
            >
              No pending actions
            </p>
          ) : (
            suggested.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigateToAction();
                }}
                className="flex w-full items-start gap-3 text-left"
                style={{
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    className="text-[12px] font-semibold"
                    style={{
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.displayText}
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {formatRelative(event.createdAt)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(value?: string | null): string {
  if (!value) return "Just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
