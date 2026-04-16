import { describe, expect, it } from "vitest";
import { buildModifySystemPrompt } from "./modify-chat.js";

describe("buildModifySystemPrompt", () => {
  const base = {
    actionType: "create_task",
    displayText: "Create task: Draft kickoff email",
    reasoning: "Kickoff is next Monday and we need an email out first.",
    currentPayload: { title: "Draft kickoff email", dueDate: "2026-04-20", priority: "medium" },
    editableFields: ["title", "description", "dueDate", "assigneeName", "priority"],
    teamMembers: [{ displayName: "Anna" }, { displayName: "Priya" }],
  };

  it("embeds display text, reasoning, current payload, editable fields, and team", () => {
    const prompt = buildModifySystemPrompt(base);
    expect(prompt).toContain("Create task: Draft kickoff email");
    expect(prompt).toContain("Kickoff is next Monday");
    expect(prompt).toContain('"dueDate": "2026-04-20"');
    expect(prompt).toContain("title, description, dueDate, assigneeName, priority");
    expect(prompt).toContain("Anna");
    expect(prompt).toContain("Priya");
  });

  it("restricts the model to apply_modification only", () => {
    const prompt = buildModifySystemPrompt(base);
    expect(prompt).toMatch(/apply_modification/);
    expect(prompt).toMatch(/Never call any tool other than apply_modification/i);
  });

  it("anchors today's date", () => {
    const prompt = buildModifySystemPrompt(base);
    expect(prompt).toMatch(/Today is \w+day, \d{4}-\d{2}-\d{2}/);
    expect(prompt).toContain("next Monday");
  });

  it("handles an empty team list without crashing", () => {
    const prompt = buildModifySystemPrompt({ ...base, teamMembers: [] });
    expect(prompt).toContain("(no team members on this project)");
  });
});
