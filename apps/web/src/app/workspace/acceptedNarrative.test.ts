import { describe, it, expect } from "vitest";
import { shouldShowResponseNarrative } from "./acceptedNarrative";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

type EventType = WorkspaceLarryEvent["eventType"];

function evt(eventType: EventType): Pick<WorkspaceLarryEvent, "eventType"> {
  return { eventType };
}

describe("shouldShowResponseNarrative (B-005 follow-up)", () => {
  it("shows the narrative only while the action is still pending", () => {
    expect(shouldShowResponseNarrative(evt("suggested"))).toBe(true);
  });

  it("hides the narrative on accepted cards", () => {
    expect(shouldShowResponseNarrative(evt("accepted"))).toBe(false);
  });

  it("hides the narrative on auto_executed cards", () => {
    expect(shouldShowResponseNarrative(evt("auto_executed"))).toBe(false);
  });

  it("hides the narrative on dismissed cards", () => {
    expect(shouldShowResponseNarrative(evt("dismissed"))).toBe(false);
  });

  // Explicit reproduction of the 2026-04-21 observation: user proposed a task
  // at `high` priority, Modify upgraded it to `critical`, Accept executed.
  // The narrative still reads "has been created with high priority" because
  // it is a cached copy of the original LLM reply. Asserting the helper
  // returns false guarantees the resolved card will not surface that
  // stale priority word.
  it("does not surface a stale priority when the executed priority differs from the original", () => {
    const accepted: Pick<WorkspaceLarryEvent, "eventType"> & {
      responseMessagePreview: string;
      payload: { priority: string };
    } = {
      eventType: "accepted",
      responseMessagePreview: "The task has been created with **high** priority.",
      payload: { priority: "critical" },
    };

    // The helper is the single gate in both render sites (/workspace/actions
    // and /workspace/projects/[id]?tab=actions), so this assertion
    // transitively proves neither Accepted card will show the stale word.
    expect(shouldShowResponseNarrative(accepted)).toBe(false);
  });
});
