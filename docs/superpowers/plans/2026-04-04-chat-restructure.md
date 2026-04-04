# Chat Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate colleague chat from Larry chat — rebuild `/workspace/chats` as colleague messaging, rename sidebar "Ask Larry" → "Larry" as a navigation link, and hide the FAB widget on the Larry full-page.

**Architecture:** Three independent changes: (1) sidebar label + behavior edit, (2) conditional FAB/widget render in the shell, (3) full rewrite of the chats page with new mock API routes. The colleague chat reuses the existing `ChatInput` component and follows the same two-column layout pattern as the Larry page.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Lucide icons, existing `ChatInput` component, existing `sendLarryChat` for @Larry mentions.

**Spec:** `docs/superpowers/specs/2026-04-04-chat-restructure-design.md`

---

### Task 1: Rename "Ask Larry" → "Larry" and Make It a Navigation Link

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Change the label in WORKSPACE_NAV**

In `apps/web/src/components/dashboard/Sidebar.tsx`, find line 31:

```typescript
  { id: "larry",     label: "Ask Larry",  icon: Layers,        href: "/workspace/larry"     },
```

Change to:

```typescript
  { id: "larry",     label: "Larry",      icon: Layers,        href: "/workspace/larry"     },
```

- [ ] **Step 2: Remove the special-case `larry` button handler**

In the same file, find the nav rendering block (lines 256-272) that special-cases `id === "larry"` to dispatch a custom event instead of navigating. Remove that entire `if (id === "larry")` block so the `larry` item falls through to the standard `<Link>` rendering below it.

Replace this block (lines 257-272):

```typescript
          if (id === "larry") {
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onClose?.();
                  window.dispatchEvent(new CustomEvent("larry:open"));
                }}
                className={`pm-nav-item w-full text-left${isActive ? " active" : ""}`}
              >
                <Icon size={18} className="shrink-0 icon-md" style={{ color: "var(--brand)" }} />
                <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{label}</span>
              </button>
            );
          }
```

With nothing — just delete it. The `larry` nav item will now render as a standard `<Link>` like all other items.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev` (if not already running)

1. Open the sidebar — confirm "Larry" label appears (not "Ask Larry")
2. Click "Larry" — confirm it navigates to `/workspace/larry` (not opens the widget)
3. Confirm the Larry page loads correctly with conversation list

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "refactor: rename Ask Larry to Larry, make sidebar link navigate to /workspace/larry"
```

---

### Task 2: Hide FAB + Widget on the Larry Full Page

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Add route check variable**

In `apps/web/src/app/workspace/WorkspaceShell.tsx`, inside the `WorkspaceShell` component, after line 42 (`const projectIdFromPath = ...`), add:

```typescript
  const isLarryPage = pathname?.startsWith("/workspace/larry") ?? false;
```

- [ ] **Step 2: Wrap LarryChat and FAB in conditional render**

Find the `<LarryChat>` component and FAB button at the bottom of the JSX return (lines 166-194). Wrap both in a conditional:

Replace:

```tsx
      <LarryChat
        projectId={chatProjectId || undefined}
        projectName={projects.find((p) => p.id === chatProjectId)?.name}
      />
      {/* Global floating Larry Chat button */}
      <button
        type="button"
        aria-label="Ask Larry"
        onClick={() => window.dispatchEvent(new CustomEvent("larry:toggle"))}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "48px",
          height: "48px",
          borderRadius: "14px",
          background: "#6c44f6",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(108,68,246,0.3)",
          zIndex: 60,
          border: "none",
          cursor: "pointer",
        }}
      >
        <Layers size={20} />
      </button>
```

With:

```tsx
      {!isLarryPage && (
        <>
          <LarryChat
            projectId={chatProjectId || undefined}
            projectName={projects.find((p) => p.id === chatProjectId)?.name}
          />
          <button
            type="button"
            aria-label="Ask Larry"
            onClick={() => window.dispatchEvent(new CustomEvent("larry:toggle"))}
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "#6c44f6",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(108,68,246,0.3)",
              zIndex: 60,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Layers size={20} />
          </button>
        </>
      )}
```

- [ ] **Step 3: Verify in the browser**

1. Navigate to `/workspace/larry` — confirm no FAB button in bottom-right, no widget
2. Navigate to `/workspace` (home) — confirm FAB button appears, clicking it opens the widget
3. Navigate to `/workspace/projects/<any-id>` — confirm FAB button appears
4. Navigate back to `/workspace/larry` — confirm FAB disappears again

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceShell.tsx
git commit -m "feat: hide Larry FAB and widget when on /workspace/larry page"
```

---

### Task 3: Create Colleague Chat API — Conversations Endpoint

**Files:**
- Create: `apps/web/src/app/api/workspace/chats/conversations/route.ts`

- [ ] **Step 1: Create the conversations API route**

Create `apps/web/src/app/api/workspace/chats/conversations/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify the route responds**

Run: `curl http://localhost:3000/api/workspace/chats/conversations` (with a valid session cookie, or test in browser devtools)

Expected: JSON with `{ conversations: [...] }` containing the 4 mock conversations.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/workspace/chats/conversations/route.ts
git commit -m "feat: add mock colleague chat conversations API"
```

---

### Task 4: Create Colleague Chat API — Messages Endpoint

**Files:**
- Create: `apps/web/src/app/api/workspace/chats/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Create the messages API route**

Create `apps/web/src/app/api/workspace/chats/conversations/[id]/messages/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify the route responds**

Test in browser devtools or curl:
- `GET /api/workspace/chats/conversations/chat_001/messages` → returns seeded messages
- `POST /api/workspace/chats/conversations/chat_001/messages` with `{ "content": "hello" }` → returns `{ userMessage }` 
- `POST /api/workspace/chats/conversations/chat_001/messages` with `{ "content": "hey @Larry what's the project status?" }` → returns `{ userMessage, larryMessage }`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/workspace/chats/conversations/\[id\]/messages/route.ts
git commit -m "feat: add mock colleague chat messages API with @Larry mention support"
```

---

### Task 5: Create Colleague Chat Client Library

**Files:**
- Create: `apps/web/src/lib/colleague-chat.ts`

- [ ] **Step 1: Create the client library**

Create `apps/web/src/lib/colleague-chat.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/colleague-chat.ts
git commit -m "feat: add colleague chat client library"
```

---

### Task 6: Rewrite the Chats Page — Colleague Messaging UI

**Files:**
- Rewrite: `apps/web/src/app/workspace/chats/page.tsx`

- [ ] **Step 1: Rewrite the chats page**

Replace the entire contents of `apps/web/src/app/workspace/chats/page.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Users, User, Layers } from "lucide-react";
import {
  type ColleagueConversation,
  type ColleagueMessage,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/colleague-chat";
import { ChatInput, type AttachedFile } from "@/components/larry/ChatInput";

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const value = new Date(dateStr);
  const diffMs = Date.now() - value.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  if (diffHours < 48) return "Yesterday";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function conversationDisplayName(c: ColleagueConversation): string {
  if (c.type === "group" && c.name) return c.name;
  return c.members.map((m) => m.name.split(" ")[0]).join(", ") || "New chat";
}

function senderInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ─── Page ─────────────────────────────────────────────────────── */

export default function ColleagueChatsPage() {
  const [conversations, setConversations] = useState<ColleagueConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ColleagueMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Load conversations
  useEffect(() => {
    let cancelled = false;
    void listConversations()
      .then((items) => {
        if (cancelled) return;
        setConversations(items);
        if (items.length > 0 && !selectedId) setSelectedId(items[0].id);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when selection changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    setMessagesLoading(true);
    void listMessages(selectedId)
      .then((items) => { if (!cancelled) setMessages(items); })
      .finally(() => { if (!cancelled) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit() {
    const text = input.trim();
    if (busy || text.length < 1 || !selectedId) return;
    setBusy(true);
    setInput("");
    try {
      const result = await sendMessage(selectedId, text);
      setMessages((prev) => [
        ...prev,
        result.userMessage,
        ...(result.larryMessage ? [result.larryMessage] : []),
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-0 overflow-hidden"
      style={{ background: "var(--page-bg)", padding: "24px", height: "100%" }}
    >
      <div style={{ display: "flex", height: "100%", width: "100%", maxWidth: "1440px", margin: "0 auto" }}>
        <div style={{ display: "grid", flex: 1, minHeight: 0, gap: "20px", gridTemplateColumns: "280px minmax(0,1fr)" }}>

          {/* ── Left panel: Conversation list ── */}
          <aside
            style={{
              display: "flex", flexDirection: "column", minHeight: 0,
              borderRadius: "var(--radius-card)", border: "1px solid var(--border)",
              background: "var(--surface)", overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
              }}
            >
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Chats</h2>
              <button
                type="button"
                style={{
                  width: "28px", height: "28px", borderRadius: "8px", background: "#6c44f6",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer",
                }}
                title="New chat"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Conversation list */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px" }}>
              {!loading && conversations.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <MessageSquare size={24} style={{ margin: "0 auto", color: "#6c44f6", opacity: 0.4 }} />
                  <p style={{ marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>No conversations yet</p>
                  <p style={{ marginTop: "6px", fontSize: "12px", lineHeight: "1.5", color: "var(--text-muted)" }}>
                    Start a chat with a colleague.
                  </p>
                </div>
              )}

              {conversations.map((c) => {
                const active = c.id === selectedId;
                const ConvIcon = c.type === "group" ? Users : User;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      width: "100%", borderRadius: "8px", border: "none",
                      background: active ? "rgba(108,68,246,0.12)" : "transparent",
                      padding: "10px", textAlign: "left", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "10px",
                      transition: "background 0.15s", marginBottom: "2px",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(108,68,246,0.06)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div
                      style={{
                        flexShrink: 0, width: "36px", height: "36px", borderRadius: "10px",
                        background: active ? "#6c44f6" : "var(--surface-2)",
                        color: active ? "#fff" : "var(--text-muted)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <ConvIcon size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <p style={{
                          fontSize: "13px", fontWeight: 500,
                          color: active ? "#6c44f6" : "var(--text-1)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {conversationDisplayName(c)}
                        </p>
                        <span style={{ flexShrink: 0, fontSize: "10px", color: "var(--text-muted)" }}>
                          {formatDate(c.lastMessageAt)}
                        </span>
                      </div>
                      {c.lastMessage && (
                        <p style={{
                          marginTop: "2px", fontSize: "12px", color: "var(--text-muted)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {c.lastMessage}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Right panel: Active thread ── */}
          <section
            style={{
              display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
              borderRadius: "var(--radius-card)", border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            {/* Thread header */}
            <div
              style={{
                borderBottom: "1px solid var(--border)", background: "var(--surface)",
                padding: "14px 20px", display: "flex", alignItems: "center", gap: "10px",
              }}
            >
              {activeConversation ? (
                <>
                  <div
                    style={{
                      flexShrink: 0, display: "flex", height: "32px", width: "32px",
                      alignItems: "center", justifyContent: "center", borderRadius: "8px",
                      background: "var(--surface-2)", color: "var(--text-muted)",
                    }}
                  >
                    {activeConversation.type === "group" ? <Users size={15} /> : <User size={15} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)" }}>
                      {conversationDisplayName(activeConversation)}
                    </h2>
                    {activeConversation.type === "group" && (
                      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {activeConversation.members.length} members
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-muted)" }}>
                  Select a conversation
                </h2>
              )}
            </div>

            {/* Messages */}
            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, background: "var(--page-bg)" }}>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
                {messagesLoading && (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading...</p>
                )}

                {!messagesLoading && !selectedId && (
                  <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <MessageSquare size={32} style={{ color: "var(--text-disabled)" }} />
                    <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }}>
                      Pick a conversation to start chatting
                    </p>
                  </div>
                )}

                {!messagesLoading && selectedId && messages.length === 0 && (
                  <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <MessageSquare size={32} style={{ color: "var(--text-disabled)" }} />
                    <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }}>
                      No messages yet — say hello!
                    </p>
                  </div>
                )}

                {!messagesLoading && messages.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {messages.map((msg) => {
                      const isSelf = msg.senderId === "self";
                      const isLarry = msg.role === "larry";

                      return (
                        <div key={msg.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", maxWidth: "75%" }}>
                            {/* Avatar for others */}
                            {!isSelf && (
                              <div
                                style={{
                                  flexShrink: 0, width: "28px", height: "28px", borderRadius: "8px",
                                  background: isLarry ? "#6c44f6" : "var(--surface-2)",
                                  color: isLarry ? "#fff" : "var(--text-muted)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: "10px", fontWeight: 600,
                                }}
                              >
                                {isLarry ? <Layers size={13} /> : senderInitials(msg.senderName)}
                              </div>
                            )}

                            {/* Bubble */}
                            <div
                              style={{
                                borderRadius: "18px",
                                padding: "10px 14px",
                                fontSize: "14px",
                                lineHeight: "1.55",
                                ...(isSelf
                                  ? { background: "#6c44f6", color: "#ffffff", borderTopRightRadius: "4px" }
                                  : isLarry
                                    ? { background: "#f3f0ff", color: "var(--text-1)", border: "1px solid #e5e0fa", borderTopLeftRadius: "4px" }
                                    : { background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--border)", borderTopLeftRadius: "4px" }),
                              }}
                            >
                              {!isSelf && (
                                <p style={{ marginBottom: "4px", fontSize: "11px", fontWeight: 600, color: isLarry ? "#6c44f6" : "var(--text-muted)" }}>
                                  {msg.senderName}
                                </p>
                              )}
                              <p>{msg.content}</p>
                              <p style={{ marginTop: "4px", fontSize: "10px", textAlign: isSelf ? "right" : "left", color: isSelf ? "rgba(255,255,255,0.6)" : "var(--text-disabled)" }}>
                                {formatDate(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* @Larry hint */}
              {selectedId && (
                <div style={{ padding: "0 20px" }}>
                  <p style={{ fontSize: "11px", color: "var(--text-disabled)", padding: "4px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Layers size={10} />
                    Type <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>@Larry</span> to ask Larry in this chat
                  </p>
                </div>
              )}

              {/* Input */}
              {selectedId && (
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  disabled={busy}
                  busy={busy}
                  placeholder="Message..."
                  files={files}
                  onFilesChange={setFiles}
                  variant="full"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

1. Navigate to `/workspace/chats`
2. Confirm the left panel shows 4 mock conversations (2 DMs, 2 groups)
3. Click a conversation — messages load in the right panel
4. Send a message — it appears in the thread
5. Send a message with `@Larry` — Larry responds in the thread
6. Confirm the `ChatInput` shows attach + voice buttons

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/chats/page.tsx
git commit -m "feat: rewrite chats page as colleague messaging with @Larry support"
```

---

### Task 7: Final Integration Verification

- [ ] **Step 1: Full flow verification**

Test the complete flow end-to-end:

1. **Sidebar:** "Larry" label visible, clicking it navigates to `/workspace/larry`
2. **Sidebar:** "Chats" label visible, clicking it navigates to `/workspace/chats` (colleague chat)
3. **Larry page:** Full chat interface works (conversation list, messages, file attach, voice)
4. **Larry page:** No FAB button in bottom-right corner
5. **Chats page:** Colleague conversations with DMs and groups
6. **Chats page:** Sending messages works, `@Larry` triggers Larry response
7. **Other pages** (home, projects, etc.): FAB button visible, clicking opens widget
8. **Mobile:** Sidebar drawer works correctly with updated nav items

- [ ] **Step 2: Final commit if any fixes needed**

If any fixes were applied during verification:

```bash
git add -u
git commit -m "fix: address integration issues from chat restructure"
```
