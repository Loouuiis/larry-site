# Chat Restructure: Colleague Chat + Larry Sidebar Rename + FAB Visibility

**Date:** 2026-04-04
**Status:** Approved

---

## Problem

The sidebar currently has "Chats" and "Ask Larry" — both pointing to Larry conversations. "Chats" should be for colleague messaging, and Larry should have its own dedicated full-page interface accessible from the sidebar. The bottom-right FAB widget should not appear when the user is already on the Larry full-page chat.

## Changes

### 1. Sidebar Navigation

**File:** `components/dashboard/Sidebar.tsx`

- Rename "Ask Larry" (id: `larry`) label to **"Larry"**
- Change the `larry` nav item from dispatching `larry:open` custom event to a standard `<Link>` navigating to `/workspace/larry`
- "Chats" (id: `chats`) stays at `/workspace/chats` — but the page is rebuilt for colleague messaging

### 2. FAB + Widget Visibility

**File:** `app/workspace/WorkspaceShell.tsx`

- When `pathname?.startsWith("/workspace/larry")`, hide both the `<LarryChat>` widget component and the FAB button entirely (don't render them)
- On all other routes, FAB + widget remain as-is

### 3. Larry Full Page (`/workspace/larry`)

**No changes.** Already has full feature parity: conversation list sidebar, message thread, `ChatInput` with file attach + voice, smart scroll, linked action chips.

### 4. Colleague Chat Page (`/workspace/chats`)

Full rewrite of the existing page (currently a Larry conversation list).

#### UI Layout

Two-column grid (280px sidebar + flexible main), matching the Larry page layout.

**Left panel — Conversation list:**
- Header: "Chats" with "New" dropdown (New Message / New Group)
- Conversation items showing: participant names, last message preview, timestamp
- Active state highlighting (purple tint, matching Larry page pattern)
- DMs show single colleague name; groups show group name

**Right panel — Active thread:**
- Header: participant name(s), member count for groups
- Message bubbles with sender initials avatar, content, timestamp
- User messages right-aligned (purple), others left-aligned (gray surface)
- `@Larry` mention support: typing `@Larry` in a message triggers Larry to respond in the thread
- Input area: reuses `ChatInput` component (attach + voice)

#### @Larry Mentions

When a colleague chat message contains `@Larry`:
- The message is sent normally to the colleague chat
- Additionally, the `@Larry` portion is extracted and sent to the existing Larry chat API (`sendLarryChat`)
- Larry's response is injected into the colleague chat thread as a message with `role: "larry"`
- This reuses the existing Larry backend — no new AI integration needed

#### API Routes

New routes under `/api/workspace/chats/`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workspace/chats/conversations` | GET | List colleague conversations |
| `/api/workspace/chats/conversations` | POST | Create new DM or group (body: `{ type, memberIds, name? }`) |
| `/api/workspace/chats/conversations/[id]/messages` | GET | Message history |
| `/api/workspace/chats/conversations/[id]/messages` | POST | Send message (detects `@Larry` server-side) |

**Backend approach:** Mock/stub implementation. API routes return realistic data and store messages in a simple structure. Enough to demonstrate the feature and build on later with real-time messaging.

#### Data Types

```typescript
interface ColleagueConversation {
  id: string;
  type: "dm" | "group";
  name: string | null;        // null for DMs, set for groups
  members: ColleagueMember[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

interface ColleagueMember {
  id: string;
  name: string;
  email: string;
}

interface ColleagueMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
}
```

## Files Changed

| File | Action |
|------|--------|
| `components/dashboard/Sidebar.tsx` | Edit: rename "Ask Larry" → "Larry", change to `<Link>` |
| `app/workspace/WorkspaceShell.tsx` | Edit: conditionally hide FAB + widget on `/workspace/larry` |
| `app/workspace/chats/page.tsx` | Rewrite: colleague DM + group chat UI |
| `app/api/workspace/chats/conversations/route.ts` | New: list + create conversations |
| `app/api/workspace/chats/conversations/[id]/messages/route.ts` | New: list + send messages |

## Out of Scope

- Real-time messaging (WebSockets / SSE) — future work
- Read receipts, typing indicators — future work
- Colleague presence / online status — future work
- File sharing in colleague chats — uses existing ChatInput attach UI but no backend upload processing
