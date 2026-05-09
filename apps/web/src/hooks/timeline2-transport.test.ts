import { describe, expect, it } from "vitest";
import type { Timeline2ChatStreamEvent } from "@larry/shared";
import {
  applyTimeline2AiStreamEvent,
  buildTimeline2AiRequestPayload,
  parseTimeline2SseBuffer,
} from "./timeline2-transport";

describe("timeline2 transport", () => {
  it("reuses the previous user turn when pairing an answer to an AI2 question", () => {
    const { payload, nextState } = buildTimeline2AiRequestPayload("Yes, do that", {
      conversationId: "conv-1",
      lastUserTurn: "Create a launch plan",
      pairNextMessageAsAnswer: true,
    });

    expect(payload).toEqual({
      message: "Create a launch plan",
      answer: "Yes, do that",
      conversationId: "conv-1",
    });
    expect(nextState).toEqual({
      conversationId: "conv-1",
      lastUserTurn: "Yes, do that",
      pairNextMessageAsAnswer: false,
    });
  });

  it("tracks conversation ids and pending answer state from AI2 stream events", () => {
    const started = applyTimeline2AiStreamEvent(
      {
        conversationId: null,
        lastUserTurn: "Create a launch plan",
        pairNextMessageAsAnswer: false,
      },
      {
        type: "conversation_started",
        conversationId: "conv-2",
      } satisfies Timeline2ChatStreamEvent,
    );

    const questioned = applyTimeline2AiStreamEvent(started, {
      type: "question",
      question: "Should rollout happen after QA?",
    } satisfies Timeline2ChatStreamEvent);

    expect(questioned).toEqual({
      conversationId: "conv-2",
      lastUserTurn: "Create a launch plan",
      pairNextMessageAsAnswer: true,
    });
  });

  it("parses complete SSE events and keeps the trailing partial chunk buffered", () => {
    const parsed = parseTimeline2SseBuffer(
      [
        'data: {"type":"conversation_started","conversationId":"conv-3"}',
        "",
        'data: {"type":"question","question":"Need dates?"}',
        "",
        'data: {"type":"done"',
      ].join("\n"),
    );

    expect(parsed.events).toEqual([
      { type: "conversation_started", conversationId: "conv-3" },
      { type: "question", question: "Need dates?" },
    ]);
    expect(parsed.rest).toBe('data: {"type":"done"');
  });

  it("ignores keepalive SSE events", () => {
    const parsed = parseTimeline2SseBuffer(
      [
        'data: {"type":"keepalive"}',
        "",
        'data: {"type":"question","question":"Need dates?"}',
        "",
        "",
      ].join("\n"),
    );

    expect(parsed.events).toEqual([
      { type: "question", question: "Need dates?" },
    ]);
  });
});
