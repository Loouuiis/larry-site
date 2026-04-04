"use client";

export function ProjectDescriptionCard({ description }: { description?: string | null }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid rgba(108,68,246,0.15)",
        background: "rgba(108,68,246,0.06)",
        padding: "14px 18px",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.8px]"
        style={{ color: "#6c44f6", marginBottom: "6px" }}
      >
        Project Description
      </p>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {description?.trim() || "No description set. Add one in project settings."}
      </p>
    </div>
  );
}
