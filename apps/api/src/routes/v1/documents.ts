import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/documents",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = z.object({
        projectId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId, query.limit];
      let sql = `SELECT d.id, d.title, d.doc_type, d.project_id, d.created_at,
                        d.created_by_user_id, p.name AS project_name
                 FROM documents d
                 LEFT JOIN projects p ON p.id = d.project_id
                 WHERE d.tenant_id = $1`;
      if (query.projectId) {
        values.push(query.projectId);
        sql += ` AND d.project_id = $${values.length}`;
      }
      sql += " ORDER BY d.created_at DESC LIMIT $2";

      const rows = await fastify.db.queryTenant<{
        id: string;
        title: string;
        doc_type: string;
        project_id: string | null;
        created_at: string;
        created_by_user_id: string | null;
        project_name: string | null;
      }>(tenantId, sql, values);

      return {
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          docType: r.doc_type,
          projectId: r.project_id,
          projectName: r.project_name,
          createdAt: r.created_at,
          createdByUserId: r.created_by_user_id,
        })),
      };
    }
  );
};
