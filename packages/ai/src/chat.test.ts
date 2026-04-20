import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "./chat.js";

describe("buildChatSystemPrompt — transcript sectioning (B-010)", () => {
  it("instructs Larry to structure transcript replies as Tasks / Decisions / Risks", () => {
    const prompt = buildChatSystemPrompt(null);
    expect(prompt).toMatch(/PASTED MEETING TRANSCRIPTS/);
    expect(prompt).toMatch(/\*\*Tasks\*\*/);
    expect(prompt).toMatch(/\*\*Decisions\*\*/);
    expect(prompt).toMatch(/\*\*Risks\*\*/);
  });

  it("requires an explicit '(none)' under empty sections — no silent drops", () => {
    const prompt = buildChatSystemPrompt(null);
    // The worst failure mode from the 2026-04-20 audit was Larry dropping the
    // single risk without telling the user. Empty-section handling must be
    // spelled out in the prompt so the model never treats "nothing here" as
    // "don't mention it."
    expect(prompt).toMatch(/\(none\)/);
    expect(prompt).toMatch(/[Nn]ever silently omit a section/);
  });

  it("tells Larry a transcript paste is a summarisation request, not an action trigger", () => {
    const prompt = buildChatSystemPrompt(null);
    // Audit also caught Larry pre-actioning things the user hadn't asked for.
    // Transcript parsing must extract first and wait for the user to pick.
    expect(prompt).toMatch(/summaris|extract first/i);
  });

  it("still embeds project context when provided", () => {
    const prompt = buildChatSystemPrompt("Project Phoenix: migrating auth to Auth0 by May.");
    expect(prompt).toContain("Project Phoenix");
    expect(prompt).toMatch(/PASTED MEETING TRANSCRIPTS/);
  });
});
