"use client";
import { tinyTint } from "./gantt-utils";

export type CategoryDotTier = "category" | "project" | "task" | "subtask";

const SIZE_BY_TIER: Record<CategoryDotTier, number> = {
  category: 8,
  project: 7,
  task: 5,
  subtask: 4,
};

const OPACITY_BY_TIER: Record<CategoryDotTier, number> = {
  category: 1,
  project: 0.8,
  task: 0.6,
  subtask: 0.5,
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
        opacity: OPACITY_BY_TIER[tier],
        boxShadow: tier === "category" ? `0 0 0 2px ${tinyTint(color, 0.18)}` : "none",
        flexShrink: 0,
      }}
    />
  );
}
