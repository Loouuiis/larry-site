import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendLarryChat } from "@/lib/larry";

export interface ColleagueMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
}

/* ── In-memory message store (mock) ────────────────────────────── */

const messageStore = new Map<string, ColleagueMessage[]>();

function seedMessages(conversationId: string): ColleagueMessage[] {
  const seeds: Record<string, ColleagueMessage[]> = {
    chat_001: [
      { id: "msg_001a", conversationId: "chat_001", senderId: "usr_001", senderName: "Alice Chen", role: "user", content: "Hey, I pushed the auth refactor branch", createdAt: new Date(Date.now() - 30 * 60_000).toISOString() },
      { id: "msg_001b", conversationId: "chat_001", senderId: "self", senderName: "You", role: "user", content: "Nice, I'll take a look now", createdAt: new Date(Date.now() - 25 * 60_000).toISOString() },
      { id: "msg_001c", conversationId: "chat_001", senderId: "usr_001", senderName: "Alice Chen", role: "user", content: "Hey, can you review the latest PR?", createdAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    ],
    chat_002: [
      { id: "msg_002a", conversationId: "chat_002", senderId: "usr_002", senderName: "Bob Martinez", role: "user", content: "CI is green on staging", createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString() },
      { id: "msg_002b", conversationId: "chat_002", senderId: "self", senderName: "You", role: "user", content: "Great, let's ship it", createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString() },
      { id: "msg_002c", conversationId: "chat_002", senderId: "usr_002", senderName: "Bob Martinez", role: "user", content: "The deployment looks good, shipping today", createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString() },
    ],
    chat_003: [
      { id: "msg_003a", conversationId: "chat_003", senderId: "usr_002", senderName: "Bob Martinez", role: "user", content: "Should we move standup to 10am?", createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
      { id: "msg_003b", conversationId: "chat_003", senderId: "usr_000", senderName: "Carol Wu", role: "user", content: "Works for me", createdAt: new Date(Date.now() - 90 * 60_000).toISOString() },
      { id: "msg_003c", conversationId: "chat_003", senderId: "usr_001", senderName: "Alice Chen", role: "user", content: "Sprint retro at 3pm — don't forget!", createdAt: new Date(Date.now() - 45 * 60_000).toISOString() },
    ],
    chat_004: [
      { id: "msg_004a", conversationId: "chat_004", senderId: "usr_003", senderName: "David Kim", role: "user", content: "New component library is looking great", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      { id: "msg_004b", conversationId: "chat_004", senderId: "usr_004", senderName: "Emily Davis", role: "user", content: "Updated mockups are in Figma", createdAt: new Date(Date.now() - 86_400_000).toISOString() },
    ],
  };
  return seeds[conversationId] ?? [];
}

function getMessages(conversationId: string): ColleagueMessage[] {
  if (!messageStore.has(conversationId)) {
    messageStore.set(conversationId, seedMessages(conversationId));
  }
  return messageStore.get(conversationId)!;
}

/* ── @Larry detection ──────────────────────────────────────────── */

const LARRY_MENTION_RE = /@larry\b/i;

function extractLarryQuery(content: string): string | null {
  if (!LARRY_MENTION_RE.test(content)) return null;
  return content.replace(LARRY_MENTION_RE, "").trim();
}

/* ── Handlers ──────────────────────────────────────────────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  return NextResponse.json({ messages: getMessages(id) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json() as { content: string };
  const messages = getMessages(id);

  const userMsg: ColleagueMessage = {
    id: `msg_${crypto.randomUUID().slice(0, 8)}`,
    conversationId: id,
    senderId: "self",
    senderName: "You",
    role: "user",
    content: body.content,
    createdAt: new Date().toISOString(),
  };
  messages.push(userMsg);

  const result: { userMessage: ColleagueMessage; larryMessage?: ColleagueMessage } = {
    userMessage: userMsg,
  };

  // Handle @Larry mention
  const larryQuery = extractLarryQuery(body.content);
  if (larryQuery) {
    try {
      const { data } = await sendLarryChat({ message: larryQuery });
      const larryMsg: ColleagueMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        conversationId: id,
        senderId: "larry",
        senderName: "Larry",
        role: "larry",
        content: data.message || data.assistantMessage?.content || "I couldn't process that right now.",
        createdAt: new Date().toISOString(),
      };
      messages.push(larryMsg);
      result.larryMessage = larryMsg;
    } catch {
      const errorMsg: ColleagueMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        conversationId: id,
        senderId: "larry",
        senderName: "Larry",
        role: "larry",
        content: "Sorry, I couldn't respond right now. Try again later.",
        createdAt: new Date().toISOString(),
      };
      messages.push(errorMsg);
      result.larryMessage = errorMsg;
    }
  }

  return NextResponse.json(result, { status: 201 });
}
