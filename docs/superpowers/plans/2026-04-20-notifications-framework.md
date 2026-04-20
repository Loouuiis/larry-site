# Notifications Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Larry's two notification bells with a single workspace-wide bell plus a top-right banner stack, backed by a unified event framework so every notable action surfaces as (a) a clickable banner and (b) a persistent, deep-linkable bell entry.

**Architecture:** Extend the existing `notifications` Postgres table with UI-feed columns (additive only — email paths untouched). One server-side writer (`recordNotification`) is the sole entry point; it writes a row and returns it in the mutation response. A single client hook (`useNotifications`) polls `/v1/notifications?channel=ui` every 20s while visible, dedupes by id against locally-emitted notifications, and drives both the banner stack and the bell dropdown. Every notification type has exactly one entry in a central registry that supplies its deep-link and title.

**Tech Stack:** Fastify + Zod on the API, Next.js App Router + React hooks on the web, Postgres (existing), vitest on both sides, Playwright MCP for prod-bound E2E.

**Spec:** `docs/superpowers/specs/2026-04-20-notifications-framework-design.md`

**Pre-flight — read these files before starting:**

- `apps/api/src/routes/v1/notifications.ts` — the existing GET route; we extend it.
- `packages/db/src/schema.sql:369-440` — existing `notifications` table + dedupe constraint.
- `apps/web/src/app/workspace/NotificationBell.tsx` — the component being rewritten.
- `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx` — the component being deleted.
- `apps/web/src/app/workspace/WorkspaceTopBar.tsx` — top bar that mounts the bell.
- `apps/web/src/app/workspace/WorkspaceShell.tsx` — where `<NotificationBanners />` will mount.
- `apps/web/src/components/toast/ToastContext.tsx` — existing toast (leave alone; the new context is parallel).

**Conventions:**

- Database: Postgres migrations live at `packages/db/src/migrations/NNN_*.sql`. Next free number is **032**.
- API: routes under `apps/api/src/routes/v1/*.ts`, Fastify plugins, Zod for validation, `fastify.db.queryTenant(tenantId, sql, params)` is the tenant-scoped query helper.
- Web: Next.js App Router under `apps/web/src/app/**`; client hooks at `apps/web/src/hooks/`; shared libs at `apps/web/src/lib/`.
- Tests: vitest on both sides (`npm --prefix apps/api test`, `npm --prefix apps/web test`).
- Commits: conventional (`feat:`, `fix:`, `chore:`). Commit after each task.
- Feature flag: `NOTIFICATIONS_V2_ENABLED` (API reads `process.env`, web reads `process.env.NEXT_PUBLIC_NOTIFICATIONS_V2_ENABLED`).

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/db/src/migrations/032_notifications_ui_fields.sql` | Additive ALTERs + indexes |
| `packages/shared/src/notifications/types.ts` | `NotificationType` union, `Notification` shape, `Severity` (shared by API + web) |
| `packages/shared/src/notifications/registry.ts` | `NOTIFICATION_REGISTRY` (deep-link, title, severity per type) |
| `apps/api/src/lib/notifications/record.ts` | `recordNotification()` — the only allowed writer |
| `apps/api/src/lib/notifications/record.test.ts` | Unit tests for `recordNotification` |
| `apps/web/src/hooks/useNotifications.ts` | Poll + cache + `notify()` mutator |
| `apps/web/src/lib/notifications/NotificationContext.tsx` | Provider used by the hook |
| `apps/web/src/components/notifications/NotificationBanners.tsx` | Top-right stack of up to 3 |
| `apps/web/src/components/notifications/NotificationBellDropdown.tsx` | Bell dropdown content (clustering by `batch_id`) |

### Modified files

| Path | Change |
|---|---|
| `apps/api/src/routes/v1/notifications.ts` | Filter `channel='ui'`, return new columns, add `/read` (bulk), `/dismiss`, `/unread-count` |
| `apps/web/src/app/workspace/NotificationBell.tsx` | Rewrite: use `useNotifications()` + `NotificationBellDropdown`, drop `count`/`onCountChange` props |
| `apps/web/src/app/workspace/WorkspaceTopBar.tsx` | Stop threading count props to `NotificationBell` |
| `apps/web/src/app/workspace/WorkspaceShell.tsx` | Mount `<NotificationProvider>` and `<NotificationBanners />` |
| `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` | Remove `ActionBellDropdown` import + usage |
| `apps/web/src/components/dashboard/Sidebar.tsx` | Add pending-action count badge to "Actions" nav item |
| `apps/web/src/app/workspace/notifications/page.tsx` | Repurpose as paged full-history view using `useNotifications` |
| Mutation routes in `apps/api/src/routes/v1/**` (tasks, invitations, connectors-email, larry, etc.) | One `await recordNotification(...)` at each success branch |

### Deleted files

| Path | Reason |
|---|---|
| `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx` | Second bell eliminated |

---

## Task 1: Schema migration

**Files:**
- Create: `packages/db/src/migrations/032_notifications_ui_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 032_notifications_ui_fields.sql
-- Add UI-feed fields to existing notifications table. Additive only.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type         TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity     TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deep_link    TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id     UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_notifications_severity'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT chk_notifications_severity
      CHECK (severity IS NULL OR severity IN ('info','success','warning','error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_feed
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE dismissed_at IS NULL AND channel = 'ui';

CREATE INDEX IF NOT EXISTS idx_notifications_unread_ui
  ON notifications (tenant_id, user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL AND channel = 'ui';

CREATE INDEX IF NOT EXISTS idx_notifications_batch
  ON notifications (tenant_id, batch_id)
  WHERE batch_id IS NOT NULL;
```

- [ ] **Step 2: Run the migration locally (or against the staging DB) and verify**

Run: `npm --prefix packages/db run migrate`
Expected: exits 0, prints "applied 032_notifications_ui_fields.sql".

Then verify columns:
```sql
\d+ notifications
```
Expected: five new columns (`type`, `severity`, `deep_link`, `batch_id`, `dismissed_at`) all nullable.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/032_notifications_ui_fields.sql
git commit -m "feat(db): add UI-feed fields to notifications table

Additive ALTERs preparing for unified notifications framework.
Email paths unaffected (channel filter excludes them from the feed)."
```

---

## Task 2: Shared types

**Files:**
- Create: `packages/shared/src/notifications/types.ts`

- [ ] **Step 1: Write the types**

```ts
// packages/shared/src/notifications/types.ts
export type Severity = 'info' | 'success' | 'warning' | 'error';

export type NotificationType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'email.drafted'
  | 'email.sent'
  | 'email.failed'
  | 'invite.sent'
  | 'invite.accepted'
  | 'scan.completed'
  | 'scan.failed'
  | 'action.executed'
  | 'action.failed';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  deepLink: string;
  batchId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;   // ISO
  readAt: string | null;
  dismissedAt: string | null;
}

export interface NotificationBatch {
  batchId: string;
  headline: string;        // e.g. "Larry scan: 10 changes"
  count: number;
  createdAt: string;
  items: Notification[];
}

export type FeedRow =
  | { kind: 'single'; notification: Notification }
  | { kind: 'batch'; batch: NotificationBatch };
```

- [ ] **Step 2: Add index re-export**

Open `packages/shared/src/index.ts` (or equivalent barrel — create if none). Append:
```ts
export * from './notifications/types';
```

- [ ] **Step 3: Type-check**

Run: `npm --prefix packages/shared run build` (or `tsc --noEmit` if no build script).
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/notifications/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Notification types and NotificationType union"
```

---

## Task 3: Registry (deep-links + default titles)

**Files:**
- Create: `packages/shared/src/notifications/registry.ts`
- Create: `packages/shared/src/notifications/registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
// packages/shared/src/notifications/registry.test.ts
import { describe, it, expect } from 'vitest';
import { NOTIFICATION_REGISTRY } from './registry';
import type { NotificationType } from './types';

const ALL_TYPES: NotificationType[] = [
  'task.created', 'task.updated', 'task.deleted',
  'email.drafted', 'email.sent', 'email.failed',
  'invite.sent', 'invite.accepted',
  'scan.completed', 'scan.failed',
  'action.executed', 'action.failed',
];

describe('NOTIFICATION_REGISTRY', () => {
  it('has a spec for every NotificationType', () => {
    for (const t of ALL_TYPES) {
      expect(NOTIFICATION_REGISTRY[t], `missing: ${t}`).toBeTruthy();
    }
  });

  it('email.drafted deep-links to the draft', () => {
    const spec = NOTIFICATION_REGISTRY['email.drafted'];
    expect(spec.deepLink({ draftId: 'abc' })).toBe('/workspace/mail/drafts/abc');
  });

  it('task.created deep-links to the task in its project', () => {
    const spec = NOTIFICATION_REGISTRY['task.created'];
    expect(
      spec.deepLink({ taskId: 't1', projectId: 'p1' })
    ).toBe('/workspace/projects/p1/tasks/t1');
  });

  it('renderTitle uses payload', () => {
    const spec = NOTIFICATION_REGISTRY['task.created'];
    expect(spec.renderTitle({ title: 'Finalise deck' })).toBe('Task created: Finalise deck');
  });
});
```

- [ ] **Step 2: Run test — should fail (module missing)**

Run: `npm --prefix packages/shared test registry`
Expected: FAIL, cannot find module './registry'.

- [ ] **Step 3: Implement the registry**

```ts
// packages/shared/src/notifications/registry.ts
import type { NotificationType, Severity } from './types';

export interface NotificationSpec {
  defaultSeverity: Severity;
  deepLink: (payload: any) => string;
  renderTitle: (payload: any) => string;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationSpec> = {
  'task.created': {
    defaultSeverity: 'success',
    deepLink: (p: { taskId: string; projectId: string }) =>
      `/workspace/projects/${p.projectId}/tasks/${p.taskId}`,
    renderTitle: (p: { title: string }) => `Task created: ${p.title}`,
  },
  'task.updated': {
    defaultSeverity: 'info',
    deepLink: (p: { taskId: string; projectId: string }) =>
      `/workspace/projects/${p.projectId}/tasks/${p.taskId}`,
    renderTitle: (p: { title: string }) => `Task updated: ${p.title}`,
  },
  'task.deleted': {
    defaultSeverity: 'warning',
    deepLink: (p: { projectId: string }) => `/workspace/projects/${p.projectId}`,
    renderTitle: (p: { title: string }) => `Task deleted: ${p.title}`,
  },
  'email.drafted': {
    defaultSeverity: 'success',
    deepLink: (p: { draftId: string }) => `/workspace/mail/drafts/${p.draftId}`,
    renderTitle: (p: { recipient: string }) => `Email drafted for ${p.recipient}`,
  },
  'email.sent': {
    defaultSeverity: 'success',
    deepLink: (p: { messageId: string }) => `/workspace/mail/sent/${p.messageId}`,
    renderTitle: (p: { recipient: string }) => `Email sent to ${p.recipient}`,
  },
  'email.failed': {
    defaultSeverity: 'error',
    deepLink: (p: { draftId: string }) => `/workspace/mail/drafts/${p.draftId}`,
    renderTitle: (p: { recipient: string }) => `Email failed to send to ${p.recipient}`,
  },
  'invite.sent': {
    defaultSeverity: 'success',
    deepLink: () => `/workspace/members`,
    renderTitle: (p: { email: string }) => `Invite sent to ${p.email}`,
  },
  'invite.accepted': {
    defaultSeverity: 'success',
    deepLink: () => `/workspace/members`,
    renderTitle: (p: { email: string }) => `${p.email} joined the workspace`,
  },
  'scan.completed': {
    defaultSeverity: 'info',
    deepLink: () => `/workspace/actions`,
    renderTitle: (p: { changeCount: number }) =>
      `Larry scan complete — ${p.changeCount} change${p.changeCount === 1 ? '' : 's'}`,
  },
  'scan.failed': {
    defaultSeverity: 'error',
    deepLink: () => `/workspace/actions`,
    renderTitle: () => `Larry scan failed`,
  },
  'action.executed': {
    defaultSeverity: 'success',
    deepLink: (p: { actionId: string }) => `/workspace/actions?focus=${p.actionId}`,
    renderTitle: (p: { label: string }) => `Executed: ${p.label}`,
  },
  'action.failed': {
    defaultSeverity: 'error',
    deepLink: (p: { actionId: string }) => `/workspace/actions?focus=${p.actionId}`,
    renderTitle: (p: { label: string }) => `Action failed: ${p.label}`,
  },
};
```

- [ ] **Step 4: Run test — should pass**

Run: `npm --prefix packages/shared test registry`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from barrel**

Append to `packages/shared/src/index.ts`:
```ts
export * from './notifications/registry';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/notifications/registry.ts packages/shared/src/notifications/registry.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): notification registry with deep-link + title resolvers"
```

---

## Task 4: Server-side `recordNotification`

**Files:**
- Create: `apps/api/src/lib/notifications/record.ts`
- Create: `apps/api/src/lib/notifications/record.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/notifications/record.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { recordNotification } from './record';

const writes: any[] = [];
const fakeDb = {
  queryTenant: async (_tid: string, sql: string, params: unknown[]) => {
    writes.push({ sql, params });
    return [{
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-04-20T12:00:00Z',
    }];
  },
};

beforeEach(() => { writes.length = 0; });

describe('recordNotification', () => {
  it('inserts one row with channel=ui and returns the Notification', async () => {
    const n = await recordNotification({
      db: fakeDb as any,
      tenantId: 't1',
      userId: 'u1',
      type: 'task.created',
      payload: { taskId: 'task-1', projectId: 'proj-1', title: 'Deck' },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toMatch(/INSERT INTO notifications/);
    expect(writes[0].params).toContain('ui');          // channel
    expect(writes[0].params).toContain('task.created');// type
    expect(writes[0].params).toContain('success');     // severity from registry
    expect(n.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(n.deepLink).toBe('/workspace/projects/proj-1/tasks/task-1');
    expect(n.title).toBe('Task created: Deck');
  });

  it('allows severity override', async () => {
    await recordNotification({
      db: fakeDb as any,
      tenantId: 't1',
      userId: 'u1',
      type: 'task.created',
      payload: { taskId: 't', projectId: 'p', title: 'x' },
      severityOverride: 'warning',
    });
    expect(writes[0].params).toContain('warning');
  });

  it('propagates batchId', async () => {
    await recordNotification({
      db: fakeDb as any,
      tenantId: 't1',
      userId: 'u1',
      type: 'task.created',
      payload: { taskId: 't', projectId: 'p', title: 'x' },
      batchId: 'batch-1',
    });
    expect(writes[0].params).toContain('batch-1');
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `npm --prefix apps/api test record`
Expected: FAIL, cannot find module './record'.

- [ ] **Step 3: Implement `recordNotification`**

```ts
// apps/api/src/lib/notifications/record.ts
import {
  NOTIFICATION_REGISTRY,
  type Notification,
  type NotificationType,
  type Severity,
} from '@larry/shared';

interface RecordArgs {
  db: { queryTenant: <T = unknown>(tid: string, sql: string, params: unknown[]) => Promise<T[]> };
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  body?: string | null;
  severityOverride?: Severity;
  batchId?: string | null;
}

export async function recordNotification(args: RecordArgs): Promise<Notification> {
  const spec = NOTIFICATION_REGISTRY[args.type];
  if (!spec) {
    throw new Error(`Unknown notification type: ${args.type}`);
  }
  const severity = args.severityOverride ?? spec.defaultSeverity;
  const title = spec.renderTitle(args.payload);
  const deepLink = spec.deepLink(args.payload);
  const body = args.body ?? null;

  const [row] = await args.db.queryTenant<{ id: string; created_at: string }>(
    args.tenantId,
    `INSERT INTO notifications (
       tenant_id, user_id, channel, subject, body, metadata,
       type, severity, deep_link, batch_id,
       dedupe_scope, dedupe_user_key, dedupe_date
     )
     VALUES ($1, $2, 'ui', $3, $4, $5::jsonb, $6, $7, $8, $9,
             'ui-feed', gen_random_uuid()::text, CURRENT_DATE)
     RETURNING id, created_at`,
    [
      args.tenantId,
      args.userId,
      title,
      body,
      JSON.stringify({ payload: args.payload }),
      args.type,
      severity,
      deepLink,
      args.batchId ?? null,
    ]
  );

  return {
    id: row.id,
    tenantId: args.tenantId,
    userId: args.userId,
    type: args.type,
    severity,
    title,
    body,
    deepLink,
    batchId: args.batchId ?? null,
    payload: args.payload,
    createdAt: row.created_at,
    readAt: null,
    dismissedAt: null,
  };
}
```

- [ ] **Step 4: Run test — should pass**

Run: `npm --prefix apps/api test record`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/notifications/record.ts apps/api/src/lib/notifications/record.test.ts
git commit -m "feat(api): recordNotification — single writer for UI-feed events"
```

---

## Task 5: Extend `/v1/notifications` route

**Files:**
- Modify: `apps/api/src/routes/v1/notifications.ts`

- [ ] **Step 1: Rewrite the route**

Replace the entire file with:

```ts
// apps/api/src/routes/v1/notifications.ts
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/notifications
  fastify.get(
    "/notifications",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = z.object({
        since: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(request.query);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const params: unknown[] = [tenantId, userId];
      let sinceClause = "";
      if (query.since) {
        params.push(query.since);
        sinceClause = `AND created_at > $${params.length}`;
      }
      params.push(query.limit);

      const rows = await fastify.db.queryTenant<{
        id: string;
        type: string;
        severity: string;
        subject: string;
        body: string | null;
        deep_link: string;
        batch_id: string | null;
        metadata: { payload?: Record<string, unknown> } | null;
        created_at: string;
        read_at: string | null;
        dismissed_at: string | null;
      }>(
        tenantId,
        `SELECT id, type, severity, subject, body, deep_link, batch_id,
                metadata, created_at, read_at, dismissed_at
         FROM notifications
         WHERE tenant_id = $1
           AND channel = 'ui'
           AND (user_id = $2 OR user_id IS NULL)
           AND dismissed_at IS NULL
           ${sinceClause}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
      );

      const [{ count: unreadCount }] = await fastify.db.queryTenant<{ count: number }>(
        tenantId,
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE tenant_id = $1
           AND channel = 'ui'
           AND (user_id = $2 OR user_id IS NULL)
           AND dismissed_at IS NULL
           AND read_at IS NULL`,
        [tenantId, userId]
      );

      return {
        items: rows.map((r) => ({
          id: r.id,
          tenantId,
          userId,
          type: r.type,
          severity: r.severity,
          title: r.subject,
          body: r.body,
          deepLink: r.deep_link,
          batchId: r.batch_id,
          payload: r.metadata?.payload ?? null,
          createdAt: r.created_at,
          readAt: r.read_at,
          dismissedAt: r.dismissed_at,
        })),
        unreadCount,
        serverTime: new Date().toISOString(),
      };
    }
  );

  // POST /v1/notifications/read  { ids?: uuid[]; all?: boolean }
  fastify.post(
    "/notifications/read",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.union([
        z.object({ ids: z.array(z.string().uuid()).min(1) }),
        z.object({ all: z.literal(true) }),
      ]).parse(request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      if ("all" in body) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE notifications
           SET read_at = NOW()
           WHERE tenant_id = $1
             AND channel = 'ui'
             AND (user_id = $2 OR user_id IS NULL)
             AND read_at IS NULL`,
          [tenantId, userId]
        );
      } else {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE notifications
           SET read_at = NOW()
           WHERE tenant_id = $1
             AND channel = 'ui'
             AND (user_id = $2 OR user_id IS NULL)
             AND id = ANY($3::uuid[])`,
          [tenantId, userId, body.ids]
        );
      }
      return reply.send({ success: true });
    }
  );

  // POST /v1/notifications/dismiss  { ids: uuid[] }
  fastify.post(
    "/notifications/dismiss",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE notifications
         SET dismissed_at = NOW()
         WHERE tenant_id = $1
           AND channel = 'ui'
           AND (user_id = $2 OR user_id IS NULL)
           AND id = ANY($3::uuid[])`,
        [tenantId, userId, body.ids]
      );
      return reply.send({ success: true });
    }
  );
};
```

- [ ] **Step 2: Start API dev, hit endpoints with curl**

Run: `npm --prefix apps/api run dev` (background)
Then, assuming a valid JWT in `$TOKEN`:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/v1/notifications | jq .
```
Expected: `{ "items": [], "unreadCount": 0, "serverTime": "..." }` on a fresh DB.

- [ ] **Step 3: Verify tenant isolation with the existing vitest harness**

Run: `npm --prefix apps/api test notifications`
Expected: existing tests still green (if any); new behaviour verified via the integration test added in Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/notifications.ts
git commit -m "feat(api): UI-feed endpoints — GET/since, read (bulk/all), dismiss"
```

---

## Task 6: Integration test — round-trip a UI notification

**Files:**
- Create: `apps/api/src/routes/v1/notifications.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/routes/v1/notifications.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app';
import { recordNotification } from '../../lib/notifications/record';

let app: Awaited<ReturnType<typeof buildApp>>;
let tokenA: string;
let tokenB: string;
let tenantA: string;
let tenantB: string;
let userA: string;

beforeAll(async () => {
  app = await buildApp();
  // Helpers assumed to exist in the test harness — adapt to your actual
  // seed helpers. If absent, inline the SQL the seed script uses.
  ({ token: tokenA, tenantId: tenantA, userId: userA } = await app.testSeedUser());
  ({ token: tokenB, tenantId: tenantB } = await app.testSeedUser());
});

describe('GET /v1/notifications', () => {
  it('returns only channel=ui notifications for the caller tenant', async () => {
    await recordNotification({
      db: app.db,
      tenantId: tenantA,
      userId: userA,
      type: 'task.created',
      payload: { taskId: 't1', projectId: 'p1', title: 'Deck' },
    });

    const aRes = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(aRes.statusCode).toBe(200);
    const aBody = aRes.json();
    expect(aBody.items).toHaveLength(1);
    expect(aBody.items[0].type).toBe('task.created');
    expect(aBody.items[0].deepLink).toBe('/workspace/projects/p1/tasks/t1');
    expect(aBody.unreadCount).toBe(1);

    // Other tenant sees nothing.
    const bRes = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(bRes.json().items).toHaveLength(0);
  });

  it('read {all:true} zeroes the unread count', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/notifications/read',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { all: true },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.json().unreadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run — may fail if `testSeedUser` helper is missing**

Run: `npm --prefix apps/api test notifications.integration`
If the harness lacks `testSeedUser`, look at `apps/api/src/app.trust-proxy.test.ts` or any existing integration test for the real helper; swap the names. Do NOT stub past tenant isolation — it is the whole point.

- [ ] **Step 3: Make the test pass**

No code changes expected — Tasks 4 and 5 should already satisfy it. If it fails for a reason other than helpers, fix the route.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/notifications.integration.test.ts
git commit -m "test(api): tenant-isolated notification feed integration test"
```

---

## Task 7: Client context + `useNotifications` hook

**Files:**
- Create: `apps/web/src/lib/notifications/NotificationContext.tsx`
- Create: `apps/web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Implement the context**

```tsx
// apps/web/src/lib/notifications/NotificationContext.tsx
"use client";
import {
  createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState,
} from "react";
import type { Notification } from "@larry/shared";

interface Ctx {
  items: Notification[];
  unreadCount: number;
  notify: (n: Notification) => void;          // local emit (from mutation responses)
  markRead: (ids: string[] | "all") => Promise<void>;
  dismiss: (ids: string[]) => Promise<void>;
  bannerQueue: Notification[];                // items waiting to render as banners
  consumeBanner: (id: string) => void;
}

const NotificationContext = createContext<Ctx | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [bannerQueue, setBannerQueue] = useState<Notification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const lastFetched = useRef<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);

  const apply = useCallback((fresh: Notification[]) => {
    const newOnes: Notification[] = [];
    setItems((prev) => {
      const map = new Map(prev.map((n) => [n.id, n]));
      for (const n of fresh) {
        if (!map.has(n.id)) newOnes.push(n);
        map.set(n.id, n);
      }
      return Array.from(map.values()).sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
      );
    });
    // Only queue banners for notifications we haven't surfaced yet.
    setBannerQueue((q) => [
      ...q,
      ...newOnes.filter((n) => !seenIds.current.has(n.id)),
    ]);
    for (const n of newOnes) seenIds.current.add(n.id);
  }, []);

  const fetchOnce = useCallback(async () => {
    const url = lastFetched.current
      ? `/api/v1/notifications?since=${encodeURIComponent(lastFetched.current)}`
      : `/api/v1/notifications`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const { items: fresh, serverTime } = await res.json();
    apply(fresh);
    lastFetched.current = serverTime;
    lastFetchedAtRef.current = Date.now();
  }, [apply]);

  // Poll while visible, pause when hidden, immediate fetch on focus.
  useEffect(() => {
    let interval: number | undefined;
    const start = () => {
      void fetchOnce();
      interval = window.setInterval(fetchOnce, 20_000);
    };
    const stop = () => {
      if (interval) window.clearInterval(interval);
      interval = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOnce]);

  const notify = useCallback((n: Notification) => {
    apply([n]);
  }, [apply]);

  const markRead = useCallback(async (ids: string[] | "all") => {
    const body = ids === "all" ? { all: true } : { ids };
    await fetch("/api/v1/notifications/read", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setItems((prev) =>
      prev.map((n) =>
        ids === "all" || (Array.isArray(ids) && ids.includes(n.id))
          ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
          : n
      )
    );
  }, []);

  const dismiss = useCallback(async (ids: string[]) => {
    await fetch("/api/v1/notifications/dismiss", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const consumeBanner = useCallback((id: string) => {
    setBannerQueue((q) => q.filter((n) => n.id !== id));
  }, []);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.readAt && !n.dismissedAt).length,
    [items]
  );

  const value = useMemo<Ctx>(
    () => ({ items, unreadCount, notify, markRead, dismiss, bannerQueue, consumeBanner }),
    [items, unreadCount, notify, markRead, dismiss, bannerQueue, consumeBanner]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
```

- [ ] **Step 2: Re-export from the hook path for ergonomic imports**

```ts
// apps/web/src/hooks/useNotifications.ts
export { useNotifications } from "@/lib/notifications/NotificationContext";
```

- [ ] **Step 3: Type-check**

Run: `npm --prefix apps/web run typecheck` (or `tsc --noEmit`).
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/notifications/NotificationContext.tsx apps/web/src/hooks/useNotifications.ts
git commit -m "feat(web): NotificationContext with polling + local notify()"
```

---

## Task 8: Banner stack

**Files:**
- Create: `apps/web/src/components/notifications/NotificationBanners.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// apps/web/src/components/notifications/NotificationBanners.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@larry/shared";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

const SEVERITY_BORDER: Record<string, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

export function NotificationBanners() {
  const router = useRouter();
  const { bannerQueue, consumeBanner, markRead, dismiss } = useNotifications();
  const visible = bannerQueue.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, bannerQueue.length - MAX_VISIBLE);

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      {visible.map((n) => (
        <BannerCard
          key={n.id}
          notification={n}
          onClick={async () => {
            await markRead([n.id]);
            consumeBanner(n.id);
            router.push(n.deepLink);
          }}
          onDismiss={async () => {
            await dismiss([n.id]);
            consumeBanner(n.id);
          }}
          onExpire={() => consumeBanner(n.id)}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => {
            // Collapse the rest into the bell and scroll-focus it.
            for (const n of bannerQueue.slice(MAX_VISIBLE)) consumeBanner(n.id);
            document.getElementById("notification-bell-button")?.click();
          }}
          style={{
            pointerEvents: "auto",
            alignSelf: "flex-end",
            padding: "6px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

function BannerCard({
  notification: n,
  onClick,
  onDismiss,
  onExpire,
}: {
  notification: Notification;
  onClick: () => void;
  onDismiss: () => void;
  onExpire: () => void;
}) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (hover) return;
    const t = window.setTimeout(onExpire, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [hover, onExpire]);

  return (
    <div
      role={n.severity === "error" ? "alert" : "status"}
      aria-live={n.severity === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        pointerEvents: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${SEVERITY_BORDER[n.severity] ?? "#6b7280"}`,
        borderRadius: 8,
        boxShadow: "var(--shadow-1)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {n.body}
          </div>
        )}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          color: "var(--text-muted)",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm --prefix apps/web run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/notifications/NotificationBanners.tsx
git commit -m "feat(web): top-right banner stack (max 3, 5s auto-dismiss, +N overflow)"
```

---

## Task 9: Bell dropdown with batch clustering

**Files:**
- Create: `apps/web/src/components/notifications/NotificationBellDropdown.tsx`

- [ ] **Step 1: Implement the dropdown**

```tsx
// apps/web/src/components/notifications/NotificationBellDropdown.tsx
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { FeedRow, Notification } from "@larry/shared";

const SEVERITY_DOT: Record<string, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

export function NotificationBellDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, markRead } = useNotifications();

  const rows = useMemo<FeedRow[]>(() => clusterByBatch(items), [items]);

  const openOne = async (n: Notification) => {
    await markRead([n.id]);
    onClose();
    router.push(n.deepLink);
  };

  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        width: 360,
        maxHeight: 480,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-1)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-1)" }}>Notifications</span>
        <button
          type="button"
          onClick={() => markRead("all")}
          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}
        >
          Mark all read
        </button>
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          You're all caught up.
        </p>
      ) : (
        rows.map((row) =>
          row.kind === "single" ? (
            <FeedItem key={row.notification.id} n={row.notification} onOpen={openOne} />
          ) : (
            <BatchItem key={row.batch.batchId} row={row} onOpen={openOne} />
          )
        )
      )}

      <button
        type="button"
        onClick={() => {
          onClose();
          router.push("/workspace/notifications");
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "none",
          border: "none",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          cursor: "pointer",
          fontSize: 12,
          color: "var(--accent)",
        }}
      >
        View all →
      </button>
    </div>
  );
}

function FeedItem({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        background: n.readAt ? "transparent" : "var(--surface-2)",
        border: "none",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          marginTop: 5,
          borderRadius: "50%",
          background: SEVERITY_DOT[n.severity] ?? "#6b7280",
          flex: "0 0 auto",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, color: "var(--text-1)" }}>{n.title}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
          {formatRelative(n.createdAt)}
        </span>
      </span>
      <ChevronRight size={14} style={{ color: "var(--text-muted)", marginTop: 3 }} />
    </button>
  );
}

function BatchItem({
  row,
  onOpen,
}: {
  row: Extract<FeedRow, { kind: "batch" }>;
  onOpen: (n: Notification) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)" }}>
          {row.batch.headline}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {formatRelative(row.batch.createdAt)}
        </span>
      </button>
      {open && row.batch.items.map((n) => <FeedItem key={n.id} n={n} onOpen={onOpen} />)}
    </div>
  );
}

function clusterByBatch(items: Notification[]): FeedRow[] {
  const groups = new Map<string, Notification[]>();
  const singles: Notification[] = [];
  for (const n of items) {
    if (!n.batchId) { singles.push(n); continue; }
    const arr = groups.get(n.batchId) ?? [];
    arr.push(n);
    groups.set(n.batchId, arr);
  }
  const rows: FeedRow[] = singles.map((n) => ({ kind: "single", notification: n }));
  for (const [batchId, arr] of groups.entries()) {
    const head = arr[0];
    rows.push({
      kind: "batch",
      batch: {
        batchId,
        headline: `${arr.length} related changes`,
        count: arr.length,
        createdAt: head.createdAt,
        items: arr,
      },
    });
  }
  return rows.sort((a, b) =>
    +new Date(rowDate(b)) - +new Date(rowDate(a))
  );
}

function rowDate(r: FeedRow): string {
  return r.kind === "single" ? r.notification.createdAt : r.batch.createdAt;
}

function formatRelative(iso: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}
```

- [ ] **Step 2: Type-check**

Run: `npm --prefix apps/web run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/notifications/NotificationBellDropdown.tsx
git commit -m "feat(web): bell dropdown with batch clustering + mark-all-read"
```

---

## Task 10: Rewrite `NotificationBell.tsx`

**Files:**
- Modify: `apps/web/src/app/workspace/NotificationBell.tsx`

- [ ] **Step 1: Replace the file entirely**

```tsx
// apps/web/src/app/workspace/NotificationBell.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationBellDropdown } from "@/components/notifications/NotificationBellDropdown";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        id="notification-bell-button"
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6c44f6] px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationBellDropdown onClose={() => setOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Fix `WorkspaceTopBar.tsx` — drop the count props**

Grep for `NotificationBell` usage:
```bash
grep -n "NotificationBell" apps/web/src/app/workspace/WorkspaceTopBar.tsx
```
Remove any `count={...}` and `onCountChange={...}` attributes. The JSX should now just read `<NotificationBell />`. Also delete any state/effect that was fetching the count for this prop.

- [ ] **Step 3: Type-check**

Run: `npm --prefix apps/web run typecheck`
Expected: no errors. If the old prop threading still compiles, you missed a call site.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/NotificationBell.tsx apps/web/src/app/workspace/WorkspaceTopBar.tsx
git commit -m "refactor(web): NotificationBell reads from useNotifications hook"
```

---

## Task 11: Mount provider + banners in `WorkspaceShell`

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Wrap shell with provider and render banners**

Identify the outermost client component in `WorkspaceShell.tsx`. Import and add:

```tsx
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { NotificationBanners } from "@/components/notifications/NotificationBanners";
```

Wrap the returned tree like:

```tsx
return (
  <NotificationProvider>
    {/* ... existing shell tree ... */}
    <NotificationBanners />
  </NotificationProvider>
);
```

Important: `<NotificationBanners />` must be mounted *inside* `<NotificationProvider>` (obviously) AND `NotificationBell` inside the top bar must also be inside the same provider — verify by checking the component tree once.

- [ ] **Step 2: Dev server sanity check**

Run: `npm --prefix apps/web run dev` (background)
Open `/workspace`. Log in.
In the browser console, trigger a fake banner:
```js
// Obviously the prod emit comes from server — this is a sanity poke.
document.dispatchEvent(new CustomEvent("__larry_fake_notification"));
```
Expected: nothing happens (we haven't wired an event emitter); the poke is just to confirm the app compiles and renders.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceShell.tsx
git commit -m "feat(web): mount NotificationProvider and banner stack in WorkspaceShell"
```

---

## Task 12: Delete `ActionBellDropdown`

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`
- Delete: `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx`

- [ ] **Step 1: Remove import + usage**

In `ProjectWorkspaceView.tsx`:
```bash
grep -n "ActionBellDropdown" apps/web/src/app/workspace/projects/\[projectId\]/ProjectWorkspaceView.tsx
```
Delete line 51 (`import { ActionBellDropdown } ...`) and the JSX block starting at line 1818. If the block is nested in a container that becomes empty, leave the container (no layout regressions).

- [ ] **Step 2: Delete the component file**

```bash
git rm apps/web/src/app/workspace/projects/\[projectId\]/overview/ActionBellDropdown.tsx
```

- [ ] **Step 3: Type-check + visual check**

Run: `npm --prefix apps/web run typecheck` → no errors.
Open the dev server on a project page → no broken layout, no red bell in the project overview.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/ProjectWorkspaceView.tsx
git commit -m "chore(web): remove project-scoped ActionBellDropdown (second bell)"
```

---

## Task 13: Actions sidebar badge

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Find the existing pending-action count source**

Grep for what fed the old bell:
```bash
grep -rn "pendingActionsCount\|pendingCount\|suggested\.length" apps/web/src
```
Use the same source (likely via `useLarryActionCentre` or similar) rather than a new endpoint. If uncertain, read `apps/web/src/hooks/useLarryActionCentre.ts` first.

- [ ] **Step 2: Add a small badge next to the "Actions" nav item**

In `Sidebar.tsx`, locate the nav link whose label is "Actions". Next to its label, render:

```tsx
{pendingCount > 0 && (
  <span
    aria-label={`${pendingCount} pending`}
    style={{
      marginLeft: 6,
      minWidth: 16,
      height: 16,
      padding: "0 4px",
      borderRadius: 999,
      background: "var(--pm-gray-light)",     // visually distinct from the bell's purple #6c44f6
      color: "var(--pm-text-muted)",
      fontSize: 10,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {pendingCount > 99 ? "99+" : pendingCount}
  </span>
)}
```

Colour must **not** be `#6c44f6` (that's the bell's, they'd conflate). Use grey to signal "count" without competing with the bell's unread indicator.

- [ ] **Step 3: Visual check**

Dev server → confirm the grey count appears next to "Actions" when there are pending actions, and disappears when none.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "feat(web): grey count badge on Actions sidebar item"
```

---

## Task 14: Repurpose `/workspace/notifications` page

**Files:**
- Modify: `apps/web/src/app/workspace/notifications/page.tsx`

- [ ] **Step 1: Replace with a full-history list**

```tsx
// apps/web/src/app/workspace/notifications/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";

export default function NotificationsPage() {
  const { items, markRead, dismiss } = useNotifications();
  const router = useRouter();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Notifications</h1>
        <button type="button" onClick={() => markRead("all")}>Mark all read</button>
      </header>

      {items.length === 0 ? (
        <p style={{ marginTop: 32, color: "var(--text-muted)" }}>You're all caught up.</p>
      ) : (
        <ul style={{ marginTop: 16, padding: 0 }}>
          {items.map((n) => (
            <li
              key={n.id}
              style={{
                listStyle: "none",
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  await markRead([n.id]);
                  router.push(n.deepLink);
                }}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
              >
                <div style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </button>
              <button type="button" onClick={() => dismiss([n.id])} aria-label="Dismiss">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/notifications/page.tsx
git commit -m "feat(web): full-history notifications page reuses useNotifications"
```

---

## Task 15: Wire producers — one call per mutation success branch

This is the repetitive "audit" task. Work through each subsystem, **one commit per subsystem** so reverts are easy.

### 15a — Tasks

**Files:** `apps/api/src/routes/v1/tasks.ts`

- [ ] **Find success branches for: create, update, delete.** In each, after the DB mutation succeeds and before the JSON response, add:

```ts
import { recordNotification } from '../../lib/notifications/record';

// inside create handler:
const notification = await recordNotification({
  db: fastify.db,
  tenantId: request.user.tenantId,
  userId: request.user.userId,
  type: 'task.created',
  payload: { taskId: created.id, projectId: created.projectId, title: created.title },
});
return reply.send({ ...created, notification });
```

Mirror for `task.updated` and `task.deleted` with appropriate payloads.

- [ ] Commit: `feat(api): emit notifications on task mutations`

### 15b — Invitations

**Files:** `apps/api/src/routes/v1/invitations.ts`

- [ ] Add `type: 'invite.sent'` at invite-send success, `type: 'invite.accepted'` at accept success.
- [ ] Commit: `feat(api): emit notifications on invite sent/accepted`

### 15c — Email drafts & sends

**Files:** `apps/api/src/routes/v1/connectors-email.ts`

- [ ] On successful draft save: `type: 'email.drafted'` with `{ draftId, recipient }`.
- [ ] On successful send: `type: 'email.sent'` with `{ messageId, recipient }`.
- [ ] On send failure branch: `type: 'email.failed'` with `{ draftId, recipient }`, `severityOverride: 'error'`.
- [ ] Commit: `feat(api): emit notifications on email draft/send/fail`

### 15d — Larry actions (accept / modify / reject) and scans

**Files:** `apps/api/src/routes/v1/larry.ts` (and the worker `apps/worker/src/escalation.ts` only if it executes user-visible actions)

- [ ] On action execute success: `type: 'action.executed'` with `{ actionId, label }`, sharing one `batchId` (generate `crypto.randomUUID()` at the start of the handler) when the same request executes many actions at once.
- [ ] On failure branch: `type: 'action.failed'`.
- [ ] On scan completion (whichever route/worker marks the scan finished): `type: 'scan.completed'` with `{ changeCount }` and a shared `batchId` matching the child actions that the scan enqueued.
- [ ] On scan failure: `type: 'scan.failed'`.
- [ ] Commit: `feat(api): emit notifications for scans + accept/modify/reject`

---

## Task 16: Client-side — call `notify()` on mutation responses

**Files:** `apps/web/src/hooks/useLarryActionCentre.ts` and any other mutation caller that hits the routes modified in Task 15

- [ ] **Step 1: On each successful mutation that returns a `notification` field, call `notify()`**

Example shape:
```ts
import { useNotifications } from "@/hooks/useNotifications";

const { notify } = useNotifications();

async function acceptAction(id: string) {
  const res = await fetch(`/api/v1/larry/actions/${id}/accept`, { method: "POST", credentials: "include" });
  const json = await res.json();
  if (json.notification) notify(json.notification);
  return json;
}
```

- [ ] **Step 2: Dev server sanity check**

Start both api + web dev servers. Accept a Larry action. Expected: banner appears top-right within ~100ms (no 20s poll wait), bell count increments, click banner → lands on `/workspace/actions?focus=<id>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts apps/web/src/hooks/useProjectActionCentre.ts
git commit -m "feat(web): surface notifications via notify() on mutation responses"
```

---

## Task 17: E2E — three golden-path deep-links on prod

Per Larry testing conventions (see memory: `larry-testing-tools.md` and `larry-botid-blocks-headless-playwright.md`), Playwright MCP is the right tool on `larry-pm.com`. Use the test user `launch-test-2026@larry-pm.com / TestLarry123%`.

- [ ] **Step 1: Deploy the stack to prod (or staging)**

Follow the existing deploy flow (Vercel for web, Railway for api). Set `NOTIFICATIONS_V2_ENABLED=true` on Railway.

- [ ] **Step 2: Via Playwright MCP, run the three flows manually and script them**

Flow A — task creation:
1. Log in.
2. Open a project, create a task titled "E2E notify probe".
3. Expect a banner top-right: "Task created: E2E notify probe".
4. Click the banner.
5. Expect URL to match `/workspace/projects/<pid>/tasks/<tid>`.

Flow B — email draft:
1. Trigger a Larry suggestion that drafts an email and Accept it.
2. Expect banner "Email drafted for ...".
3. Click → URL matches `/workspace/mail/drafts/<id>`.

Flow C — invite accepted (two-session):
1. As the owner, invite a second test email.
2. In a second session, accept the invite.
3. Back in session 1, expect a banner "<email> joined the workspace" within 20s.
4. Click → `/workspace/members`.

- [ ] **Step 3: Record the script output and attach to the release notes**

Save the trace to `docs/qa/2026-04-20-notifications-e2e.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/qa/2026-04-20-notifications-e2e.md
git commit -m "test(e2e): prod-verified three notification deep-links"
```

---

## Task 18: Retention cron

**Files:**
- Create: `packages/db/src/migrations/033_notifications_retention.sql`

- [ ] **Step 1: Add daily cleanup for UI-channel rows older than 90 days**

```sql
-- 033_notifications_retention.sql
-- Hard-delete UI-feed notifications after 90 days. Email rows unaffected.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- pg_cron is provisioned on managed Postgres. Skip if absent (dev).
    RAISE NOTICE 'pg_cron not installed; skipping retention schedule';
  ELSE
    PERFORM cron.schedule(
      'notifications_ui_retention',
      '0 3 * * *',
      $$DELETE FROM notifications
        WHERE channel = 'ui'
          AND created_at < NOW() - INTERVAL '90 days'$$
    );
  END IF;
END $$;
```

- [ ] **Step 2: Run migration**

Run: `npm --prefix packages/db run migrate`
Expected: migration succeeds; on dev without pg_cron, prints the NOTICE; on Railway prod, schedules the job.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/033_notifications_retention.sql
git commit -m "feat(db): 90-day retention for channel=ui notifications"
```

---

## Task 19: Final cleanup + flag flip

- [ ] **Step 1: Confirm `NOTIFICATIONS_V2_ENABLED=true` on Railway + Vercel.** (Memory: `larry-testing-tools.md` for how to set env; or `vercel env add` / Railway UI.)
- [ ] **Step 2: Smoke-test once more on prod.** Run Flow A from Task 17.
- [ ] **Step 3: Update memory.** After Fergus confirms prod health, save a `project`-type memory at `larry-notifications-framework-shipped.md` noting the ship date, channel='ui' discriminator, and the flag name.
- [ ] **Step 4: Tag release.**

```bash
git tag -a notifications-v2 -m "Unified notifications framework shipped"
git push --tags
```

---

## Self-Review

**Spec coverage:**

| Spec section | Tasks |
|---|---|
| Architecture: producers / transport / consumers | 4, 5, 7, 8, 9 |
| Data model | 1 |
| Type registry | 2, 3 |
| UI (banners + bell) | 8, 9, 10, 11 |
| Migration & cleanup | 12, 13, 14 |
| Producer audit | 15 |
| Rollout | 18, 19 |
| Testing | 6, 17 |

All spec sections map to at least one task.

**Placeholder scan:** No "TBD", no "similar to Task N", every code step contains code. Task 15 subsections are templated but show the full emit pattern in 15a; 15b–15d reuse that template by type.

**Type consistency:** `recordNotification` args, `Notification` shape, and `/v1/notifications` response keys are identical across Tasks 2, 4, 5, 7. `notify()` accepts a full `Notification` in Tasks 7 and 16. Registry fields (`defaultSeverity`, `deepLink`, `renderTitle`) are consistent Tasks 3 → 4.

**Known risks acknowledged in the plan:**
- `testSeedUser` helper in Task 6 may not exist under that name — the plan explicitly instructs swapping to the real helper.
- Task 11 relies on finding the outermost client component in `WorkspaceShell.tsx`; if it's a server component wrapper, the `NotificationProvider` must be mounted inside the first `"use client"` child.
- `pg_cron` may not be installed on dev DB — Task 18 handles with a NOTICE.

No unresolved gaps.
