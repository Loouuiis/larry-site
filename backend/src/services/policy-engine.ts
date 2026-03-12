import { ExtractedAction } from "../types/domain.js";

export type PolicyDecision = {
  requiresApproval: boolean;
  reason: string;
};

export function evaluateActionPolicy(action: ExtractedAction): PolicyDecision {
  if (action.impact === "high") {
    return { requiresApproval: true, reason: "High-impact action requires human approval." };
  }

  if (action.confidence < 0.75) {
    return { requiresApproval: true, reason: "Low confidence extraction requires review." };
  }

  if (/deadline|owner|scope|budget|external/i.test(action.reason + " " + action.title)) {
    return {
      requiresApproval: true,
      reason: "Action appears to modify critical accountability or commitment terms.",
    };
  }

  return { requiresApproval: false, reason: "Low-risk, high-confidence operational action." };
}
