import { describe, it, expect } from "vitest";
import { buildOrgTimelineContext, shouldRunOrgPass } from "./org-intelligence.js";

describe("buildOrgTimelineContext", () => {
  it("compresses categories + projects into a tabular format", () => {
    const ctx = buildOrgTimelineContext({
      tenantId: "t",
      categories: [
        { id: "c1", name: "A", colour: "#fff", parentCategoryId: null, projectId: null, createdAt: "", lastRenamedAt: null },
      ],
      projects: [
        { id: "p1", name: "P1", categoryId: "c1", status: "active", createdAt: "" },
      ],
      recentSignals: [],
      pendingTimelineSuggestions: [],
    });
    expect(ctx).toMatch(/cat\|c1\|A/);
    expect(ctx).toMatch(/proj\|p1\|P1\|c1/);
  });

  it("truncates recentSignals to 20 and each excerpt to 200 chars", () => {
    const signals = Array.from({ length: 30 }, (_, i) => ({
      projectId: "p",
      source: "email",
      excerpt: "x".repeat(400) + "_" + i,
    }));
    const ctx = buildOrgTimelineContext({
      tenantId: "t", categories: [], projects: [],
      recentSignals: signals, pendingTimelineSuggestions: [],
    });
    const signalLines = ctx.split("\n").filter((l: string) => l.startsWith("signal|"));
    expect(signalLines).toHaveLength(20);
    for (const line of signalLines) {
      expect(line.length).toBeLessThanOrEqual(260);  // prefix + 200 char excerpt + projectId + source + separators
    }
  });

  it("renders pending suggestions with a clear 'do not duplicate' header", () => {
    const ctx = buildOrgTimelineContext({
      tenantId: "t", categories: [], projects: [], recentSignals: [],
      pendingTimelineSuggestions: ["Group 3 projects under Theme A", "Recolour Theme B"],
    });
    expect(ctx).toMatch(/DO NOT duplicate/i);
    expect(ctx).toMatch(/pending\|Group 3 projects/);
    expect(ctx).toMatch(/pending\|Recolour Theme B/);
  });
});

describe("shouldRunOrgPass", () => {
  it("skips when 3+ pending timeline suggestions already exist", () => {
    expect(shouldRunOrgPass({ pendingCount: 3, lastRunMinutesAgo: 120 })).toBe(false);
    expect(shouldRunOrgPass({ pendingCount: 4, lastRunMinutesAgo: 120 })).toBe(false);
  });
  it("skips when the last run was less than an hour ago", () => {
    expect(shouldRunOrgPass({ pendingCount: 0, lastRunMinutesAgo: 30 })).toBe(false);
    expect(shouldRunOrgPass({ pendingCount: 0, lastRunMinutesAgo: 59 })).toBe(false);
  });
  it("runs at the hour mark with no pending", () => {
    expect(shouldRunOrgPass({ pendingCount: 0, lastRunMinutesAgo: 60 })).toBe(true);
    expect(shouldRunOrgPass({ pendingCount: 2, lastRunMinutesAgo: 120 })).toBe(true);
  });
});
