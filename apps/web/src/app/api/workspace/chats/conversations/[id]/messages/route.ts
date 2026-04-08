import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

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

function seedMessages(): ColleagueMessage[] {
  return [];
}

function getMessages(conversationId: string): ColleagueMessage[] {
  if (!messageStore.has(conversationId)) {
    messageStore.set(conversationId, seedMessages());
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
      const larryResult = await proxyApiRequest(
        session,
        "/v1/larry/chat",
        {
          method: "POST",
          body: JSON.stringify({ message: larryQuery }),
        },
        { timeoutMs: 60_000 },
      );
      if (larryResult.session) await persistSession(larryResult.session);
      const data = larryResult.body as Record<string, unknown>;
      const assistantMessage = data.assistantMessage as Record<string, string> | undefined;
      const larryMsg: ColleagueMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        conversationId: id,
        senderId: "larry",
        senderName: "Larry",
        role: "larry",
        content: (data.message as string) || assistantMessage?.content || "I couldn't process that right now.",
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
