import { AgentRunState } from "@larry/shared";

const transitions: Record<AgentRunState, AgentRunState[]> = {
  INGESTED: ["NORMALIZED", "FAILED"],
  NORMALIZED: ["EXTRACTED", "FAILED"],
  EXTRACTED: ["PROPOSED", "FAILED"],
  PROPOSED: ["APPROVAL_PENDING", "EXECUTED", "FAILED"],
  APPROVAL_PENDING: ["EXECUTED", "FAILED"],
  EXECUTED: ["VERIFIED", "FAILED"],
  VERIFIED: [],
  FAILED: [],
};

export function canTransition(from: AgentRunState, to: AgentRunState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: AgentRunState, to: AgentRunState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition from ${from} to ${to}`);
  }
}
