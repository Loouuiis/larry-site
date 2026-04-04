import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/* ── Mock data ─────────────────────────────────────────────────── */

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

const MOCK_CONVERSATIONS: ColleagueConversation[] = [
  {
    id: "chat_001",
    type: "dm",
    name: null,
    members: [MOCK_MEMBERS[0]],
    lastMessage: "Hey, can you review the latest PR?",
    lastMessageAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
  {
    id: "chat_002",
    type: "dm",
    name: null,
    members: [MOCK_MEMBERS[1]],
    lastMessage: "The deployment looks good, shipping today",
    lastMessageAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
  },
  {
    id: "chat_003",
    type: "group",
    name: "Engineering",
    members: [MOCK_MEMBERS[0], MOCK_MEMBERS[1], MOCK_MEMBERS[2]],
    lastMessage: "Sprint retro at 3pm — don't forget!",
    lastMessageAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  },
  {
    id: "chat_004",
    type: "group",
    name: "Design Sync",
    members: [MOCK_MEMBERS[2], MOCK_MEMBERS[3], MOCK_MEMBERS[4]],
    lastMessage: "Updated mockups are in Figma",
    lastMessageAt: new Date(Date.now() - 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
  },
];

/* ── Handlers ──────────────────────────────────────────────────── */

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ conversations: MOCK_CONVERSATIONS });
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

  return NextResponse.json({ conversation }, { status: 201 });
}
