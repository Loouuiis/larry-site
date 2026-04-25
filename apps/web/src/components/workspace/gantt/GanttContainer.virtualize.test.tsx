// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GanttContainer } from "./GanttContainer";
import { ROW_HEIGHT_TASK, type GanttNode } from "./gantt-types";

// These tests pin Change 1 + Change 4: the scroll-ownership flip on the
// outer container is gated on BOTH (a) NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE
// === "true" and (b) rows.length > VIRTUALIZE_THRESHOLD. With either gate
// closed we keep `overflow: hidden` so the document continues to own
// page-scroll for the typical small-tenant case.

function makeRoot(taskCount: number): GanttNode {
  return {
    kind: "category",
    id: "c1",
    name: "Cat",
    colour: "#6c44f6",
    children: [
      {
        kind: "project",
        id: "p1",
        name: "Proj",
        status: "active",
        children: Array.from({ length: taskCount }, (_, i) => ({
          kind: "task" as const,
          id: `t${i}`,
          task: {
            id: `t${i}`, projectId: "p1", parentTaskId: null, categoryId: "c1",
            title: `Task ${i}`,
            status: "not_started", priority: "medium",
            assigneeUserId: null, assigneeName: null,
            startDate: null, endDate: null, dueDate: null, progressPercent: 0,
          },
          children: [],
        })),
      },
    ],
  } as GanttNode;
}

function findVirtAttr(container: HTMLElement): string | null {
  const el = container.querySelector("[data-gantt-virtualized]");
  return el?.getAttribute("data-gantt-virtualized") ?? null;
}

function findScrollContainer(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[data-gantt-virtualized]") as HTMLElement | null;
}

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE;

beforeEach(() => {
  // Stub ResizeObserver — jsdom doesn't ship one and the container's
  // viewport-height effect uses it.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE = ORIGINAL_FLAG;
  cleanup();
  vi.restoreAllMocks();
});

describe("GanttContainer scroll-ownership gating (Change 1 + Change 4)", () => {
  it("keeps overflow: hidden when flag is off, even with >200 rows", () => {
    process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE = "false";
    const root = makeRoot(300);
    const { container } = render(<GanttContainer root={root} />);
    expect(findVirtAttr(container)).toBe("false");
    const scrollEl = findScrollContainer(container);
    // overflow shorthand wins: virtualization off => `overflow: hidden`.
    expect(scrollEl?.style.overflow).toBe("hidden");
    expect(scrollEl?.style.overflowY).not.toBe("auto");
  });

  it("keeps overflow: hidden when row count <= threshold, even with flag on", () => {
    process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE = "true";
    const root = makeRoot(50); // far below VIRTUALIZE_THRESHOLD=200
    const { container } = render(<GanttContainer root={root} />);
    expect(findVirtAttr(container)).toBe("false");
    const scrollEl = findScrollContainer(container);
    expect(scrollEl?.style.overflow).toBe("hidden");
  });

  it("flips to overflowY: auto when flag on AND rows > threshold", () => {
    process.env.NEXT_PUBLIC_LARRY_GANTT_VIRTUALIZE = "true";
    const root = makeRoot(300);
    const { container } = render(<GanttContainer root={root} />);
    expect(findVirtAttr(container)).toBe("true");
    const scrollEl = findScrollContainer(container);
    expect(scrollEl?.style.overflowY).toBe("auto");
    expect(scrollEl?.style.overflowX).toBe("hidden");
  });

  // Sanity: the row constant exists and is non-zero (used elsewhere).
  it("ROW_HEIGHT_TASK constant is non-zero", () => {
    expect(ROW_HEIGHT_TASK).toBeGreaterThan(0);
  });
});
