import type { PortfolioTimelineResponse, PortfolioTimelineCategory, PortfolioTimelineProject } from "./index.js";

/** Subset of ProjectCategory that's actually needed by timeline renderers. */
export interface TimelineCategorySummary {
  id: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;
  projectId: string | null;
}

export interface TimelineProjectSummary {
  id: string;
  categoryId: string | null;
}

export function toCategorySummaries(
  resp: PortfolioTimelineResponse,
): TimelineCategorySummary[] {
  return resp.categories
    .filter((c): c is PortfolioTimelineCategory & { id: string } => c.id !== null)
    .map((c: PortfolioTimelineCategory & { id: string }) => ({
      id: c.id,
      name: c.name,
      colour: c.colour,
      sortOrder: c.sortOrder,
      parentCategoryId: c.parentCategoryId ?? null,
      projectId: c.projectId ?? null,
    }));
}

export function toProjectSummaries(
  resp: PortfolioTimelineResponse,
): TimelineProjectSummary[] {
  return resp.categories.flatMap((c: PortfolioTimelineCategory) =>
    c.projects.map((p: PortfolioTimelineProject) => ({ id: p.id, categoryId: c.id ?? null })),
  );
}
