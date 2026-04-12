import { describe, expect, it } from "vitest";
import { translateFullStreamChunkToChatEvent } from "@larry/ai";

// QA-2026-04-12 Step 1 regression guard.
//
// Every chat response on larry-pm.com returned the fallback string
//   "I don't have anything to add here — ask me something specific and I'll dig in."
// because the fullStream translator read `chunk.delta` for text-delta parts,
// but AI SDK v6 TextStreamPart carries text in `chunk.text`. Tokens were
// silently dropped → fullContent stayed empty → buildToolRecap fired the
// fallback.
describe("translateFullStreamChunkToChatEvent", () => {
  it("yields a token event with the chunk.text payload for text-delta chunks (v6 shape)", () => {
    const pending = new Map<string, string>();
    const event = translateFullStreamChunkToChatEvent(
      { type: "text-delta", id: "text-1", text: "Hello" },
      pending
    );
    expect(event).toEqual({ type: "token", delta: "Hello" });
  });

  it("preserves every character in a multi-chunk text-delta sequence", () => {
    const pending = new Map<string, string>();
    const chunks = [
      { type: "text-delta", id: "text-1", text: "The " },
      { type: "text-delta", id: "text-1", text: "biggest " },
      { type: "text-delta", id: "text-1", text: "risk " },
      { type: "text-delta", id: "text-1", text: "is auth." },
    ];
    const assembled = chunks
      .map((c) => translateFullStreamChunkToChatEvent(c, pending))
      .filter((e): e is { type: "token"; delta: string } => e?.type === "token")
      .map((e) => e.delta)
      .join("");
    expect(assembled).toBe("The biggest risk is auth.");
  });

  it("drops empty text-delta chunks without yielding a token", () => {
    const pending = new Map<string, string>();
    const event = translateFullStreamChunkToChatEvent(
      { type: "text-delta", id: "text-1", text: "" },
      pending
    );
    expect(event).toBeNull();
  });

  it("threads displayText from tool-input-start to the matching tool-result", () => {
    const pending = new Map<string, string>();

    const start = translateFullStreamChunkToChatEvent(
      { type: "tool-input-start", id: "call_1", toolName: "get_task_list" },
      pending
    );
    expect(start).toEqual({
      type: "tool_start",
      id: "call_1",
      name: "get_task_list",
      displayText: "Look up task list",
    });
    expect(pending.get("call_1")).toBe("Look up task list");

    const done = translateFullStreamChunkToChatEvent(
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "get_task_list",
        output: {
          actionId: null,
          eventType: "auto_executed",
          displayText: "Retrieved task list",
        },
      },
      pending
    );
    expect(done).toEqual({
      type: "tool_done",
      id: "call_1",
      name: "get_task_list",
      success: true,
      actionId: null,
      eventType: "auto_executed",
      displayText: "Retrieved task list",
    });
    expect(pending.has("call_1")).toBe(false);
  });

  it("ignores non-text/tool chunks (text-start, finish-step, etc.)", () => {
    const pending = new Map<string, string>();
    expect(
      translateFullStreamChunkToChatEvent({ type: "text-start", id: "t1" }, pending)
    ).toBeNull();
    expect(
      translateFullStreamChunkToChatEvent({ type: "finish-step" }, pending)
    ).toBeNull();
    expect(translateFullStreamChunkToChatEvent({ type: "start" }, pending)).toBeNull();
  });
});
