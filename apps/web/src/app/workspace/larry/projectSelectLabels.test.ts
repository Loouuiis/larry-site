import { describe, it, expect } from "vitest";
import { buildProjectSelectLabels } from "./projectSelectLabels";

describe("buildProjectSelectLabels (B-011)", () => {
  it("leaves unique project names untouched", () => {
    const labels = buildProjectSelectLabels([
      { id: "aaaaaa-1", name: "Alpha", updatedAt: "2026-04-18T10:00:00Z" },
      { id: "bbbbbb-2", name: "Beta", updatedAt: "2026-04-18T10:00:00Z" },
    ]);
    expect(labels.get("aaaaaa-1")).toBe("Alpha");
    expect(labels.get("bbbbbb-2")).toBe("Beta");
  });

  it("suffixes duplicate names with the updatedAt date", () => {
    const labels = buildProjectSelectLabels([
      { id: "aaa111", name: "Verify child", updatedAt: "2026-04-18T10:00:00Z" },
      { id: "bbb222", name: "Verify child", updatedAt: "2026-04-15T08:00:00Z" },
    ]);
    expect(labels.get("aaa111")).toBe("Verify child · 2026-04-18");
    expect(labels.get("bbb222")).toBe("Verify child · 2026-04-15");
  });

  it("escalates to date + short id when duplicates share a date", () => {
    const labels = buildProjectSelectLabels([
      { id: "0400604c-2df6-431c-afa2-da3f4d86ef2e", name: "Verify-109 child — EDITED", updatedAt: "2026-04-18T10:00:00Z" },
      { id: "67c42816-6e03-4712-8b60-e7da409ca426", name: "Verify-109 child — EDITED", updatedAt: "2026-04-18T11:00:00Z" },
      { id: "2cd6648b-7eae-42e9-8dfb-b2c05e0ea0cf", name: "Verify-109 child — EDITED", updatedAt: "2026-04-18T12:00:00Z" },
    ]);
    const out = [...labels.values()];
    // All three must be distinct — this is the regression #149 missed.
    expect(new Set(out).size).toBe(3);
    for (const label of out) {
      expect(label.startsWith("Verify-109 child — EDITED · 2026-04-18 · ")).toBe(true);
    }
    expect(labels.get("0400604c-2df6-431c-afa2-da3f4d86ef2e")).toContain("040060");
    expect(labels.get("67c42816-6e03-4712-8b60-e7da409ca426")).toContain("67c428");
    expect(labels.get("2cd6648b-7eae-42e9-8dfb-b2c05e0ea0cf")).toContain("2cd664");
  });

  it("falls back to short id when updatedAt is missing for duplicates", () => {
    const labels = buildProjectSelectLabels([
      { id: "aaaaaaaa", name: "Dup", updatedAt: null },
      { id: "bbbbbbbb", name: "Dup", updatedAt: undefined },
    ]);
    expect(labels.get("aaaaaaaa")).toBe("Dup · aaaaaa");
    expect(labels.get("bbbbbbbb")).toBe("Dup · bbbbbb");
  });

  it("name comparison is case/whitespace-insensitive", () => {
    const labels = buildProjectSelectLabels([
      { id: "x1", name: "Alpha", updatedAt: "2026-04-18T10:00:00Z" },
      { id: "x2", name: " alpha ", updatedAt: "2026-04-15T08:00:00Z" },
    ]);
    // Both end up with suffixes since they collide under the normalised key.
    expect(labels.get("x1")).toBe("Alpha · 2026-04-18");
    expect(labels.get("x2")).toBe(" alpha  · 2026-04-15");
  });
});
