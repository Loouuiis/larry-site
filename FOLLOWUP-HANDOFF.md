# Followup Handoff — Larry chat + action-routing bugs

Date: 2026-04-12
Tester: Claude (Playwright MCP against `larry-pm.com`)
Test account: `larry@larry.com` (production test user)

## Status

- ✅ **Bug #2 fix — `initializedRef` stale init:** shipped in this branch.
- ✅ **Fix #3 — unify Modify / Open-linked-chat flows:** shipped in this branch.
- ⏳ **Bug #1 — "can't chat":** awaiting admin action (grant project access to
  reporting user). No code change yet for the UX gate.
- ⏳ **Fix #4 — empty-projects global chat UX:** still a product call.

Pushed changes land on `master`; Vercel redeploys `larry-pm.com` automatically.
Verify after deploy by running through the "Reproduction attempted" steps in
Bug #2 below — the URL param should now drive the visible chat.

---

## Bug #1 — "Can't chat to Larry"

### Not an API / money cap.

Verified by Playwright: sent a message in `/workspace/larry`, the POST to
`/api/workspace/larry/chat/stream` returned **200** and Larry responded
synchronously. No console errors. No 4xx/5xx.

### Actual symptom

Larry replies with:

> "I couldn't find any accessible projects to run this global chat request
> against. Select a project or ask an admin to grant project access."

### Root cause

The test account (and likely the user who reported this) has **no accessible
projects**. The chat pipeline requires project context even in "Global
workspace" mode — the "global" label is misleading: the backend still expects
the actor to own/be-a-member-of at least one project, or it refuses to do any
reasoning.

See `apps/api/src/routes/v1/larry.ts` — the chat handler early-exits with this
exact message when no projects resolve for the actor.

### Fixes to consider

1. **Immediate unblock:** add the reporting user (and the test account) to at
   least one project so the global chat has something to reason over.
2. **Product fix:** either
   - allow true project-less global chat (Larry should still be able to answer
     general questions / ask clarifying questions without a project), or
   - replace the "Global workspace" affordance with an explicit "pick a
     project first" gate so users don't silently hit this dead end.
3. **UX fix regardless:** the current error reads like a permissions problem
   ("ask an admin…"). Upgrade it to a call-to-action with a "Create a project"
   / "Request access" button.

### Evidence

- URL: `https://larry-pm.com/workspace/larry`
- Network (filtered on `larry`):
  - `POST /api/workspace/larry/chat/stream` → 200
  - `GET  /api/workspace/larry/conversations` → 200
  - `GET  /api/workspace/projects` → 200 (empty `items`)
- Console errors: 0
- Full reply text: as quoted above.

---

## Bug #2 — "Actions / Modify / options direct me to the wrong chat"

### Root cause (high confidence, code-level)

`apps/web/src/app/workspace/larry/page.tsx:325-368`

The conversation-selection effect is gated by a one-shot `initializedRef`:

```tsx
const initializedRef = useRef(false);
...
useEffect(() => {
  if (loading || initializedRef.current) return;          // <-- one-shot

  const requestedConversation = preferredConversationId
    ? conversations.find((c) => c.id === preferredConversationId)
    : null;

  if (requestedConversation) {
    setSelectedConversationId(requestedConversation.id);
    setDraftProjectId(requestedConversation.projectId);
    initializedRef.current = true;
    return;
  }
  ...
  initializedRef.current = true;
}, [conversations, draftFromQuery, loading,
    preferredConversationId, preferredProjectId]);
```

Once the page has initialized, the effect refuses to re-run its selection
logic — even though `preferredConversationId` is in the dep array and DOES
change on subsequent navigations.

### Why this produces "wrong chat"

Next.js App Router treats a navigation from `/workspace/larry?conversationId=A`
to `/workspace/larry?conversationId=B` as a **soft navigation**: the page
component is NOT remounted, only `searchParams` updates. The entry points
that trigger this flow:

- `/workspace/actions` → **"Open in chats"** link → `buildLinkedChatHref(event)`
  produces `/workspace/larry?conversationId=…&projectId=…&launch=action-centre`
  (`apps/web/src/app/workspace/actions/page.tsx:125-137`).
- Any `<Link href="/workspace/larry?conversationId=…">` elsewhere.

If the user was already on `/workspace/larry` when they clicked, the URL
updates to the new conversationId, the effect fires, but `initializedRef` is
already `true`, so `selectedConversationId` never changes. **Result: the URL
says B, the UI still shows A.** Exactly the reported symptom.

### Secondary factor — two chat UIs

There are two Larry chat surfaces that receive action events:

1. Floating widget `apps/web/src/app/workspace/LarryChat.tsx` (listens for
   `larry:load-conversation` and `larry:open` via `window` events).
2. Full page `apps/web/src/app/workspace/larry/page.tsx` (reads URL
   searchParams).

The **Modify** button on `/workspace/actions`
(`apps/web/src/app/workspace/actions/page.tsx:673-687`) takes path (1):
it dispatches `larry:open` + `larry:load-conversation`, which opens the
floating widget. Meanwhile the **"Open in chats"** link takes path (2).
Users mixing the two get inconsistent behaviour, and if they happen to be on
`/workspace/larry` already, path (2) hits the stale-init bug above.

Sidebar clicks inside `/workspace/larry` call `selectConversation()` which
sets `selectedConversationId` directly but **does not update the URL**
(`apps/web/src/app/workspace/larry/page.tsx:401-405`), so after a few clicks
the URL and the visible chat disagree. This also contributes to user
confusion when they then use a "share link" or browser back/forward.

### Proposed fix

One of the following, not both:

- **A. Remove the `initializedRef` one-shot**, and change the effect to
  re-select whenever `preferredConversationId` changes:

  ```tsx
  useEffect(() => {
    if (loading) return;
    if (!preferredConversationId) return;
    const match = conversations.find(c => c.id === preferredConversationId);
    if (match && match.id !== selectedConversationId) {
      setSelectedConversationId(match.id);
      setDraftProjectId(match.projectId);
    }
  }, [preferredConversationId, conversations, loading, selectedConversationId]);
  ```

  Keep a separate one-shot effect for the "no URL param → pick latest" default
  so sidebar clicks don't get overridden.

- **B. Make `selectConversation()` push the URL** (`router.replace` with the
  new `conversationId` search param). Then URL is the single source of truth
  and the existing one-shot keeps working. You still need to drop the
  one-shot for changes from outside the page.

Option **A** is the less invasive fix for the reported bug.

### Additional recommendation

Unify the two chat-open paths. Either:

- Modify button on `/workspace/actions` should `router.push` to the full
  chat page (path 2), OR
- "Open in chats" link should dispatch the custom event instead of
  navigating.

Mixing them is the root source of "I click different buttons and land in
different places."

### Reproduction attempted

Could not fully end-to-end reproduce via Playwright because the test account
has **zero Action Centre entries** — Action Centre at `/workspace/actions`
shows "0 Pending review, 0 Recent activity, 1 Linked chat". No `Modify` or
`Open in chats` buttons are rendered. Code-path reproduction only (above).

Unit repro for any human verifier:

1. Create ≥ 2 Larry conversations (e.g. A and B).
2. Hard-navigate to `/workspace/larry?conversationId=<A>` — correct chat
   loads (verified ✅).
3. On the same page, click a `<Link>` to `/workspace/larry?conversationId=<B>`
   (any link that does soft-nav — e.g. open the Action Centre in another tab,
   click "Open in chats", land back on `/workspace/larry` already mounted).
4. Observe: URL shows `?conversationId=<B>` but the transcript panel still
   shows conversation A. **← bug**

### Evidence captured

- Chat page verified to load conversation 9a1de829… correctly via hard nav.
- Second conversation d747f3e7… was created during testing and confirmed
  in the sidebar.
- `/workspace/actions` verified empty for the test account — no Modify /
  Open-in-chats buttons to click directly.
- Code references above are exact-line, not paraphrased.

---

## Unrelated housekeeping

- Clicking the sidebar chat item in `/workspace/larry` does not update the
  URL. Consider `router.replace` on `selectConversation` so users can share
  links.
- "Global context (top 5 accessible projects)" label is shown even when the
  user has 0 projects, which is misleading — tie into Bug #1's UX cleanup.

---

## Suggested next steps (priority order)

1. **Unblock chat for the reporting user** — grant them project access. This
   alone makes "can't chat to Larry" disappear.
2. **Fix `initializedRef` stale init** in `workspace/larry/page.tsx` — ~10
   line change, ships the routing bug fix.
3. **Unify the Modify / Open-in-chats flows** — medium-size cleanup, pays
   back in fewer "which chat am I in?" tickets.
4. **Improve the empty-projects global chat UX** — Larry should answer
   non-project questions or gate entry explicitly, not silently dead-end.
