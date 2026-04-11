import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/search",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { q } = SearchQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;
      const pattern = `%${q}%`;

      const [projectRows, taskRows, documentRows] = await Promise.all([
        fastify.db.queryTenant<{
          id: string;
          title: string;
          status: string | null;
        }>(
          tenantId,
          `SELECT id, name AS title, status
           FROM projects
           WHERE tenant_id = $1
             AND name ILIKE $2
           ORDER BY updated_at DESC
           LIMIT 5`,
          [tenantId, pattern]
        ),

        fastify.db.queryTenant<{
          id: string;
          title: string;
          status: string;
          projectId: string | null;
          projectName: string | null;
        }>(
          tenantId,
          `SELECT t.id,
                  t.title,
                  t.status,
                  t.project_id AS "projectId",
                  p.name       AS "projectName"
           FROM tasks t
           LEFT JOIN projects p
             ON p.id = t.project_id AND p.tenant_id = t.tenant_id
           WHERE t.tenant_id = $1
             AND t.title ILIKE $2
           ORDER BY t.updated_at DESC
           LIMIT 5`,
          [tenantId, pattern]
        ),

        fastify.db.queryTenant<{
          id: string;
          title: string;
          projectId: string | null;
          projectName: string | null;
        }>(
          tenantId,
          `SELECT d.id,
                  d.title,
                  d.project_id AS "projectId",
                  p.name       AS "projectName"
           FROM documents d
           LEFT JOIN projects p
             ON p.id = d.project_id AND p.tenant_id = d.tenant_id
           WHERE d.tenant_id = $1
             AND d.title ILIKE $2
           ORDER BY d.updated_at DESC
           LIMIT 5`,
          [tenantId, pattern]
        ),
      ]);

      return {
        projects: projectRows,
        tasks: taskRows,
        documents: documentRows,
      };
    }
  );
};
