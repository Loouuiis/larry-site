export type LarryIntent =
  | "freeform"
  | "create_plan"
  | "update_scope"
  | "draft_follow_up"
  | "request_summary"
  | "create_project";

export interface LarryConversation {
  id: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
}

export interface LarryMessage {
  id: string;
  role: "user" | "larry";
  content: string;
  reasoning?: {
    why?: string;
    signals?: string[];
    threshold?: string;
  };
  createdAt: string;
}

export interface LarryCommandResponseBody {
  summary?: {
    narrative?: string;
  };
  runId?: string;
  actionId?: string;
  projectName?: string;
  taskCount?: number;
  message?: string;
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

export async function sendLarryCommand(input: {
  intent: LarryIntent;
  input: string;
  projectId?: string;
  context?: Record<string, unknown>;
  mode?: "execute" | "preview";
}): Promise<{ response: Response; data: LarryCommandResponseBody }> {
  const response = await fetch("/api/workspace/larry/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: input.intent,
      input: input.input,
      projectId: input.projectId,
      context: input.context,
      mode: input.mode ?? "execute",
    }),
  });
  const data = await readJson<LarryCommandResponseBody>(response);
  return { response, data };
}

export function buildLarryResponseText(
  response: Response,
  data: LarryCommandResponseBody
): string {
  if (response.ok) {
    return (
      data.summary?.narrative ??
      data.message ??
      (data.runId
        ? "Got it. Head to the Action Center to review the proposed changes."
        : "Done.")
    );
  }

  return data.error ?? "Something went wrong.";
}
