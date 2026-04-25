# Notifications Framework Design

**Date:** 2026-04-20
**Status:** Draft — pending user review
**Author:** Claude + Fergus

## Problem

Larry currently has two notification bells:

1. `NotificationBell.tsx` — in the workspace top bar, workspace-wide, purple badge, links to `/workspace/actions`.
2. `ActionBellDropdown.tsx` — inside the project overview, project-scoped, red badge, shows suggested events as a dropdown.

The two bells are semantically confused (one is a link to the Action Centre, the other is a project-scoped preview of suggestions) and neither surfaces the many background events a user needs to know about: cron scan results, teammate actions, email sends, action failures, etc.

## Goals

- Exactly **one bell**, top-right of the workspace top bar, workspace-wide.
- **Small banners** appear top-right when something notable happens: an action was executed, queued, drafted, or changed.
- **Every notification is clickable and deep-links** to the origin of the change (drafted email → mail centre with that draft; created task → task centre on that task; etc.).
- A unified event stream covers: user-initiated actions, background Larry actions, teammate changes, system/error events.
- Nothing is lost: if a user misses a banner, it lives in the bell.

## Non-Goals (v1)

- Real-time push (SSE/WebSocket). Polling is sufficient for launch; schema is forward-compatible.
- Email/push digests of unread notifications.
- Per-user preferences (mute certain types / projects).
- Inline actions inside banners (e.g. "Send now" on a drafted-email banner). Click-through to origin suffices.
- Cross-tenant notifications. `tenant_id` is mandatory on every row.

## Architecture

Three layers, each independently replaceable:

### 1. Event producers

Anywhere Larry does something notable (accept/modify/reject routes, cron scan, escalation worker, invite accept, email send, task mutations), a single server-side helper is called:

```ts
await recordNotification({
  tenantId,
  userId,        // null = broadcast to all members of tenant
  type,          // enum-like string, see registry
  title,         // one line
  body,          // optional second line
  deepLink,      // absolute path
  payload,       // jsonb extras
  batchId,       // groups events from same scan / bulk-accept
  severity,      // info | success | warning | error
});
```

This is the **only** allowed writer. A lint rule or grep-based CI check enforces no other code writes to the `notifications` table.

### 2. Transport

**Server → client (polling):**

- `GET /api/notifications?since=<iso>&limit=50` — returns `{ items, unreadCount, serverTime }`. Tenant + user scoped by session.
- `POST /api/notifications/read` — body `{ ids: string[] } | { all: true }`. Sets `read_at`.
- `POST /api/notifications/dismiss` — same shape. Sets `dismissed_at` (soft-delete).
- Client hook `useNotifications()` owns: SWR cache, 20s poll while `document.visibilityState === 'visible'`, pauses in background tabs, immediate fetch on focus, 304 handling.

**Client → client (immediate feedback):**

- `NotificationContext` exposes `notify(notification)` for synchronous banner display after local mutations.
- Convention: the mutation route writes the row **and** returns it in its JSON response as `{ ..., notification: Notification }`. The client mutation handler calls `notify(response.notification)`. The poll does not duplicate — the hook cache dedupes by `id`.

**Invariant:** one `recordNotification()` call = one banner (locally, via the response) + one bell entry (everywhere, after next poll). Local emit and server persist are the same function call — they cannot drift.

### 3. Consumers

- **Banner stack** — `<NotificationBanners />` mounted once in `WorkspaceShell`.
- **Bell** — single instance in `WorkspaceTopBar`, reads `useNotifications()`.
- **Deep-link registry** — a single map `type → (payload) => href`. Click always jumps somewhere correct because the link is derived from the registry, not freeform per caller.

## Data Model

**Discovery:** The `notifications` table already exists and is actively used by the email/escalation paths (`channel`, `subject`, `body`, `metadata`, `sent_at`, `read_at`, dedupe constraint on `(tenant_id, dedupe_scope, dedupe_user_key, channel, subject, dedupe_date)`). It has RLS enabled and a unique dedupe index. **We extend it rather than introduce a parallel table** — one post-launch schema surface beats two.

Migration `032_notifications_ui_fields.sql` (additive, safe):

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type         TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity     TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deep_link    TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id     UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_severity
  CHECK (severity IS NULL OR severity IN ('info','success','warning','error'));

CREATE INDEX IF NOT EXISTS idx_notifications_feed
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (tenant_id, user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
```

**Field mapping** (new UI rows vs existing email rows):

| Column         | Existing email row               | New UI-feed row                  |
|----------------|----------------------------------|----------------------------------|
| `channel`      | `email` / `escalation`           | `ui`                             |
| `subject`      | email subject                    | banner/feed title                |
| `body`         | email body                       | banner/feed body (optional)      |
| `metadata`     | email payload                    | `{ payload: ... }`               |
| `type`         | NULL                             | e.g. `task.created`              |
| `severity`     | NULL                             | `info`/`success`/`warning`/`error`|
| `deep_link`    | NULL                             | absolute path, e.g. `/workspace/mail/drafts/abc` |
| `batch_id`     | NULL                             | UUID grouping same scan/bulk    |
| `read_at`      | (already used)                   | per-row read state               |
| `dismissed_at` | NULL                             | soft-delete when user Xes it     |

**Feed query** (the `/v1/notifications` endpoint) filters `channel = 'ui'` so the UI never surfaces email-send rows. Email-send code paths are unchanged.

**Dedupe interaction:** the existing unique constraint is per `(channel, subject, day)`. Because UI rows set `channel='ui'` and subjects are event-specific (e.g. `Task created: "Finalise deck"`), collisions with email rows are impossible. UI rows set `dedupe_scope='ui-feed'` and a unique `dedupe_user_key` (event id) so two UI events within the same day with the same title both land.

**Retention:** 90 days for `channel='ui'` rows. Daily cron hard-deletes older rows scoped to the UI channel so email audit history is unaffected.

## Type Registry

A single TypeScript module `lib/notifications/types.ts` owns every known notification type. No event can be emitted without an entry here — this is what guarantees the "click always deep-links correctly" promise.

```ts
export type NotificationType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'email.drafted'
  | 'email.sent'
  | 'email.failed'
  | 'invite.sent'
  | 'invite.accepted'
  | 'scan.started'
  | 'scan.completed'
  | 'scan.failed'
  | 'action.executed'
  | 'action.failed'
  | 'teammate.joined'
  | 'teammate.edited_task';

export interface NotificationTypeSpec {
  defaultSeverity: 'info' | 'success' | 'warning' | 'error';
  deepLink: (payload: unknown) => string;
  renderTitle: (payload: unknown) => string;
  renderBody?: (payload: unknown) => string | null;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationTypeSpec> = {
  'email.drafted': {
    defaultSeverity: 'success',
    deepLink: (p: { draftId: string }) => `/workspace/mail/drafts/${p.draftId}`,
    renderTitle: (p: { recipient: string }) => `Email drafted for ${p.recipient}`,
  },
  'task.created': {
    defaultSeverity: 'success',
    deepLink: (p: { taskId: string; projectId: string }) =>
      `/workspace/projects/${p.projectId}/tasks/${p.taskId}`,
    renderTitle: (p: { title: string }) => `Task created: ${p.title}`,
  },
  // ... one entry per type
};
```

## UI

### Banner stack

- Component: `<NotificationBanners />`, mounted once in `WorkspaceShell`.
- Position: fixed top-right, 320px wide, stacks downward below the top bar.
- Capacity: max 3 visible. 4th+ collapses into one "+N more" pill that opens the bell on click.
- Auto-dismiss: 5 seconds from mount. Paused while the banner is hovered.
- Row shape: severity-coloured left border (green / blue / amber / red), bold title, optional body, small arrow icon, X button. Clicking anywhere except the X navigates to `deep_link` and marks the notification read.
- Built on the existing `components/toast/ToastContext.tsx` primitive — no new toast engine.
- Accessibility: `role="status"`, `aria-live="polite"`. Errors use `role="alert"` + `aria-live="assertive"`.

### Bell (top-right)

- Single instance in `WorkspaceTopBar`. 36px square, purple `#6c44f6` unread badge.
- Click opens 360px dropdown:
  - Header: "Notifications" + "Mark all read" link.
  - Feed: rows clustered by `batch_id`. A batch row shows "Larry scan: 10 changes" with a chevron; expanded, children show individually. A row with no `batch_id` renders as-is.
  - Row: severity dot, title, relative time, deep-link arrow. Click = mark read + navigate.
  - Footer: "View all →" goes to `/workspace/notifications` (repurposed route — full-page paged history).
- Empty state: "You're all caught up."
- Accessibility: `role="menu"`, Esc closes, focus trap while open.

### Actions nav badge

The "Actions" sidebar nav item gets a small count badge wired to the existing Action Centre pending count. **This is not a bell** and is visually distinct from the notification badge (different colour, different shape). It surfaces "action required" items that are orthogonal to notifications.

## Migration & Cleanup

1. **Delete** `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx` and its import + render in `ProjectWorkspaceView.tsx` (lines 51, 1818).
2. **Rewrite** `apps/web/src/app/workspace/NotificationBell.tsx`: drops the `count` / `onCountChange` props; reads from `useNotifications()` directly. `WorkspaceTopBar` stops threading the count.
3. **Add** pending-action badge to the "Actions" sidebar item in `components/dashboard/Sidebar.tsx`, fed by the existing Action Centre count source.
4. **Add** `lib/notifications/server.ts` (`recordNotification`), `lib/notifications/types.ts` (registry), `hooks/useNotifications.ts` (client).
5. **Audit** every mutation route in `apps/api`. At the success branch, add one `await recordNotification(...)` call. Bulk/scan producers pass a shared `batchId`.
6. **Migration** `032_notifications_ui_fields.sql` — additive ALTERs on the existing `notifications` table (no new table). Adds indexes + retention handling scoped to `channel='ui'`.
7. **Kill-switch** `NOTIFICATIONS_V2_ENABLED` env flag. When `false`, the bell falls back to the old Action-Centre count behaviour for one release cycle.

## Rollout

- Ship behind `NOTIFICATIONS_V2_ENABLED=false` on main.
- Enable on staging tenant, smoke-test banner + bell + deep-links for ~10 event types.
- Flip flag on prod. Monitor `notifications` row rate and the `/api/v1/notifications` poll latency.
- Remove flag + fallback code path two weeks later.

## Testing

- Unit: `recordNotification` writes exactly one row; registry has a spec for every `NotificationType`; deep-link functions produce valid paths for known payloads.
- Integration: after each mutation route, one row appears with the correct `tenant_id`, `user_id`, `type`.
- E2E (Playwright MCP on prod — per Larry testing conventions): trigger "draft email" action → banner appears top-right with correct title → click banner → lands on mail drafts page with that draft focused. Repeat for task.created and invite.accepted.
- Tenant isolation: user A's notifications never surface in user B's `/api/v1/notifications` response when B is in a different tenant.

## Open Questions (pending follow-up, not v1 blockers)

- When an unread notification's underlying resource is deleted (task deleted), should the notification be auto-dismissed, or click-through to a "not found" page with a friendly message? Suggest: soft-auto-dismiss on delete via the existing delete handlers.
- Should broadcast-to-tenant notifications (`user_id = null`) be visible to users who join the tenant *after* the event? Suggest: no — filter `created_at >= user.tenant_joined_at` in the query.

## Appendix — File Inventory

**New:**

- `apps/web/src/lib/notifications/server.ts`
- `apps/web/src/lib/notifications/types.ts`
- `apps/web/src/lib/notifications/registry.ts`
- `apps/web/src/hooks/useNotifications.ts`
- `apps/web/src/components/notifications/NotificationBanners.tsx`
- `apps/web/src/components/notifications/NotificationBellDropdown.tsx`
- (existing `apps/api/src/routes/v1/notifications.ts` gets new handlers bolted on — not a new file)
- `packages/db/src/migrations/032_notifications_ui_fields.sql`

**Modified:**

- `apps/api/src/routes/v1/notifications.ts` (extend existing GET + add read/dismiss)
- `apps/web/src/app/workspace/NotificationBell.tsx` (rewrite)
- `apps/web/src/app/workspace/WorkspaceTopBar.tsx` (drop count prop threading)
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` (remove ActionBellDropdown)
- `apps/web/src/components/dashboard/Sidebar.tsx` (add Actions count badge)
- `apps/web/src/app/workspace/notifications/page.tsx` (full-history page, reuses the new hook)
- Every mutation route in `apps/api/routes/**` that does something notable (add one `recordNotification` call each)

**Deleted:**

- `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx`
