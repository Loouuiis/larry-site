import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4_000).optional(),
  ownerUserId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const rows = await fastify.db.queryTenant(
        request.user.tenantId,
        `SELECT id, name, description, owner_user_id as "ownerUserId", status,
                risk_score as "riskScore", risk_level as "riskLevel",
                start_date as "startDate", target_date as "targetDate",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM projects
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [request.user.tenantId]
      );

      return { items: rows };
    }
  );

  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const body = CreateProjectSchema.parse(request.body);
      const rows = await fastify.db.queryTenant<{ id: string }>(
        request.user.tenantId,
        `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          request.user.tenantId,
          body.name,
          body.description ?? null,
          body.ownerUserId ?? request.user.userId,
          body.startDate ?? null,
          body.targetDate ?? null,
        ]
      );

      const projectId = rows[0].id;

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "project.create",
        objectType: "project",
        objectId: projectId,
        details: { name: body.name },
      });

      return reply.code(201).send({ id: projectId });
    }
  );
};
