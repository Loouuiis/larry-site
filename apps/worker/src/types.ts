import { AgentRunState } from "@larry/shared";

export type IngestSource = "slack" | "email" | "calendar" | "transcript";

export const RUN_TRANSITIONS: Record<AgentRunState, AgentRunState[]> = {
  INGESTED: ["NORMALIZED", "FAILED"],
  NORMALIZED: ["EXTRACTED", "FAILED"],
  EXTRACTED: ["PROPOSED", "FAILED"],
  PROPOSED: ["APPROVAL_PENDING", "EXECUTED", "FAILED"],
  APPROVAL_PENDING: ["EXECUTED", "FAILED"],
  EXECUTED: ["VERIFIED", "FAILED"],
  VERIFIED: [],
  FAILED: [],
};

export const TERMINAL_RUN_STATES = new Set<AgentRunState>(["APPROVAL_PENDING", "VERIFIED", "FAILED"]);

export const IGNORED_SLACK_SUBTYPES = new Set([
  "bot_message",
  "channel_join",
  "channel_leave",
  "message_changed",
  "message_deleted",
]);

export interface AgentRunRow {
  id: string;
  state: AgentRunState;
  source: IngestSource;
  projectId: string | null;
  sourceRefId: string | null;
}

export interface CanonicalEventRow {
  id: string;
  source: IngestSource;
  payload: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAgentRunState(value: unknown): value is AgentRunState {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RUN_TRANSITIONS, value);
}

export function isIngestSource(value: unknown): value is IngestSource {
  return value === "slack" || value === "email" || value === "calendar" || value === "transcript";
}

export function canTransition(from: AgentRunState, to: AgentRunState): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}
