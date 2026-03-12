import { describe, expect, it } from "vitest";
import { evaluateActionPolicy } from "../src/services/policy-engine.js";

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
  });
});
