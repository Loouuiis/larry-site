import type { WorkspaceConversationPreview, WorkspaceLarryEvent } from "@/app/dashboard/types";

export type LarryConversation = WorkspaceConversationPreview;

export interface LarryMessage {
  id: string;
  role: "user" | "larry";
  content: string;
  reasoning: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  linkedActions: WorkspaceLarryEvent[];
}

export interface LarryChatResponse {
  conversationId: string;
  message: string;
  userMessage: LarryMessage;
  assistantMessage: LarryMessage;
  linkedActions: WorkspaceLarryEvent[];
  actionsExecuted: number;
  suggestionCount: number;
  error?: string;
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

export async function listLarryConversations(projectId?: string): Promise<LarryConversation[]> {
  const path = projectId
    ? `/api/workspace/larry/conversations?projectId=${encodeURIComponent(projectId)}`
    : "/api/workspace/larry/conversations";
  const response = await fetch(path, { cache: "no-store" });
  const data = await readJson<{ conversations?: LarryConversation[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load conversations.");
  }
  return data.conversations ?? [];
}

export async function createLarryConversation(input: {
  projectId?: string;
  title?: string;
}): Promise<LarryConversation> {
  const response = await fetch("/api/workspace/larry/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<LarryConversation & { error?: string }>(response);
  if (!response.ok || !data.id) {
    throw new Error(data.error ?? "Failed to create conversation.");
  }
  return data;
}

export async function listLarryMessages(conversationId: string): Promise<LarryMessage[]> {
  const response = await fetch(`/api/workspace/larry/conversations/${conversationId}/messages`, {
    cache: "no-store",
  });
  const data = await readJson<{ messages?: LarryMessage[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load conversation messages.");
  }
  return data.messages ?? [];
}

export async function saveLarryMessage(
  conversationId: string,
  role: "user" | "larry",
  content: string,
  reasoning?: LarryMessage["reasoning"]
): Promise<void> {
  const response = await fetch(`/api/workspace/larry/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, reasoning }),
  });
  if (!response.ok) {
    const data = await readJson<{ error?: string }>(response);
    throw new Error(data.error ?? "Failed to save Larry message.");
  }
}

export async function sendLarryChat(input: {
  projectId: string;
  message: string;
  conversationId?: string;
}): Promise<{ response: Response; data: LarryChatResponse }> {
  const response = await fetch("/api/workspace/larry/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: input.projectId,
      message: input.message,
      conversationId: input.conversationId,
    }),
  });
  const data = await readJson<LarryChatResponse>(response);
  return { response, data };
}
