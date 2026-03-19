import { describe, expect, it } from "vitest";
import { evaluateActionPolicy } from "@larry/ai";

describe("evaluateActionPolicy", () => {
  it("requires approval for high-impact actions", () => {
    const decision = evaluateActionPolicy({
      title: "Change deadline for launch",
      confidence: 0.95,
      impact: "high",
      reason: "Critical timeline shift",
      signals: ["deadline_change"],
    });

    expect(decision.requiresApproval).toBe(true);
  });

  it("allows low-risk high-confidence actions", () => {
    const decision = evaluateActionPolicy({
      title: "Send reminder",
      confidence: 0.92,
      impact: "low",
      reason: "No update in 3 days",
      signals: ["inactivity"],
    });

    expect(decision.requiresApproval).toBe(false);
    expect(decision.decision).toBe("auto_execute");
  });

  it("requires approval for strategic action types even with high confidence", () => {
    const decision = evaluateActionPolicy({
      title: "Move deadline for release candidate",
      confidence: 0.97,
      impact: "medium",
      actionType: "deadline_change",
      reason: "Customer committed launch date shifted",
      signals: ["deadline_shift"],
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.threshold).toContain("strategic_action_type");
  });
});
