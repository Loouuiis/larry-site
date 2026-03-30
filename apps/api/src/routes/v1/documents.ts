import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";

const ListDocumentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  docType: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const CreateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50_000),
  docType: z.string().trim().min(1).max(80),
  sourceKind: z.string().trim().min(1).max(64).optional().nullable(),
  sourceRecordId: z.string().trim().min(1).max(200).optional().nullable(),
  version: z.number().int().min(1).max(10_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attachTaskId: z.string().uuid().optional(),
});

type DocumentListRow = {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  docType: string;
  sourceKind: string | null;
  sourceRecordId: string | null;
  version: number;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AttachmentRow = {
  id: string;
  taskId: string;
  documentId: string;
  createdAt: string;
};

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertProjectReadAccessOrThrow(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
  }) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      tenantRole: input.tenantRole,
    });

    if (!access.projectExists) {
      throw fastify.httpErrors.notFound("Project not found.");
    }

    if (!access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }
  }

  fastify.get(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const query = ListDocumentsQuerySchema.parse(request.query ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      if (query.projectId) {
        await assertProjectReadAccessOrThrow({
          tenantId,
          userId: actorUserId,
          tenantRole: request.user.role,
          projectId: query.projectId,
        });
      }

      const values: unknown[] = [tenantId];
      let sql = `SELECT d.id,
                        d.project_id as "projectId",
                        d.title,
                        d.content,
                        d.doc_type as "docType",
                        d.source_kind as "sourceKind",
                        d.source_record_id as "sourceRecordId",
                        d.version,
                        d.metadata,
                        d.created_by_user_id as "createdByUserId",
                        d.created_at as "createdAt",
                        d.updated_at as "updatedAt"
                   FROM documents d`;

      if (request.user.role !== "admin") {
        values.push(actorUserId);
        sql += ` JOIN project_memberships pm
                   ON pm.tenant_id = d.tenant_id
                  AND pm.project_id = d.project_id
                  AND pm.user_id = $2`;
      }

      sql += ` WHERE d.tenant_id = $1`;

      if (query.projectId) {
        values.push(query.projectId);
        sql += ` AND d.project_id = $${values.length}`;
      }

      if (query.docType) {
        values.push(query.docType);
        sql += ` AND d.doc_type = $${values.length}`;
      }

      values.push(query.limit);
      sql += ` ORDER BY d.updated_at DESC, d.created_at DESC
               LIMIT $${values.length}`;

      const rows = await fastify.db.queryTenant<DocumentListRow>(tenantId, sql, values);
      return { items: rows };
    }
  );

  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = CreateDocumentSchema.parse(request.body ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      await assertProjectReadAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: body.projectId,
      });

      if (body.attachTaskId) {
        const taskRows = await fastify.db.queryTenant<{ id: string; project_id: string }>(
          tenantId,
          `SELECT id, project_id
             FROM tasks
            WHERE tenant_id = $1
              AND id = $2
            LIMIT 1`,
          [tenantId, body.attachTaskId]
        );
        if (!taskRows[0]) {
          throw fastify.httpErrors.notFound("Task not found.");
        }
        if (taskRows[0].project_id !== body.projectId) {
          throw fastify.httpErrors.conflict(
            "Cannot attach a document to a task in a different project."
          );
        }
      }

      const version = body.version ?? 1;
      const sourceKind = body.sourceKind?.trim() || "manual";
      const sourceRecordId = body.sourceRecordId?.trim() || null;
      const metadata = body.metadata ?? {};

      const createdRows = await fastify.db.queryTenant<DocumentListRow>(
        tenantId,
        `INSERT INTO documents
          (tenant_id, project_id, title, content, doc_type, source_kind, source_record_id, version, metadata, created_by_user_id)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING id,
                   project_id as "projectId",
                   title,
                   content,
                   doc_type as "docType",
                   source_kind as "sourceKind",
                   source_record_id as "sourceRecordId",
                   version,
                   metadata,
                   created_by_user_id as "createdByUserId",
                   created_at as "createdAt",
                   updated_at as "updatedAt"`,
        [
          tenantId,
          body.projectId,
          body.title,
          body.content,
          body.docType,
          sourceKind,
          sourceRecordId,
          version,
          JSON.stringify(metadata),
          actorUserId,
        ]
      );

      const document = createdRows[0];
      let attachment: AttachmentRow | null = null;

      if (body.attachTaskId) {
        const attachmentRows = await fastify.db.queryTenant<AttachmentRow>(
          tenantId,
          `INSERT INTO task_document_attachments
             (tenant_id, task_id, document_id, attached_by_user_id)
           VALUES
             ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, task_id, document_id) DO NOTHING
           RETURNING id,
                     task_id as "taskId",
                     document_id as "documentId",
                     created_at as "createdAt"`,
          [tenantId, body.attachTaskId, document.id, actorUserId]
        );

        if (attachmentRows[0]) {
          attachment = attachmentRows[0];
        } else {
          const existingRows = await fastify.db.queryTenant<AttachmentRow>(
            tenantId,
            `SELECT id,
                    task_id as "taskId",
                    document_id as "documentId",
                    created_at as "createdAt"
               FROM task_document_attachments
              WHERE tenant_id = $1
                AND task_id = $2
                AND document_id = $3
              LIMIT 1`,
            [tenantId, body.attachTaskId, document.id]
          );
          attachment = existingRows[0] ?? null;
        }

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "task.document.attach",
          objectType: "task_document_attachment",
          objectId: `${body.attachTaskId}:${document.id}`,
          details: { taskId: body.attachTaskId, documentId: document.id, projectId: body.projectId },
        });
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "document.create",
        objectType: "document",
        objectId: document.id,
        details: {
          projectId: body.projectId,
          docType: body.docType,
          sourceKind,
          sourceRecordId,
          attachTaskId: body.attachTaskId ?? null,
        },
      });

      return reply.code(201).send({
        document,
        attachment,
      });
    }
  );
};
