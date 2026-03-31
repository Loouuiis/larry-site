import { z } from "zod";

export const PROJECT_STATUS_VALUES = ["all", "active", "archived"] as const;

export type ProjectStatusFilter = (typeof PROJECT_STATUS_VALUES)[number];
export type ProjectStatus = Exclude<ProjectStatusFilter, "all">;

export const ProjectStatusFilterSchema = z.enum(PROJECT_STATUS_VALUES);

export const ACTIVE_PROJECT_STATUS: ProjectStatus = "active";
export const ARCHIVED_PROJECT_STATUS: ProjectStatus = "archived";

export function normalizeProjectStatus(value: string | null | undefined): ProjectStatus {
  return value === ARCHIVED_PROJECT_STATUS ? ARCHIVED_PROJECT_STATUS : ACTIVE_PROJECT_STATUS;
}

export function projectStatusSql(statusColumn: string): string {
  return `CASE WHEN ${statusColumn} = '${ARCHIVED_PROJECT_STATUS}' THEN '${ARCHIVED_PROJECT_STATUS}' ELSE '${ACTIVE_PROJECT_STATUS}' END`;
}

export function appendProjectStatusFilter(input: {
  filters: string[];
  values: unknown[];
  filter?: ProjectStatusFilter;
  statusColumn: string;
}): void {
  const filter = input.filter ?? "all";
  if (filter === "all") return;

  input.values.push(filter);
  input.filters.push(`${projectStatusSql(input.statusColumn)} = $${input.values.length}`);
}
