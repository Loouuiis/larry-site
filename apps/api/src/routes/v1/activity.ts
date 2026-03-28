import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

type ActivityRow = {
  id: string;
  type: "signal" | "proposal" | "approval";
  title: string;
  subtitle: string | null;
  source: string | null;
  createdAt: string;
};

export const activityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/activity",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = ActivityQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<ActivityRow>(
        tenantId,
        `SELECT *
         FROM (
           SELECT
             ce.id::text as id,
             'signal'::text as type,
             COALESCE(ce.event_type, 'signal') as title,
             ce.actor as subtitle,
             ce.source as source,
             ce.created_at as "createdAt"
           FROM canonical_events ce
           WHERE ce.tenant_id = $1

           UNION ALL

           SELECT
             le.id::text as id,
             'proposal'::text as type,
             COALESCE(le.action_type, 'proposal') as title,
             le.display_text as subtitle,
             'larry'::text as source,
             le.created_at as "createdAt"
           FROM larry_events le
           WHERE le.tenant_id = $1
             AND le.event_type IN ('suggested', 'auto_executed')

           UNION ALL

           SELECT
             le.id::text as id,
             'approval'::text as type,
             le.event_type as title,
             le.display_text as subtitle,
             'larry'::text as source,
             le.created_at as "createdAt"
           FROM larry_events le
           WHERE le.tenant_id = $1
             AND le.event_type IN ('accepted', 'dismissed')
         ) activity_union
         ORDER BY "createdAt" DESC
         LIMIT $2`,
        [tenantId, query.limit]
      );

      return {
        items: rows,
      };
    }
  );
};

