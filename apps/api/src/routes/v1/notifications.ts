import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
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
};
