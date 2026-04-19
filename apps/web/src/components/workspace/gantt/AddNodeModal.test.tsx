// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AddNodeModal } from "./AddNodeModal";

describe("AddNodeModal description field", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cleanup();
  });

  it("shows the description toggle only in task/subtask modes", () => {
    render(
      <AddNodeModal mode="category" onClose={() => {}} onCreated={() => {}} />,
    );
    expect(screen.queryByText(/add description/i)).toBeNull();
    cleanup();

    render(<AddNodeModal mode="project" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByText(/add description/i)).toBeNull();
    cleanup();

    render(<AddNodeModal mode="task" parentProjectId="p" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/add description/i)).toBeDefined();
    cleanup();

    render(<AddNodeModal mode="subtask" parentProjectId="p" parentTaskId="t" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/add description/i)).toBeDefined();
  });

  it("sends description in the POST body when typed and submitted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const onCreated = vi.fn();
    render(
      <AddNodeModal
        mode="task"
        parentProjectId="p"
        onClose={() => {}}
        onCreated={onCreated}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: "New thing" } });
    fireEvent.click(screen.getByText(/add description/i));
    fireEvent.change(screen.getByPlaceholderText(/what does this task cover/i), {
      target: { value: "Investigate why X is slow" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.description).toBe("Investigate why X is slow");
    expect(body.title).toBe("New thing");
  });

  it("omits description from the POST body when empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    render(
      <AddNodeModal mode="task" parentProjectId="p" onClose={() => {}} onCreated={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: "Thing" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).not.toHaveProperty("description");
  });
});
