import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

/**
 * B-005 follow-up: once an action has been executed (accepted or auto_executed),
 * the LLM's pre-modify narrative paragraph (`responseMessagePreview`) can no
 * longer be trusted as an audit trail — it may reflect the original proposed
 * priority / assignee / dueDate rather than what actually landed. The
 * structured `ActionDetailPreview` already renders from the live payload, so
 * we hide the narrative on resolved cards entirely and rely on that.
 */
export function shouldShowResponseNarrative(
  event: Pick<WorkspaceLarryEvent, "eventType">,
): boolean {
  return event.eventType === "suggested";
}
