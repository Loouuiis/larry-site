// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineSuggestionPreview } from "./TimelineSuggestionPreview";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

const baseEvent = {
  id: "e1",
  projectId: "",
  projectName: null,
  eventType: "suggested" as const,
  actionType: "timeline_regroup",
  displayText: "Group 3 projects under Customer Onboarding",
  reasoning: "They share onboarding signals from last month.",
  payload: {
    displayText: "Group 3 projects under Customer Onboarding",
    reasoning: "They share onboarding signals from last month.",
    createCategories: [{ tempId: "cat_a", name: "Customer Onboarding", colour: "#5fb4d3" }],
    moveProjects: [
      { projectId: "p1", toCategoryTempId: "cat_a" },
      { projectId: "p2", toCategoryTempId: "cat_a" },
      { projectId: "p3", toCategoryTempId: "cat_a" },
    ],
  },
  executedAt: null,
  triggeredBy: "schedule" as const,
  chatMessage: null,
  createdAt: "2026-04-19T00:00:00Z",
  conversationId: null,
  requestMessageId: null,
  responseMessageId: null,
  requestedByUserId: null,
  requestedByName: null,
  approvedByUserId: null,
  approvedByName: null,
  approvedAt: null,
  dismissedByUserId: null,
  dismissedByName: null,
  dismissedAt: null,
  executedByKind: null,
  executedByUserId: null,
  executedByName: null,
  executionMode: null,
  sourceKind: null,
  sourceRecordId: null,
} satisfies WorkspaceLarryEvent;

describe("TimelineSuggestionPreview", () => {
  it("renders the suggested category name", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getByText("Customer Onboarding")).toBeInTheDocument();
  });

  it("summarises the number of projects to be moved", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getAllByText(/3 projects/i).length).toBeGreaterThan(0);
  });

  it("shows the reasoning text", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getByText(/onboarding signals/i)).toBeInTheDocument();
  });

  it("renders a recolour summary when recolourCategories is set", () => {
    const ev: WorkspaceLarryEvent = {
      ...baseEvent,
      payload: {
        displayText: "Recolour 2 categories",
        reasoning: "Duplicate colours detected.",
        recolourCategories: [
          { categoryId: "c1", colour: "#111" },
          { categoryId: "c2", colour: "#222" },
        ],
      },
    };
    render(<TimelineSuggestionPreview event={ev} />);
    expect(screen.getByText(/2 categories will be recoloured/i)).toBeInTheDocument();
  });
});
