"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { useToast } from "./ToastContext";

const TOAST_DURATION_MS = 4000;

function Toast({
  id,
  actionLabel,
  actionColor,
  displayText,
  projectName,
  projectId,
  onRemove,
}: {
  id: string;
  actionLabel: string;
  actionColor: string;
  displayText: string;
  projectName: string | null;
  projectId: string | null;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [id, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        overflow: "hidden",
        borderRadius: "10px",
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e5e7eb)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        width: 340,
        position: "relative",
      }}
    >
      {/* Color stripe */}
      <div style={{ width: 4, flexShrink: 0, background: actionColor }} />

      <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: actionColor,
                whiteSpace: "nowrap",
              }}
            >
              {actionLabel}
            </span>
            {projectName && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-2, #6b7280)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                in {projectName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Dismiss notification"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "var(--text-2, #6b7280)",
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Display text */}
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            lineHeight: 1.4,
            color: "var(--text-1, #1f2937)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {displayText}
        </p>

        {/* Project link */}
        {projectId && (
          <Link
            href={`/workspace/projects/${projectId}`}
            onClick={() => onRemove(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "#6c44f6",
              textDecoration: "none",
            }}
          >
            Open project <ArrowRight size={12} />
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: TOAST_DURATION_MS / 1000, ease: "linear" }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: actionColor,
          transformOrigin: "left",
          opacity: 0.5,
        }}
      />
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: 56,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <Toast {...toast} onRemove={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
