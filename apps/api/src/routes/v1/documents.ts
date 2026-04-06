import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";
import {
  generateProjectBriefPptx,
  generateProjectStatusDocx,
  generateTaskExportXlsx,
} from "../../services/document-generator.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
} from "../../lib/project-write-lock.js";

const ListDocumentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  docType: z.string().trim().min(1).max(80).optional(),
  folderId: z.string().uuid().optional(),
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
  folderId: z.string().uuid().optional(),
});

const GenerateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  templateType: z.enum(["project_status", "task_export", "project_brief"]),
  format: z.enum(["docx", "xlsx", "pptx"]),
});

const DownloadParamsSchema = z.object({
  id: z.string().uuid(),
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
  folderId: string | null;
};

type AttachmentRow = {
  id: string;
  taskId: string;
  documentId: string;
  createdAt: string;
};

type ProjectForGenerationRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  riskLevel: string;
};

type TaskForGenerationRow = {
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
  progressPercent: number;
  riskLevel: string;
};

type MeetingForGenerationRow = {
  title: string | null;
  summary: string | null;
  createdAt: string;
};

const MIME_TYPE_BY_FORMAT: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function safeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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

    return access;
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

      if (query.folderId) {
        values.push(query.folderId);
        sql += ` AND d.folder_id = $${values.length}`;
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

      const access = await assertProjectReadAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: body.projectId,
      });
      if (isProjectWriteLocked(access.projectStatus)) {
        throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
      }

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
          (tenant_id, project_id, title, content, doc_type, source_kind, source_record_id, version, metadata, created_by_user_id, folder_id)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
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
                   updated_at as "updatedAt",
                   folder_id as "folderId"`,
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
          body.folderId ?? null,
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

  fastify.post(
    "/generate",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = GenerateDocumentSchema.parse(request.body ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const access = await assertProjectReadAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: body.projectId,
      });
      if (isProjectWriteLocked(access.projectStatus)) {
        throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
      }

      const [projectRows, taskRows, meetingRows] = await Promise.all([
        fastify.db.queryTenant<ProjectForGenerationRow>(
          tenantId,
          `SELECT id,
                  name,
                  description,
                  status,
                  risk_level as "riskLevel"
             FROM projects
            WHERE tenant_id = $1
              AND id = $2
            LIMIT 1`,
          [tenantId, body.projectId]
        ),
        fastify.db.queryTenant<TaskForGenerationRow>(
          tenantId,
          `SELECT t.title,
                  t.status::text as status,
                  t.priority::text as priority,
                  u.display_name as assignee,
                  t.due_date::text as "dueDate",
                  t.progress_percent as "progressPercent",
                  t.risk_level::text as "riskLevel"
             FROM tasks t
        LEFT JOIN users u
               ON u.id = t.assignee_user_id
            WHERE t.tenant_id = $1
              AND t.project_id = $2
         ORDER BY t.updated_at DESC, t.created_at DESC
            LIMIT 250`,
          [tenantId, body.projectId]
        ),
        fastify.db.queryTenant<MeetingForGenerationRow>(
          tenantId,
          `SELECT mn.title,
                  mn.summary,
                  mn.created_at as "createdAt"
             FROM meeting_notes mn
            WHERE mn.tenant_id = $1
              AND mn.project_id = $2
         ORDER BY mn.created_at DESC
            LIMIT 12`,
          [tenantId, body.projectId]
        ),
      ]);

      const project = projectRows[0];
      if (!project) {
        throw fastify.httpErrors.notFound("Project not found.");
      }

      if (
        (body.templateType === "project_status" && body.format !== "docx") ||
        (body.templateType === "task_export" && body.format !== "xlsx") ||
        (body.templateType === "project_brief" && body.format !== "pptx")
      ) {
        throw fastify.httpErrors.badRequest(
          "Invalid format for template type. Use project_status=docx, task_export=xlsx, project_brief=pptx."
        );
      }

      const generatedAtIso = new Date().toISOString();
      const fileStem = `${safeFilePart(project.name)}-${safeFilePart(body.templateType)}`;
      const fileName = `${fileStem}.${body.format}`;

      let fileBuffer: Buffer;
      if (body.templateType === "project_status") {
        fileBuffer = await generateProjectStatusDocx({
          project,
          tasks: taskRows,
          meetings: meetingRows,
        });
      } else if (body.templateType === "task_export") {
        fileBuffer = await generateTaskExportXlsx({ tasks: taskRows });
      } else {
        const kpis = {
          totalTasks: taskRows.length,
          completedTasks: taskRows.filter((item) => item.status === "completed").length,
          blockedTasks: taskRows.filter((item) => item.status === "blocked").length,
          inProgressTasks: taskRows.filter((item) => item.status === "in_progress").length,
        };
        fileBuffer = await generateProjectBriefPptx({
          project,
          tasks: taskRows,
          kpis,
        });
      }

      const metadata = {
        generated: true,
        binaryEncoding: "base64",
        templateType: body.templateType,
        format: body.format,
        generatedAt: generatedAtIso,
        mimeType: MIME_TYPE_BY_FORMAT[body.format],
        fileName,
        byteLength: fileBuffer.byteLength,
      };

      const generatedRows = await fastify.db.queryTenant<DocumentListRow>(
        tenantId,
        `INSERT INTO documents
          (tenant_id, project_id, title, content, doc_type, source_kind, source_record_id, version, metadata, created_by_user_id)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, 1, $8::jsonb, $9)
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
          `${project.name} - ${body.templateType.replace(/_/g, " ")}`,
          fileBuffer.toString("base64"),
          body.format,
          "template_generation",
          null,
          JSON.stringify(metadata),
          actorUserId,
        ]
      );

      const document = generatedRows[0];

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "document.generate",
        objectType: "document",
        objectId: document.id,
        details: {
          projectId: body.projectId,
          templateType: body.templateType,
          format: body.format,
          byteLength: fileBuffer.byteLength,
        },
      });

      return reply.code(201).send({
        document,
        downloadUrl: `/v1/documents/${document.id}/download`,
      });
    }
  );

  fastify.get(
    "/:id/download",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = DownloadParamsSchema.parse(request.params ?? {});
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const rows = await fastify.db.queryTenant<DocumentListRow>(
        tenantId,
        `SELECT d.id,
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
           FROM documents d
          WHERE d.tenant_id = $1
            AND d.id = $2
          LIMIT 1`,
        [tenantId, params.id]
      );

      const document = rows[0];
      if (!document) {
        throw fastify.httpErrors.notFound("Document not found.");
      }

      if (document.projectId) {
        await assertProjectReadAccessOrThrow({
          tenantId,
          userId: actorUserId,
          tenantRole: request.user.role,
          projectId: document.projectId,
        });
      }

      const metadataRecord =
        document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
          ? (document.metadata as Record<string, unknown>)
          : {};
      const isBase64 = metadataRecord.binaryEncoding === "base64";

      if (!isBase64) {
        throw fastify.httpErrors.conflict(
          "This document was not generated as a binary asset and cannot be downloaded as a file."
        );
      }

      let binary: Buffer;
      try {
        binary = Buffer.from(document.content, "base64");
      } catch {
        throw fastify.httpErrors.unprocessableEntity("Document content could not be decoded.");
      }

      const SAFE_MIME_TYPES = new Set(Object.values(MIME_TYPE_BY_FORMAT));
      SAFE_MIME_TYPES.add("application/octet-stream");

      const rawMime =
        typeof metadataRecord.mimeType === "string" ? metadataRecord.mimeType : "";
      const mimeType = SAFE_MIME_TYPES.has(rawMime)
        ? rawMime
        : MIME_TYPE_BY_FORMAT[document.docType] ?? "application/octet-stream";
      const fileNameRaw =
        typeof metadataRecord.fileName === "string" && metadataRecord.fileName.length > 0
          ? metadataRecord.fileName
          : `${safeFilePart(document.title || "document")}.${document.docType || "bin"}`;
      const fileName = fileNameRaw.replace(/[^a-zA-Z0-9._-]/g, "_");

      reply.header("Content-Type", mimeType);
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(binary);
    }
  );

  // PATCH /v1/documents/:id/move
  fastify.patch(
    "/:id/move",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.body);
      const tenantId = request.user.tenantId;

      const docRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM documents WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!docRows[0]) throw fastify.httpErrors.notFound("Document not found.");

      const folderRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, folderId]
      );
      if (!folderRows[0]) throw fastify.httpErrors.notFound("Target folder not found.");

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE documents SET folder_id = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, folderId]
      );

      return { ok: true };
    }
  );
};
