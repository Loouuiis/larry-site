import { describe, it, expect } from "vitest";
import type { ProjectCategory, GanttTask, PortfolioTimelineResponse } from "./index.js";

describe("gantt types", () => {
  it("ProjectCategory has the required fields", () => {
    const c: ProjectCategory = {
      id: "c1", tenantId: "t1", name: "Client work", colour: null,
      sortOrder: 0, parentCategoryId: null, projectId: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(c.name).toBe("Client work");
  });

  it("GanttTask allows parentTaskId null or string", () => {
    const t: GanttTask = {
      id: "t1", projectId: "p1", parentTaskId: null, title: "Task",
      status: "not_started", priority: "medium",
      assigneeUserId: null, assigneeName: null,
      startDate: null, endDate: null, dueDate: null, progressPercent: 0,
    };
    expect(t.parentTaskId).toBeNull();
  });

  it("PortfolioTimelineResponse nests categories > projects > tasks", () => {
    const r: PortfolioTimelineResponse = { categories: [], dependencies: [] };
    expect(r.categories).toEqual([]);
  });
});
