import { describe, expect, it, vi } from "vitest";
import { buildIntelligenceSystemPrompt, IntelligenceResultSchema } from "@larry/ai";

describe("N-9: intelligence system prompt trimming", () => {
  const prompt = buildIntelligenceSystemPrompt();

  it("stays under 18_000 chars — Step 3 target (post-compression, 2026-04-14)", () => {
    // Baseline history:
    //   Pre-N-9:           34_900 template + 19_572 knowledge = 54_472 chars (~13_600 tokens)
    //   Post Step 1+2:     34_714 chars (loadKnowledge removed + ~200-char replacement)
    //   Post Step 3 today: 16_996 chars (aggressive template compression)
    // Step 3 halves the template by dropping elaborated examples, duplicated
    // rules, and the Mode 1-5 prose expansions while keeping identity,
    // reasoning framework, larry_context handling, action schemas, required-
    // field table, email format, auto-vs-approval rules, briefing voice, and
    // output format. Per-request cost on prod dropped from ~10_323 tokens to
    // ~5-6k, unblocking kimi-k2 (10K TPM) and giving the free-tier Groq
    // budget 2-4x more daily headroom.
    expect(prompt.length).toBeLessThan(18_000);
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
