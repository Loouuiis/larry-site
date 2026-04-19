import { describe, it, expect } from "vitest";
import {
  toCategorySummaries,
  toProjectSummaries,
  type TimelineCategorySummary,
  type TimelineProjectSummary,
} from "./timeline.js";
import type { PortfolioTimelineResponse } from "./index.js";

const fixture: PortfolioTimelineResponse = {
  categories: [
    {
      id: "c1", name: "Customer", colour: "#ff0000", sortOrder: 0,
      parentCategoryId: null, projectId: null,
      projects: [
        { id: "p1", name: "Onboarding", status: "active", startDate: null, targetDate: null, tasks: [] },
        { id: "p2", name: "Renewal",    status: "active", startDate: null, targetDate: null, tasks: [] },
      ],
    },
    {
      id: null, name: "Uncategorised", colour: null, sortOrder: Number.MAX_SAFE_INTEGER,
      projects: [
        { id: "p3", name: "Misc", status: "active", startDate: null, targetDate: null, tasks: [] },
      ],
    },
  ],
  dependencies: [],
};

describe("toCategorySummaries", () => {
  it("skips the synthetic uncategorised bucket", () => {
    const result = toCategorySummaries(fixture);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("normalises optional parent/project fields to null", () => {
    const result = toCategorySummaries(fixture);
    expect(result[0].parentCategoryId).toBeNull();
    expect(result[0].projectId).toBeNull();
  });
});

describe("toProjectSummaries", () => {
  it("returns one entry per project including those under uncategorised", () => {
    const result = toProjectSummaries(fixture);
    expect(result).toHaveLength(3);
  });

  it("stitches the parent categoryId back onto each project", () => {
    const byId = Object.fromEntries(toProjectSummaries(fixture).map((p: TimelineProjectSummary) => [p.id, p]));
    expect(byId.p1.categoryId).toBe("c1");
    expect(byId.p2.categoryId).toBe("c1");
    expect(byId.p3.categoryId).toBeNull();
  });
});
