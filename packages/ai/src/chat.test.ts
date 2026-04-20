import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "./chat.js";

describe("buildChatSystemPrompt — action confirmations (B-007)", () => {
  it("forces Larry to enumerate every captured create_task field in the confirmation reply", () => {
    const prompt = buildChatSystemPrompt(null);
    expect(prompt).toMatch(/CONFIRMING ACTIONS/);
    // All six fields that the audit found Larry silently dropping must be
    // explicitly named in the confirmation template.
    for (const field of ["title", "priority", "startDate", "dueDate", "assigneeName", "labels"]) {
      expect(prompt).toContain(field);
    }
  });

  it("requires Larry to flag any field the user asked for that couldn't be captured", () => {
    const prompt = buildChatSystemPrompt(null);
    // Silent drops were the worst failure mode in the audit. The prompt must
    // make explicit that Larry says when a requested field was dropped, not
    // just when it was captured.
    expect(prompt).toMatch(/silently dropping/i);
    expect(prompt).toMatch(/couldn't (include|capture)/i);
  });

  it("provides a concrete example confirmation with every field", () => {
    const prompt = buildChatSystemPrompt(null);
    // A single worked example in the prompt is more reliable than a rule the
    // model has to synthesise. Must include all six audit fields in one line.
    expect(prompt).toMatch(/Queued .* priority.* starts .* due .* assigned to .* labels/s);
  });
});
