import { describe, it, expect } from "vitest";
import { TimelineRegroupArgsSchema } from "./timeline-tools.js";

describe("TimelineRegroupArgsSchema", () => {
  it("accepts a valid payload with all three kinds of change", () => {
    const parsed = TimelineRegroupArgsSchema.parse({
      displayText: "Group 4 projects under Customer Onboarding",
      reasoning: "Four projects share onboarding signals from last month's meetings",
      createCategories: [{ tempId: "cat_a1b2", name: "Customer Onboarding", colour: "#5fb4d3" }],
      moveProjects: [
        { projectId: "00000000-0000-0000-0000-000000000001", toCategoryTempId: "cat_a1b2" },
      ],
      recolourCategories: [
        { categoryId: "00000000-0000-0000-0000-000000000002", colour: "#111111" },
      ],
    });
    expect(parsed.createCategories).toHaveLength(1);
  });

  it("rejects more than 10 moveProjects", () => {
    const moves = Array.from({ length: 11 }, (_, i) => ({
      projectId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      toCategoryId: "00000000-0000-0000-0000-000000000aaa",
    }));
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40), moveProjects: moves,
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty payload (no changes)", () => {
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40),
    });
    expect(r.success).toBe(false);
  });

  it("rejects when moveProjects has both toCategoryTempId AND toCategoryId", () => {
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40),
      moveProjects: [{
        projectId: "00000000-0000-0000-0000-000000000001",
        toCategoryTempId: "cat_x1y2",
        toCategoryId:     "00000000-0000-0000-0000-000000000aaa",
      }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects displayText shorter than 10 chars", () => {
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "short",
      reasoning: "x".repeat(40),
      createCategories: [{ tempId: "cat_abc1", name: "X", colour: "#123456" }],
    });
    expect(r.success).toBe(false);
  });
});
