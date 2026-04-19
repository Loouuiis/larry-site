"use client";
import { useQuery } from "@tanstack/react-query";
import type { PortfolioTimelineResponse } from "@larry/shared";
import {
  toCategorySummaries,
  toProjectSummaries,
  type TimelineCategorySummary,
  type TimelineProjectSummary,
} from "@larry/shared";

export const QK_TIMELINE_ORG = ["timeline", "org"] as const;

// Single source of truth for the timeline payload. Both the org and
// project Gantt surfaces read from this hook; no component writes into
// sibling cache keys.
export function useTimelineSnapshot() {
  return useQuery({
    queryKey: QK_TIMELINE_ORG,
    queryFn: async (): Promise<PortfolioTimelineResponse> => {
      const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

interface CategoriesView {
  categories: TimelineCategorySummary[];
}
interface ProjectsView {
  items: TimelineProjectSummary[];
}

export function useCategoriesFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return {
    ...rest,
    data: data
      ? ({ categories: toCategorySummaries(data) } satisfies CategoriesView)
      : undefined,
  };
}

export function useProjectsFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return {
    ...rest,
    data: data
      ? ({ items: toProjectSummaries(data) } satisfies ProjectsView)
      : undefined,
  };
}
