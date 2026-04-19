"use client";
import { Folder, CheckSquare } from "lucide-react";

interface Props {
  onChoose: (kind: "group" | "task") => void;
  onClose: () => void;
  taskLabel?: string;
}

const cardStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "20px 12px",
  background: "var(--surface-2)",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  cursor: "pointer",
  transition: "border-color 120ms, background 120ms",
};

export function AddItemPicker({ onChoose, onClose, taskLabel = "Task" }: Props) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative",
        background: "var(--surface, #fff)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 24,
        width: 320,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, marginBottom: 20, color: "var(--text-1)" }}>
          What do you want to create?
        </h3>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => onChoose("group")}
            style={cardStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-tint, rgba(108,68,246,0.06))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
            }}
          >
            <Folder size={28} strokeWidth={1.5} color="var(--brand)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>Group</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              Organise items into a named section
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChoose("task")}
            style={cardStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-tint, rgba(108,68,246,0.06))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
            }}
          >
            <CheckSquare size={28} strokeWidth={1.5} color="var(--brand)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{taskLabel}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              A piece of work to track and schedule
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
