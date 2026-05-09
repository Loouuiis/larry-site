import type { Timeline2ChatStreamEvent } from "@larry/shared";

export interface Timeline2AiStreamState {
  conversationId: string | null;
  lastUserTurn: string | null;
  pairNextMessageAsAnswer: boolean;
}

export interface Timeline2AiRequestPayload {
  message: string;
  conversationId?: string;
  answer?: string;
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  const data = await readJson<T & { error?: string }>(response);
  if (!response.ok) {
    const payload = data as { error?: string; message?: string } | string | null;
    const errorText =
      typeof payload === "string"
        ? payload
        : payload?.error ?? payload?.message ?? `Timeline 2 request failed (${response.status}).`;
    throw new Error(errorText);
  }
  return data;
}

export function buildTimeline2AiRequestPayload(
  message: string,
  state: Timeline2AiStreamState,
): { payload: Timeline2AiRequestPayload; nextState: Timeline2AiStreamState } {
  const trimmed = message.trim();
  const payload: Timeline2AiRequestPayload = { message: trimmed };
  if (state.conversationId) {
    payload.conversationId = state.conversationId;
  }

  const nextState: Timeline2AiStreamState = {
    ...state,
    lastUserTurn: trimmed,
    pairNextMessageAsAnswer: state.pairNextMessageAsAnswer,
  };

  if (state.pairNextMessageAsAnswer && state.lastUserTurn) {
    payload.message = state.lastUserTurn;
    payload.answer = trimmed;
    nextState.pairNextMessageAsAnswer = false;
  }

  return { payload, nextState };
}

export function applyTimeline2AiStreamEvent(
  state: Timeline2AiStreamState,
  event: Timeline2ChatStreamEvent,
): Timeline2AiStreamState {
  const nextState = { ...state };
  if (event.type === "conversation_started" && event.conversationId) {
    nextState.conversationId = event.conversationId;
  }
  if (event.type === "question") {
    nextState.pairNextMessageAsAnswer = true;
  }
  return nextState;
}

export function parseTimeline2SseBuffer(buffer: string): {
  events: Timeline2ChatStreamEvent[];
  rest: string;
} {
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  const events: Timeline2ChatStreamEvent[] = [];

  for (const chunk of chunks) {
    const line = chunk.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    try {
      const event = JSON.parse(line.slice(5).trim()) as Timeline2ChatStreamEvent;
      if (event.type === "keepalive") continue;
      events.push(event);
    } catch {
      // Ignore malformed stream chunks.
    }
  }

  return { events, rest };
}
