import { describe, expect, it } from "vitest";
import {
  aggregateTimeline2HealthStatusFromChildren,
  computeTimeline2RollupAggregateForSummaryNode,
  computeWeightedTimeline2SummaryProgress,
  type Timeline2SummaryRollupChildInput,
} from "./timeline2-rollup.js";

const emptyRollupBase = {
  actionRequiredCount: 0,
  dependencyWarningCount: 0,
  descendantCount: 0,
  assignees: [] as { userId: string; name: string; email: string }[],
};

describe("aggregateTimeline2HealthStatusFromChildren", () => {
  it("returns completed when every direct child rollup is completed", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["completed", "completed"],
        actionRequiredCount: 0,
      }),
    ).toBe("completed");
  });

  it("ignores parent-only semantics — only child statuses matter", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["completed", "completed"],
        actionRequiredCount: 0,
      }),
    ).toBe("completed");
  });

  it("returns blocked when subtree has action-required count", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["completed", "completed"],
        actionRequiredCount: 1,
      }),
    ).toBe("blocked");
  });

  it("uses in_progress for mixed complete / not_started among children", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["completed", "not_started"],
        actionRequiredCount: 0,
      }),
    ).toBe("in_progress");
  });

  it("returns completed when children mix completed and canceled (terminal)", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["completed", "cancelled"],
        actionRequiredCount: 0,
      }),
    ).toBe("completed");
  });

  it("returns cancelled when all children are canceled", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["cancelled", "cancelled"],
        actionRequiredCount: 0,
      }),
    ).toBe("cancelled");
  });

  it("returns in_progress when mixing in_progress and canceled", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["in_progress", "cancelled"],
        actionRequiredCount: 0,
      }),
    ).toBe("in_progress");
  });

  it("returns blocked when mixing blocked and canceled (blocked wins)", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["blocked", "cancelled"],
        actionRequiredCount: 0,
      }),
    ).toBe("blocked");
  });

  it("returns not_started when mixing canceled and not_started without completed", () => {
    expect(
      aggregateTimeline2HealthStatusFromChildren({
        childHealthStatuses: ["cancelled", "not_started"],
        actionRequiredCount: 0,
      }),
    ).toBe("not_started");
  });

});

describe("computeWeightedTimeline2SummaryProgress", () => {
  it("averages 100 and 0 with equal spans as 50", () => {
    expect(
      computeWeightedTimeline2SummaryProgress([
        {
          progress: 100,
          rollupStartDate: "2026-05-01",
          rollupDueDate: "2026-05-05",
        },
        {
          progress: 0,
          rollupStartDate: "2026-05-10",
          rollupDueDate: "2026-05-14",
        },
      ]),
    ).toBe(50);
  });

  it("excludes children with includeInProgressAverage false from weights", () => {
    expect(
      computeWeightedTimeline2SummaryProgress([
        {
          progress: 100,
          rollupStartDate: "2026-05-01",
          rollupDueDate: "2026-05-05",
        },
        {
          progress: 50,
          rollupStartDate: "2026-05-10",
          rollupDueDate: "2026-05-14",
          includeInProgressAverage: false,
        },
      ]),
    ).toBe(100);
  });

  it("returns 0 when every child is excluded", () => {
    expect(
      computeWeightedTimeline2SummaryProgress([
        {
          progress: 40,
          rollupStartDate: "2026-05-01",
          rollupDueDate: "2026-05-05",
          includeInProgressAverage: false,
        },
      ]),
    ).toBe(0);
  });
});

describe("computeTimeline2RollupAggregateForSummaryNode", () => {
  it("computes date span as earliest start and latest due among children", () => {
    const children: Timeline2SummaryRollupChildInput[] = [
      {
        progress: 0,
        directAssignees: [],
        rollup: {
          ...emptyRollupBase,
          healthStatus: "completed",
          priority: "medium",
          startDate: "2026-05-01",
          dueDate: "2026-05-05",
        },
      },
      {
        progress: 0,
        directAssignees: [],
        rollup: {
          ...emptyRollupBase,
          healthStatus: "completed",
          priority: "medium",
          startDate: "2026-05-10",
          dueDate: "2026-05-15",
        },
      },
    ];

    const { rollup } = computeTimeline2RollupAggregateForSummaryNode({
      children,
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    expect(rollup.startDate).toBe("2026-05-01");
    expect(rollup.dueDate).toBe("2026-05-15");
    expect(rollup.healthStatus).toBe("completed");
  });

  it("rollup Root → Child → two grandchildren (progress bubbles through Child)", () => {
    const gcA: Timeline2SummaryRollupChildInput = {
      progress: 100,
      directAssignees: [],
      rollup: {
        ...emptyRollupBase,
        descendantCount: 0,
        healthStatus: "completed",
        priority: "medium",
        startDate: "2026-05-01",
        dueDate: "2026-05-05",
      },
    };
    const gcB: Timeline2SummaryRollupChildInput = {
      progress: 0,
      directAssignees: [],
      rollup: {
        ...emptyRollupBase,
        descendantCount: 0,
        healthStatus: "completed",
        priority: "medium",
        startDate: "2026-05-10",
        dueDate: "2026-05-15",
      },
    };

    const childLayer = computeTimeline2RollupAggregateForSummaryNode({
      children: [gcA, gcB],
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    expect(childLayer.rollup.healthStatus).toBe("completed");
    expect(childLayer.weightedProgress).toBe(45);

    const rootLayer = computeTimeline2RollupAggregateForSummaryNode({
      children: [
        {
          progress: childLayer.weightedProgress,
          directAssignees: [],
          rollup: {
            ...childLayer.rollup,
          },
        },
      ],
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    expect(rootLayer.rollup.healthStatus).toBe("completed");
    expect(rootLayer.weightedProgress).toBe(45);
    expect(rootLayer.rollup.startDate).toBe("2026-05-01");
    expect(rootLayer.rollup.dueDate).toBe("2026-05-15");
  });

  it("merges direct assignees on children with subtree rollup assignees", () => {
    const ada = { userId: "u2", name: "Ada", email: "a@x.com" };
    const philip = { userId: "u1", name: "Philip", email: "p@x.com" };

    const grandchild: Timeline2SummaryRollupChildInput = {
      progress: 0,
      directAssignees: [ada],
      rollup: {
        ...emptyRollupBase,
        descendantCount: 0,
        healthStatus: "waiting",
        priority: "critical",
        startDate: "2026-05-09",
        dueDate: "2026-05-15",
        assignees: [ada],
      },
    };

    const mid = computeTimeline2RollupAggregateForSummaryNode({
      children: [grandchild],
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    const root = computeTimeline2RollupAggregateForSummaryNode({
      children: [
        {
          progress: mid.weightedProgress,
          directAssignees: [philip],
          rollup: {
            ...mid.rollup,
            assignees: mid.rollup.assignees,
          },
        },
      ],
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    const ids = root.rollup.assignees.map((a) => a.userId).sort();
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("root summary ignores stored not_started when sole child rollup is completed", () => {
    const { rollup } = computeTimeline2RollupAggregateForSummaryNode({
      children: [
        {
          progress: 100,
          directAssignees: [],
          rollup: {
            ...emptyRollupBase,
            descendantCount: 0,
            healthStatus: "completed",
            priority: "low",
            startDate: null,
            dueDate: null,
          },
        },
      ],
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    expect(rollup.healthStatus).toBe("completed");
  });

  it("excludes cancelled direct children from parent weighted progress", () => {
    const children: Timeline2SummaryRollupChildInput[] = [
      {
        progress: 100,
        directAssignees: [],
        rollup: {
          ...emptyRollupBase,
          healthStatus: "completed",
          priority: "medium",
          startDate: "2026-05-01",
          dueDate: "2026-05-05",
        },
      },
      {
        progress: 40,
        directAssignees: [],
        rollup: {
          ...emptyRollupBase,
          healthStatus: "cancelled",
          priority: "medium",
          startDate: "2026-05-10",
          dueDate: "2026-05-14",
        },
      },
    ];

    const { weightedProgress, rollup } = computeTimeline2RollupAggregateForSummaryNode({
      children,
      nodeOwnActionRequired: false,
      nodeDependencyWarnings: 0,
    });

    expect(rollup.healthStatus).toBe("completed");
    expect(weightedProgress).toBe(100);
  });
});
