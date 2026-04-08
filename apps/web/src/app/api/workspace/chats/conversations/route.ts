import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/* ── Members (used for new conversation creation) ─────────────── */

const MOCK_MEMBERS = [
  { id: "usr_001", name: "Alice Chen", email: "alice@company.com" },
  { id: "usr_002", name: "Bob Martinez", email: "bob@company.com" },
  { id: "usr_003", name: "Carol Wu", email: "carol@company.com" },
  { id: "usr_004", name: "David Kim", email: "david@company.com" },
  { id: "usr_005", name: "Emily Davis", email: "emily@company.com" },
];

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

// In-memory store for conversations created during this session
const conversationStore: ColleagueConversation[] = [];

/* ── Handlers ──────────────────────────────────────────────────── */

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ conversations: conversationStore });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    type: "dm" | "group";
    memberIds: string[];
    name?: string;
  };

  const members = body.memberIds
    .map((id) => MOCK_MEMBERS.find((m) => m.id === id))
    .filter((m): m is ColleagueMember => m !== undefined);

  const conversation: ColleagueConversation = {
    id: `chat_${crypto.randomUUID().slice(0, 8)}`,
    type: body.type,
    name: body.type === "group" ? (body.name ?? "New Group") : null,
    members,
    lastMessage: null,
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
  };

  conversationStore.push(conversation);
  return NextResponse.json({ conversation }, { status: 201 });
}
