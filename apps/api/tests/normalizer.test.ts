import { describe, expect, it } from "vitest";
import { normalizeRawEvent } from "../src/services/ingest/normalizer.js";

describe("normalizeRawEvent", () => {
  it("classifies blocker events", () => {
    const event = normalizeRawEvent("tenant-1", {
      source: "slack",
      sourceEventId: "evt-1",
      payload: { text: "We are blocked by legal review" },
    });

    expect(event.eventType).toBe("blocker");
    expect(event.confidence).toBeGreaterThan(0.7);
  });

  it("falls back to other when no signal", () => {
    const event = normalizeRawEvent("tenant-1", {
      source: "email",
      sourceEventId: "evt-2",
      payload: { text: "FYI" },
    });

    expect(event.eventType).toBe("other");
  });
});
