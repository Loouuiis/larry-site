"use client";

export type CategoryDotTier = "category" | "project" | "task" | "subtask";

const SIZE_BY_TIER: Record<CategoryDotTier, number> = {
  category: 8,
  project:  7,
  task:     6,
  subtask:  5,
};

interface Props {
  color: string;
  tier: CategoryDotTier;
}

export function CategoryDot({ color, tier }: Props) {
  const size = SIZE_BY_TIER[tier];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
