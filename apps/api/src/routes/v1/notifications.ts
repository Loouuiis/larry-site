import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Legacy endpoints (all channels, used by existing bell + notifications page) ──
  // Preserved until the v2 UI ships (Slice 3). Do not remove until bell is rewritten.

  fastify.get(
    "/notifications",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = z.object({
        unread: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }).parse(request.query);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const onlyUnread = query.unread === "true";

      const rows = await fastify.db.queryTenant<{
        id: string;
        channel: string;
        subject: string | null;
        body: string | null;
        sent_at: string | null;
        read_at: string | null;
        metadata: unknown;
        created_at: string;
      }>(
        tenantId,
        `SELECT id, channel, subject, body, sent_at, read_at, metadata, created_at
         FROM notifications
         WHERE tenant_id = $1
           AND (user_id = $2 OR user_id IS NULL)
           ${onlyUnread ? "AND read_at IS NULL" : ""}
         ORDER BY created_at DESC
         LIMIT $3`,
        [tenantId, userId, query.limit]
      );

      const unreadCount = onlyUnread
        ? rows.length
        : rows.filter((r) => !r.read_at).length;

      return {
        notifications: rows.map((r) => ({
          id: r.id,
          title: r.subject ?? "Notification",
          body: r.body,
          source: r.channel,
          createdAt: r.created_at,
          readAt: r.read_at,
        })),
        unreadCount,
      };
    }
  );

  fastify.post(
    "/notifications/:id/read",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE notifications SET read_at = NOW() WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)`,
        [tenantId, params.id, request.user.userId]
      );

      return reply.send({ success: true });
    }
  );

  // ── v2 UI-feed endpoints (channel='ui' only) ─────────────────────────────────

  // GET /v1/notifications/feed — UI feed with since + structured payload
  fastify.get(
    "/notifications/feed",
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

  // POST /v1/notifications/read  { ids?: uuid[]; all?: boolean }  (UI-feed only)
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

  // POST /v1/notifications/dismiss  { ids: uuid[] }  (UI-feed only)
  fastify.post(
    "/notifications/dismiss",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({
        ids: z.array(z.string().uuid()).min(1),
      }).parse(request.body);
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
