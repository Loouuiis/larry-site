"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function SkeletonLine({
  width,
  height,
  borderRadius,
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}) {
  return (
    <div
      className="pm-shimmer"
      style={{
        width: width ?? "100%",
        height: height ?? "13px",
        borderRadius: borderRadius ?? "4px",
      }}
    />
  );
}

export function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div
        className="pm-shimmer"
        style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }}
      />
      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        <SkeletonLine width="55%" height={13} />
        <SkeletonLine width="35%" height={11} />
      </div>
      <SkeletonLine width={60} height={18} borderRadius="999px" />
      <SkeletonLine width={60} height={13} />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className="pm-shimmer h-[180px]"
      style={{ borderRadius: "var(--radius-card)" }}
    />
  );
}

type PageStateProps = {
  loading: boolean;
  skeleton?: ReactNode;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  onEmptyCta?: () => void;
  children?: ReactNode;
};

export function PageState({
  loading,
  skeleton,
  error,
  onRetry,
  empty,
  emptyIcon,
  emptyTitle,
  emptyBody,
  emptyCta,
  onEmptyCta,
  children,
}: PageStateProps) {
  if (loading) {
    return (
      <>
        {skeleton ?? (
          <div className="flex flex-col gap-3 py-4">
            <SkeletonLine width="60%" />
            <SkeletonLine width="80%" />
            <SkeletonLine width="45%" />
          </div>
        )}
      </>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg px-4 py-3"
        style={{
          border: "1px solid #ef4444",
          background: "#fff6f7",
          color: "#ef4444",
        }}
      >
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span className="flex-1 text-[13px]">{error}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center px-3 py-1 text-[12px] font-semibold text-white"
            style={{
              background: "var(--cta)",
              borderRadius: "var(--radius-btn)",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className="border border-dashed px-6 py-10 text-center"
        style={{
          borderColor: "var(--border-2)",
          borderRadius: "var(--radius-card)",
          background: "var(--surface)",
        }}
      >
        {emptyIcon && (
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: "var(--surface-2)" }}
          >
            {emptyIcon}
          </div>
        )}
        {emptyTitle && (
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
            {emptyTitle}
          </p>
        )}
        {emptyBody && (
          <p
            className="mx-auto mt-2 max-w-md text-[13px] leading-6"
            style={{ color: "var(--text-2)" }}
          >
            {emptyBody}
          </p>
        )}
        {emptyCta && onEmptyCta && (
          <button
            type="button"
            onClick={onEmptyCta}
            className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-white"
            style={{
              background: "var(--cta)",
              borderRadius: "var(--radius-btn)",
              height: "36px",
              padding: "0 16px",
              border: "none",
              cursor: "pointer",
            }}
          >
            {emptyCta}
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
