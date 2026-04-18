"use client";
import { Tag } from "lucide-react";

type Variant =
  | { kind: "noCategories"; onCreate: () => void }
  | { kind: "emptyCategory" }
  | { kind: "emptyProject" }
  | { kind: "noSearchMatch"; query: string };

export function GanttEmptyState(props: Variant) {
  if (props.kind === "noCategories") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "60px 20px",
          color: "var(--text-2)",
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--surface-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--brand)",
          }}
        >
          <Tag size={22} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
          No categories yet
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Create one to start organising your timeline.
        </div>
        <button
          onClick={props.onCreate}
          style={{
            marginTop: 8,
            height: 40,
            padding: "0 16px",
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + Create your first category
        </button>
      </div>
    );
  }

  if (props.kind === "emptyCategory") {
    return <EmptyHint>No projects yet — right-click to add.</EmptyHint>;
  }
  if (props.kind === "emptyProject") {
    return <EmptyHint>No tasks yet.</EmptyHint>;
  }
  // noSearchMatch
  return (
    <div
      style={{
        padding: "8px 12px",
        fontSize: 12,
        background: "var(--surface-2)",
        color: "var(--text-2)",
        borderRadius: 6,
        margin: "8px 14px",
      }}
    >
      No matches for &ldquo;{props.query}&rdquo;.
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 24,
        display: "flex",
        alignItems: "center",
        paddingLeft: 42,
        fontSize: 12,
        fontStyle: "italic",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </div>
  );
}
