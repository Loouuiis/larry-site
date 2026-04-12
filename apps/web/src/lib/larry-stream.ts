import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

export type LarryChatStreamEvent =
  | { type: "token"; delta: string }
  | { type: "tool_start"; id: string; name: string; displayText: string }
  | {
      type: "tool_done";
      id: string;
      name: string;
      success: boolean;
      actionId: string | null;
      eventType: "auto_executed" | "suggested" | "error";
      displayText: string;
      error?: string;
    }
  | {
      type: "done";
      conversationId: string;
      messageId: string;
      actionsExecuted: number;
      suggestionCount: number;
      linkedActions?: WorkspaceLarryEvent[];
    }
  | { type: "error"; message: string };

export async function* parseLarrySseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<LarryChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        const jsonStr = dataLine.slice(6).trim();
        if (!jsonStr) continue;

        try {
          yield JSON.parse(jsonStr) as LarryChatStreamEvent;
        } catch {
          // Ignore malformed events and keep reading the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
