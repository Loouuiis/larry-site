/* ── Types ─────────────────────────────────────────────────────── */

export interface ColleagueMember {
  id: string;
  name: string;
  email: string;
}

export interface ColleagueConversation {
  id: string;
  type: "dm" | "group";
  name: string | null;
  members: ColleagueMember[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ColleagueMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

/* ── API calls ─────────────────────────────────────────────────── */

export async function listConversations(): Promise<ColleagueConversation[]> {
  const response = await fetch("/api/workspace/chats/conversations", { cache: "no-store" });
  const data = await readJson<{ conversations?: ColleagueConversation[]; error?: string }>(response);
  if (!response.ok) throw new Error(data.error ?? "Failed to load conversations.");
  return data.conversations ?? [];
}

export async function createConversation(input: {
  type: "dm" | "group";
  memberIds: string[];
  name?: string;
}): Promise<ColleagueConversation> {
  const response = await fetch("/api/workspace/chats/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ conversation?: ColleagueConversation; error?: string }>(response);
  if (!response.ok) throw new Error(data.error ?? "Failed to create conversation.");
  return data.conversation!;
}

export async function listMessages(conversationId: string): Promise<ColleagueMessage[]> {
  const response = await fetch(`/api/workspace/chats/conversations/${conversationId}/messages`, {
    cache: "no-store",
  });
  const data = await readJson<{ messages?: ColleagueMessage[]; error?: string }>(response);
  if (!response.ok) throw new Error(data.error ?? "Failed to load messages.");
  return data.messages ?? [];
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ userMessage: ColleagueMessage; larryMessage?: ColleagueMessage }> {
  const response = await fetch(`/api/workspace/chats/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await readJson<{
    userMessage?: ColleagueMessage;
    larryMessage?: ColleagueMessage;
    error?: string;
  }>(response);
  if (!response.ok) throw new Error(data.error ?? "Failed to send message.");
  return { userMessage: data.userMessage!, larryMessage: data.larryMessage };
}
