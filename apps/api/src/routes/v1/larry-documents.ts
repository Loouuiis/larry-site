import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const ListLarryDocumentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  docType: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const LarryDocumentParamsSchema = z.object({
  id: z.string().uuid(),
});

const UpdateLarryDocumentSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  content: z.string().trim().min(1).max(200_000).optional(),
  state: z.enum(["draft", "final", "sent"]).optional(),
});

type LarryDocumentRow = {
  id: string;
  projectId: string | null;
  larryEventId: string | null;
  title: string;
  docType: string;
  content: string;
  emailRecipient: string | null;
  emailSubject: string | null;
  emailSentAt: string | null;
  state: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT_COLUMNS = `
  ld.id,
  ld.project_id       AS "projectId",
  ld.larry_event_id   AS "larryEventId",
  ld.title,
  ld.doc_type         AS "docType",
  ld.content,
  ld.email_recipient  AS "emailRecipient",
  ld.email_subject    AS "emailSubject",
  ld.email_sent_at    AS "emailSentAt",
  ld.state,
  ld.created_by_user_id AS "createdByUserId",
  ld.created_at       AS "createdAt",
  ld.updated_at       AS "updatedAt"
`.trim();

export const larryDocumentsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/larry/documents — list documents for workspace or project
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const query = ListLarryDocumentsQuerySchema.parse(request.query ?? {});
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId];
      let sql = `SELECT ${SELECT_COLUMNS}
                   FROM larry_documents ld
                  WHERE ld.tenant_id = $1`;

      if (query.projectId) {
        values.push(query.projectId);
        sql += ` AND ld.project_id = $${values.length}`;
      }

      if (query.docType) {
        values.push(query.docType);
        sql += ` AND ld.doc_type = $${values.length}`;
      }

      values.push(query.limit);
      sql += ` ORDER BY ld.created_at DESC
               LIMIT $${values.length}`;

      const rows = await fastify.db.queryTenant<LarryDocumentRow>(tenantId, sql, values);
      return { items: rows };
    }
  );

  // GET /v1/larry/documents/:id — get single document
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = LarryDocumentParamsSchema.parse(request.params ?? {});
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<LarryDocumentRow>(
        tenantId,
        `SELECT ${SELECT_COLUMNS}
           FROM larry_documents ld
          WHERE ld.tenant_id = $1
            AND ld.id = $2
          LIMIT 1`,
        [tenantId, params.id]
      );

      if (!rows[0]) {
        throw fastify.httpErrors.notFound("Larry document not found.");
      }

      return rows[0];
    }
  );

  // PATCH /v1/larry/documents/:id — update title, content, or state
  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = LarryDocumentParamsSchema.parse(request.params ?? {});
      const body = UpdateLarryDocumentSchema.parse(request.body ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      if (!body.title && !body.content && !body.state) {
        throw fastify.httpErrors.badRequest(
          "At least one of title, content, or state must be provided."
        );
      }

      // Verify document exists and belongs to tenant
      const existingRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM larry_documents WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, params.id]
      );
      if (!existingRows[0]) {
        throw fastify.httpErrors.notFound("Larry document not found.");
      }

      const setClauses: string[] = ["updated_at = now()"];
      const values: unknown[] = [tenantId, params.id];

      if (body.title !== undefined) {
        values.push(body.title);
        setClauses.push(`title = $${values.length}`);
      }
      if (body.content !== undefined) {
        values.push(body.content);
        setClauses.push(`content = $${values.length}`);
      }
      if (body.state !== undefined) {
        values.push(body.state);
        setClauses.push(`state = $${values.length}`);
      }

      const updatedRows = await fastify.db.queryTenant<LarryDocumentRow>(
        tenantId,
        `UPDATE larry_documents
            SET ${setClauses.join(", ")}
          WHERE tenant_id = $1
            AND id = $2
          RETURNING id,
                    project_id       AS "projectId",
                    larry_event_id   AS "larryEventId",
                    title,
                    doc_type         AS "docType",
                    content,
                    email_recipient  AS "emailRecipient",
                    email_subject    AS "emailSubject",
                    email_sent_at    AS "emailSentAt",
                    state,
                    created_by_user_id AS "createdByUserId",
                    created_at       AS "createdAt",
                    updated_at       AS "updatedAt"`,
        values
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry_document.update",
        objectType: "larry_document",
        objectId: params.id,
        details: { fields: Object.keys(body) },
      });

      return updatedRows[0];
    }
  );

  // DELETE /v1/larry/documents/:id — remove document
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const params = LarryDocumentParamsSchema.parse(request.params ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const deletedRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `DELETE FROM larry_documents
          WHERE tenant_id = $1
            AND id = $2
          RETURNING id`,
        [tenantId, params.id]
      );

      if (!deletedRows[0]) {
        throw fastify.httpErrors.notFound("Larry document not found.");
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry_document.delete",
        objectType: "larry_document",
        objectId: params.id,
        details: {},
      });

      return reply.code(204).send();
    }
  );
};
