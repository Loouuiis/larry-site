"use client";

export function ActionBox({
  pendingCount,
  onGoToActionCenter,
}: {
  pendingCount: number;
  onGoToActionCenter: () => void;
}) {
  const hasActions = pendingCount > 0;

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 18px",
        minWidth: "160px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <p
        className="text-[36px] font-extrabold"
        style={{ color: hasActions ? "#f59e0b" : "#22c55e" }}
      >
        {pendingCount}
      </p>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>
        {hasActions ? "Actions Pending" : "All Clear"}
      </p>
      <button
        type="button"
        onClick={onGoToActionCenter}
        className="mt-1.5 text-[11px] font-semibold"
        style={{ color: "#6c44f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Go to Action Center →
      </button>
    </div>
  );
}
