import { describe, expect, it, vi } from "vitest";
import { buildIntelligenceSystemPrompt, IntelligenceResultSchema } from "@larry/ai";

describe("N-9: intelligence system prompt trimming", () => {
  const prompt = buildIntelligenceSystemPrompt();

  it("is meaningfully smaller than the pre-N-9 baseline (54_472 chars)", () => {
    // Pre-fix: 34_900-char template + 19_572-char loadKnowledge() injection
    // = 54_472 chars (~13_600 tokens). That exceeded the Groq free-tier
    // 12_000-TPM ceiling before any user data. Step 1 of the N-9 fix drops
    // loadKnowledge(), saving ~19k chars (~4_900 tokens). Step 3 (still
    // optional as of this commit) will further compress the template
    // toward <15_000 chars. This threshold validates Step 1 and leaves a
    // future-tightening target for Step 3.
    expect(prompt.length).toBeLessThan(36_000);
  });

  it("does NOT inject the knowledge/*.md files verbatim", () => {
    // Pre-fix: loadKnowledge() concatenated ~19_572 chars of general PM
    // guidance (estimation, risk, prioritisation, etc.) that llama-3.3-70b
    // already knows. Distinctive phrases from each file, sampled here, must
    // not appear in the trimmed system prompt.
    expect(prompt).not.toContain("Evidence-based estimation");
    expect(prompt).not.toContain("likelihood x impact");
    expect(prompt).not.toContain("Risk & Dependency Management");
    expect(prompt).not.toContain("single points of failure");
  });

  it("preserves Larry's identity and reasoning-framework spine", () => {
    // Behavioural regression guard: the trim must not cut the bits that
    // actually shape Larry's output. Identity + reasoning framework remain.
    expect(prompt).toContain("Larry");
    expect(prompt).toContain("senior project manager");
    expect(prompt.toLowerCase()).toContain("reasoning");
    expect(prompt).toContain("larry_context");
  });
});

describe("N-9: contextUpdate spam feedback loop", () => {
  // Minimal LLM response that triggers the dropped-actions path. Required
  // fields per REQUIRED_PAYLOAD_FIELDS for status_update: taskId,
  // newStatus, newRiskLevel — all absent here so the action is dropped.
  const llmResponseWithDroppedAction = {
    briefing: "Project looks OK.",
    autoActions: [
      {
        type: "status_update",
        displayText: "Update foo",
        reasoning: "it seems relevant",
        payload: {}, // missing required fields → will be filtered
      },
    ],
    suggestedActions: [],
    followUpQuestions: [],
    contextUpdate: "Observed new signal today.",
  };

  it("filters the malformed action but does NOT append '[System] Actions dropped' to contextUpdate", () => {
    // Pre-fix (intelligence.ts:200-203): every time the LLM returned a
    // malformed action (common under structured-output flakiness), the
    // zod transform appended "[System] Actions dropped due to missing
    // fields: ..." to contextUpdate. contextUpdate was then persisted to
    // projects.larry_context and pulled back into the NEXT scan's prompt
    // — a feedback loop that polluted 70%+ of the context column on our
    // test tenant (5_992 chars, mostly spam).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const parsed = IntelligenceResultSchema.parse(llmResponseWithDroppedAction);
      // Behaviour kept: the bad action is filtered
      expect(parsed.autoActions).toHaveLength(0);
      // Behaviour changed: contextUpdate does NOT carry the system-feedback suffix
      expect(parsed.contextUpdate).toBe("Observed new signal today.");
      expect(parsed.contextUpdate).not.toContain("[System]");
      expect(parsed.contextUpdate).not.toContain("Actions dropped");
      // Diagnostic path preserved: still console.warn so operators can
      // grep Railway logs for prompt-quality signals.
      expect(warnSpy).toHaveBeenCalled();
      const loggedAny = warnSpy.mock.calls.some((args) =>
        String(args[0] ?? "").includes("Dropped auto \"status_update\"")
      );
      expect(loggedAny).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("leaves a null contextUpdate null when actions are dropped (no spam fabrication)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const parsed = IntelligenceResultSchema.parse({
        ...llmResponseWithDroppedAction,
        contextUpdate: undefined,
      });
      expect(parsed.autoActions).toHaveLength(0);
      // Pre-fix this would have become "\n[System] Actions dropped..." — a
      // non-null string synthesised entirely from a guard-rail event. With
      // the fix, absence of a real observation stays absent.
      expect(parsed.contextUpdate == null).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
