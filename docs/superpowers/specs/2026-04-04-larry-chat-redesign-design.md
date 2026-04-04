# Larry Chat Widget & Full-Page Chat Redesign

**Date:** 2026-04-04
**Status:** Approved

## Problem

The current Larry chat widget has several UX issues:
1. Header shows generic "project context" badge instead of the actual project name
2. No multi-conversation support — messages pile up in a single thread per project
3. Chat opens with a jarring smooth-scroll animation instead of appearing at the bottom
4. Same scroll bug exists in the full-page chats page
5. No way to start new conversations or browse chat history from the widget
6. No file upload or voice input capability
7. Larry conversations live under "Chats" in the sidebar alongside future colleague messaging

## Scope

### In Scope
- Floating widget header redesign (breadcrumb with project name)
- Multi-conversation support in widget (history dropdown, new chat button)
- Full-page "Ask Larry" chat page with Claude-style conversation list
- Sidebar navigation: rename/restructure to separate "Chats" (colleagues) from "Ask Larry"
- Input bar redesign with toolbar (Attach + Voice) for both widget and full page
- File attachment UI (chips above input, file picker on +)
- Scroll fix: instant on open, smart auto-scroll with IntersectionObserver
- Voice input button (triggers existing voice input infrastructure)

### Out of Scope
- Colleague-to-colleague chat infrastructure (future)
- File processing backend (just the upload UI for now — backend can be wired later)
- Voice transcription backend (button triggers existing `onVoiceInput` prop)

## Design Decisions

### 1. Widget Header — Breadcrumb Style
- Format: `✦ Larry · {Project Name}`
- Right-side actions: `+` (new chat), `☰` (history dropdown), `✕` (close)
- Project name sourced from the active project context
- When no project: show "No project" or hide the project name portion

### 2. Navigation Architecture
- Sidebar "Chats" item = colleague messaging (future). Remove Larry conversations from here.
- Sidebar "Ask Larry" item = opens `/workspace/larry` full-page chat experience
- Floating widget remains at bottom-right as quick project-scoped chat
- Both widget and full page share the same Larry API endpoints

### 3. Conversation List — Minimalist (Claude-style)
- No card borders — plain text rows on white/light background
- Hover: subtle purple background `rgba(108,68,246,0.08)`
- Active: deeper purple background `rgba(108,68,246,0.12)` with purple title text
- Each row: conversation title + relative timestamp
- `+` button at top-right of list header for new chat
- Conversation titles auto-generated from first user message (existing behavior)

### 4. Widget Chat History — Dropdown Overlay
- Clicking `☰` in widget header opens a floating dropdown over the chat area
- Shows recent conversations for the current project
- "New Chat" option at top
- Clicking a conversation loads it; clicking outside dismisses dropdown
- Matches the minimalist list style from full-page design

### 5. Input Bar — Two-Row Toolbar
- Top row: small icon toolbar with "Attach" (paperclip icon + label) and "Voice" (mic icon + label)
- Separator between toolbar items
- Bottom row: text input + Send button
- Attached files appear as dismissible chips above the toolbar
- File chips show: file icon + filename + × dismiss button
- Purple chip background (`#f3f0ff`) with subtle border
- Applies to both widget and full-page chat

### 6. Scroll Behavior Fix
**Initial open (widget + full page):**
- Use `useLayoutEffect` with `scrollIntoView({ behavior: 'instant' })` on mount
- No visible scrolling animation when chat opens

**New messages:**
- IntersectionObserver on the scroll anchor div
- If user is at bottom → smooth scroll to new message
- If user scrolled up → do NOT auto-scroll; show "New messages ↓" indicator
- Clicking indicator scrolls to bottom instantly

**Conversation switching:**
- Store scroll position per conversation ID in a ref map
- Restore position when switching back to a conversation

## File Changes

### Modified Files
1. `apps/web/src/app/workspace/LarryChat.tsx` — Widget header, input bar, history dropdown, scroll fix
2. `apps/web/src/app/workspace/useLarryChat.ts` — Multi-conversation state, conversation list loading
3. `apps/web/src/app/workspace/WorkspaceShell.tsx` — Sidebar navigation changes
4. `apps/web/src/app/workspace/chats/page.tsx` — Full-page chat redesign, scroll fix, input bar

### Potentially New Files
5. `apps/web/src/app/workspace/larry/page.tsx` — New "Ask Larry" full-page route (if separate from existing chats page)
6. `apps/web/src/components/larry/ChatInput.tsx` — Shared input bar component (widget + full page)
7. `apps/web/src/components/larry/ConversationList.tsx` — Shared conversation list component
8. `apps/web/src/hooks/useSmartScroll.ts` — Reusable scroll behavior hook

## API Dependencies
- `listLarryConversations(projectId?)` — already exists, returns conversations
- `listLarryMessages(conversationId)` — already exists, returns messages
- `sendLarryChat(input)` — already exists, handles message sending
- No new API endpoints needed
