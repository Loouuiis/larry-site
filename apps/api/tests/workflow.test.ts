import { describe, expect, it } from "vitest";
import { canTransition } from "../src/services/agent/workflow.js";

describe("agent workflow transitions", () => {
  it("allows valid transitions", () => {
    expect(canTransition("INGESTED", "NORMALIZED")).toBe(true);
    expect(canTransition("PROPOSED", "APPROVAL_PENDING")).toBe(true);
    expect(canTransition("EXECUTED", "VERIFIED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("INGESTED", "VERIFIED")).toBe(false);
    expect(canTransition("FAILED", "NORMALIZED")).toBe(false);
    expect(canTransition("VERIFIED", "FAILED")).toBe(false);
  });
});
