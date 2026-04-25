// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { EditTaskModal } from "./EditTaskModal";

function mockTaskFetch(taskBody: unknown, membersBody: unknown = { members: [] }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/workspace/members")) {
      return Promise.resolve(new Response(JSON.stringify(membersBody), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(taskBody), { status: 200 }));
  });
}

describe("EditTaskModal task GET response handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cleanup();
  });

  // Regression: route returns `{ task, comments }` envelope but the
  // modal previously cast the body straight to TaskDetail, leaving
  // `title` undefined and crashing on `title.trim()` when the user
  // clicked a Gantt bar.
  it("populates the title input when the API returns a { task } envelope", async () => {
    mockTaskFetch({
      task: {
        id: "t1",
        projectId: "p1",
        parentTaskId: null,
        title: "Ship Gantt fix",
        description: null,
        status: "in_progress",
        priority: "high",
        assigneeUserId: null,
        progressPercent: 0,
        startDate: null,
        dueDate: null,
      },
      comments: [],
    });

    render(
      <EditTaskModal
        taskId="t1"
        projectId="p1"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const titleInput = (await waitFor(() =>
      screen.getByPlaceholderText(/task title/i),
    )) as HTMLInputElement;
    expect(titleInput.value).toBe("Ship Gantt fix");
  });

  it("still works if the API returns the raw task object (legacy shape)", async () => {
    mockTaskFetch({
      id: "t1",
      projectId: "p1",
      parentTaskId: null,
      title: "Legacy shape",
      description: null,
      status: "not_started",
      priority: "medium",
      assigneeUserId: null,
      progressPercent: 0,
      startDate: null,
      dueDate: null,
    });

    render(
      <EditTaskModal
        taskId="t1"
        projectId="p1"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const titleInput = (await waitFor(() =>
      screen.getByPlaceholderText(/task title/i),
    )) as HTMLInputElement;
    expect(titleInput.value).toBe("Legacy shape");
  });

  it("surfaces an error instead of crashing when the response is malformed", async () => {
    mockTaskFetch({ task: null });

    render(
      <EditTaskModal
        taskId="t1"
        projectId="p1"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/task response missing required fields/i)).toBeDefined();
    });
  });
});
