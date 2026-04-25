// Timeline — windowed row rendering for large Gantts.
//
// Below VIRTUALIZE_THRESHOLD rows the current full-render path stays untouched
// (zero behavioural risk on typical tenants, which rarely exceed ~100 rows).
// Above the threshold we compute a cumulative-height slice: the caller then
// renders only rows `[startIdx, endIdx)` with a `paddingTop` spacer of
// `offsetTop` and a total scroll extent of `totalHeight`, so the outer scroll
// bar still reflects the full list.
//
// This is a pure function deliberately — both GanttOutline and GanttGrid call
// it with the same `heights` + `scrollTop`, which keeps the two columns in
// lock-step without a second source of truth.

export const VIRTUALIZE_THRESHOLD = 200;
export const DEFAULT_OVERSCAN = 8;

// Public env flag — `NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE`. Defaults to off so
// prod can ship the code dark and flip to on once we've smoke-tested. When
// the flag is unset or "false" we behave as if rows.length is always below
// VIRTUALIZE_THRESHOLD: slicer disabled, scroll-ownership unchanged. Read
// via process.env so Next inlines the value at build time.
export function isVirtualizeFlagEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE === "true";
}

// Combined gate: virtualization runs when both (a) the flag is on and
// (b) row count exceeds the threshold. Callers use this to mirror the
// slicer's `disabled` short-circuit on side concerns like scroll ownership.
export function isVirtualizeEnabled(rowCount: number): boolean {
  return isVirtualizeFlagEnabled() && rowCount > VIRTUALIZE_THRESHOLD;
}

export interface RowSlice {
  startIdx: number;      // first row to render (inclusive)
  endIdx: number;        // one past last row to render (exclusive)
  offsetTop: number;     // cumulative height of rows [0, startIdx) — used as paddingTop
  totalHeight: number;   // cumulative height of all rows (full scroll extent)
  disabled: boolean;     // true when virtualization is a no-op (short list / empty)
}

export function sliceVisibleRows(args: {
  heights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
  // Optional — when explicitly false, the slicer short-circuits to disabled
  // regardless of row count. When omitted, the env flag is consulted so
  // existing callers keep their semantics. Tests pass `flagEnabled: true`
  // explicitly to exercise the active path.
  flagEnabled?: boolean;
}): RowSlice {
  const { heights, scrollTop, viewportHeight, overscan } = args;
  const flagEnabled = args.flagEnabled ?? isVirtualizeFlagEnabled();
  const n = heights.length;
  let totalHeight = 0;
  for (let i = 0; i < n; i++) totalHeight += heights[i];

  if (n === 0) {
    return { startIdx: 0, endIdx: 0, offsetTop: 0, totalHeight: 0, disabled: true };
  }
  if (!flagEnabled || n <= VIRTUALIZE_THRESHOLD) {
    return { startIdx: 0, endIdx: n, offsetTop: 0, totalHeight, disabled: true };
  }

  // Advance y until we pass scrollTop — that's where rendering begins.
  let y = 0;
  let startIdx = 0;
  while (startIdx < n && y + heights[startIdx] <= scrollTop) {
    y += heights[startIdx];
    startIdx++;
  }

  // Advance until we pass scrollTop + viewportHeight — endIdx is one past.
  const bottom = scrollTop + Math.max(viewportHeight, 1); // guard zero-height mount
  let endIdx = startIdx;
  let endY = y;
  while (endIdx < n && endY < bottom) {
    endY += heights[endIdx];
    endIdx++;
  }

  // Apply overscan symmetrically. offsetTop snaps to the new startIdx by
  // subtracting the heights of newly-included rows above.
  const overStart = Math.max(0, startIdx - overscan);
  const overEnd = Math.min(n, endIdx + overscan);
  let offsetTop = y;
  for (let i = overStart; i < startIdx; i++) offsetTop -= heights[i];

  return { startIdx: overStart, endIdx: overEnd, offsetTop, totalHeight, disabled: false };
}
