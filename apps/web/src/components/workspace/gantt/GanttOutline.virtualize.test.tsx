// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GanttOutline } from "./GanttOutline";
import type { FlatRow } from "./gantt-utils";
import type { GanttNode } from "./gantt-types";
import type { RowSlice } from "./gantt-virtualize";
import { ROW_HEIGHT_TASK } from "./gantt-types";

// Integration check: with 500 rows + a windowed slice, only the slice's rows
// should actually render as outline-row DOM nodes. This closes the loop
// between the pure slicer tests (gantt-virtualize.test.ts) and the real
// GanttOutline render path — the thing users will actually see on large
// tenants.

function fakeRow(i: number): FlatRow {
  const id = `t${i}`;
  const node: GanttNode = {
    kind: "task",
    id,
    task: {
      id, projectId: "p", parentTaskId: null, categoryId: null, title: `Task ${i}`,
      status: "not_started", priority: "medium",
      assigneeUserId: null, assigneeName: null,
      startDate: null, endDate: null, dueDate: null, progressPercent: 0,
    },
    children: [],
  };
  return {
    kind: "node",
    key: `task:${id}`, depth: 0, height: ROW_HEIGHT_TASK, dimmed: false,
    hasChildren: false,
    categoryColor: "#6c44f6",
    node,
  };
}

describe("GanttOutline virtualization", () => {
  it("renders only the sliced rows when slice.disabled=false", () => {
    const rows = Array.from({ length: 500 }, (_, i) => fakeRow(i));
    // Render rows 100..120 (exactly 20 rows visible in the slice — caller
    // is expected to have already applied overscan).
    const slice: RowSlice = {
      startIdx: 100,
      endIdx: 120,
      offsetTop: 100 * ROW_HEIGHT_TASK,
      totalHeight: 500 * ROW_HEIGHT_TASK,
      disabled: false,
    };
    const { container } = render(
      <GanttOutline
        rows={rows}
        expanded={new Set()}
        selectedKey={null} hoveredKey={null}
        width={260} onWidthChange={() => {}}
        onToggle={() => {}} onSelect={() => {}} onHover={() => {}}
        slice={slice}
      />,
    );
    // Each rendered row's title span carries data-gantt-row-title — count
    // them for an exact assertion against the slice size.
    const rowTitles = container.querySelectorAll('[data-gantt-row-title]');
    expect(rowTitles.length).toBe(20);

    // ARIA grid pattern: rowgroup advertises the FULL row count, while
    // each row's aria-rowindex points at its 1-indexed position in the
    // unwindowed list. This is what lets screen readers say "row 101 of 500"
    // even though only 20 rows are in the DOM.
    const rowgroup = container.querySelector('[role="rowgroup"]');
    expect(rowgroup?.getAttribute("aria-rowcount")).toBe("500");
    const renderedRows = container.querySelectorAll('[role="row"]');
    expect(renderedRows.length).toBe(20);
    expect(renderedRows[0]?.getAttribute("aria-rowindex")).toBe("101");
    expect(renderedRows[19]?.getAttribute("aria-rowindex")).toBe("120");
    cleanup();
  });

  it("renders all rows when slice is omitted (back-compat path)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => fakeRow(i));
    const { container } = render(
      <GanttOutline
        rows={rows}
        expanded={new Set()}
        selectedKey={null} hoveredKey={null}
        width={260} onWidthChange={() => {}}
        onToggle={() => {}} onSelect={() => {}} onHover={() => {}}
      />,
    );
    const rowTitles = container.querySelectorAll('[data-gantt-row-title]');
    expect(rowTitles.length).toBe(50);
    const rowgroup = container.querySelector('[role="rowgroup"]');
    expect(rowgroup?.getAttribute("aria-rowcount")).toBe("50");
    cleanup();
  });
});
