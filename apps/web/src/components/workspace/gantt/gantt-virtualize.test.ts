import { describe, it, expect } from "vitest";
import {
  sliceVisibleRows,
  VIRTUALIZE_THRESHOLD,
  DEFAULT_OVERSCAN,
} from "./gantt-virtualize";

// Shared fixture: 500 rows, alternating 32/28 heights (category vs task).
// Total height = 250 * 32 + 250 * 28 = 8000 + 7000 = 15000px.
function makeHeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 32 : 28));
}

describe("sliceVisibleRows", () => {
  it("returns full range when rows.length <= threshold", () => {
    const heights = makeHeights(200);
    const slice = sliceVisibleRows({
      heights, scrollTop: 0, viewportHeight: 600, overscan: DEFAULT_OVERSCAN,
      flagEnabled: true,
    });
    expect(slice.disabled).toBe(true);
    expect(slice.startIdx).toBe(0);
    expect(slice.endIdx).toBe(200);
    expect(slice.offsetTop).toBe(0);
    expect(slice.totalHeight).toBe(heights.reduce((a, b) => a + b, 0));
  });

  it("activates once rows.length > threshold (flag on)", () => {
    const heights = makeHeights(VIRTUALIZE_THRESHOLD + 1);
    const slice = sliceVisibleRows({
      heights, scrollTop: 0, viewportHeight: 600, overscan: 0,
      flagEnabled: true,
    });
    expect(slice.disabled).toBe(false);
    // With viewport 600 starting at scrollTop 0, we fit 600/30 ≈ 20 rows.
    expect(slice.startIdx).toBe(0);
    expect(slice.endIdx).toBeGreaterThan(0);
    expect(slice.endIdx).toBeLessThan(heights.length);
  });

  it("stays disabled regardless of row count when flag is off", () => {
    // 500 rows is well over VIRTUALIZE_THRESHOLD, but flagEnabled=false must
    // short-circuit to disabled — the slicer never windows. This is the
    // safety net that lets us ship the code dark behind
    // NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE.
    const heights = makeHeights(500);
    const slice = sliceVisibleRows({
      heights, scrollTop: 1000, viewportHeight: 600, overscan: 5,
      flagEnabled: false,
    });
    expect(slice.disabled).toBe(true);
    expect(slice.startIdx).toBe(0);
    expect(slice.endIdx).toBe(500);
    expect(slice.offsetTop).toBe(0);
    expect(slice.totalHeight).toBe(heights.reduce((a, b) => a + b, 0));
  });

  it("skips rows above the viewport using cumulative heights", () => {
    const heights = makeHeights(500);
    // scrollTop = 1000px → row 0..(row whose cum exceeds 1000)
    const slice = sliceVisibleRows({
      heights, scrollTop: 1000, viewportHeight: 600, overscan: 0,
      flagEnabled: true,
    });
    expect(slice.disabled).toBe(false);
    // 1000 / 30 (avg) ≈ 33 rows above.
    expect(slice.startIdx).toBeGreaterThan(25);
    expect(slice.startIdx).toBeLessThan(40);
    // offsetTop equals cumulative height of skipped rows — a clean
    // invariant we can assert exactly.
    const skipped = heights.slice(0, slice.startIdx).reduce((a, b) => a + b, 0);
    expect(slice.offsetTop).toBe(skipped);
  });

  it("respects overscan above AND below the viewport", () => {
    const heights = makeHeights(500);
    const noOver = sliceVisibleRows({
      heights, scrollTop: 1000, viewportHeight: 600, overscan: 0,
      flagEnabled: true,
    });
    const withOver = sliceVisibleRows({
      heights, scrollTop: 1000, viewportHeight: 600, overscan: 5,
      flagEnabled: true,
    });
    expect(withOver.startIdx).toBe(Math.max(0, noOver.startIdx - 5));
    expect(withOver.endIdx).toBe(Math.min(heights.length, noOver.endIdx + 5));
  });

  it("clamps endIdx to rows.length when scrolled near the bottom", () => {
    const heights = makeHeights(500);
    const total = heights.reduce((a, b) => a + b, 0);
    // Scroll almost all the way down.
    const slice = sliceVisibleRows({
      heights, scrollTop: total - 100, viewportHeight: 600, overscan: 5,
      flagEnabled: true,
    });
    expect(slice.endIdx).toBe(500);
  });

  it("totalHeight is independent of scroll position (stable scroll extent)", () => {
    const heights = makeHeights(500);
    const expected = heights.reduce((a, b) => a + b, 0);
    for (const st of [0, 500, 2500, 10000, expected - 10]) {
      const slice = sliceVisibleRows({
        heights, scrollTop: st, viewportHeight: 600, overscan: 5,
        flagEnabled: true,
      });
      expect(slice.totalHeight).toBe(expected);
    }
  });

  it("returns rendered DOM count <= viewport-rows + overscan*2 bound", () => {
    const heights = makeHeights(500);
    const slice = sliceVisibleRows({
      heights, scrollTop: 1000, viewportHeight: 600, overscan: 10,
      flagEnabled: true,
    });
    const rendered = slice.endIdx - slice.startIdx;
    // Viewport / min row height = 600 / 28 ≈ 22 rows max. Plus overscan×2 = 20.
    // Keep a generous upper bound so the assertion isn't brittle.
    const maxViewportRows = Math.ceil(600 / 28);
    expect(rendered).toBeLessThanOrEqual(maxViewportRows + 10 * 2 + 2);
  });

  it("handles empty heights array", () => {
    const slice = sliceVisibleRows({
      heights: [], scrollTop: 0, viewportHeight: 600, overscan: 5,
      flagEnabled: true,
    });
    expect(slice.startIdx).toBe(0);
    expect(slice.endIdx).toBe(0);
    expect(slice.offsetTop).toBe(0);
    expect(slice.totalHeight).toBe(0);
    expect(slice.disabled).toBe(true);
  });

  it("handles zero viewport (element not yet measured)", () => {
    const heights = makeHeights(500);
    const slice = sliceVisibleRows({
      heights, scrollTop: 0, viewportHeight: 0, overscan: 0,
      flagEnabled: true,
    });
    // Should still render *something* so the first paint isn't blank.
    expect(slice.endIdx).toBeGreaterThan(0);
  });
});
