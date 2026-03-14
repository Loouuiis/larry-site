import { describe, expect, it } from "vitest";
import { classifyRiskLevel, computeRiskScore } from "@larry/ai";

describe("risk scoring", () => {
  it("produces high risk with low progress, near deadline, inactivity and blockers", () => {
    const score = computeRiskScore({
      daysToDeadline: 1,
      progressPercent: 10,
      inactivityDays: 5,
      dependencyBlockedCount: 2,
    });

    expect(score).toBeGreaterThanOrEqual(70);
    expect(classifyRiskLevel(score)).toBe("high");
  });

  it("produces low risk for healthy task", () => {
    const score = computeRiskScore({
      daysToDeadline: 30,
      progressPercent: 80,
      inactivityDays: 0,
      dependencyBlockedCount: 0,
    });

    expect(score).toBeLessThan(35);
    expect(classifyRiskLevel(score)).toBe("low");
  });
});
