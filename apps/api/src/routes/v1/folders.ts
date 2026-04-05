import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const ListFoldersQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().optional(),
  folderType: z.enum(["company", "general"]).default("company"),
  projectId: z.string().uuid().optional(),
});

const RenameFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const MoveFolderSchema = z.object({
  newParentId: z.string().uuid().nullable(),
});

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

type FolderRow = {
  id: string;
  tenantId: string;
  projectId: string | null;
  parentId: string | null;
  name: string;
  folderType: string;
  depth: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const folderRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/folders?parentId=
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const query = ListFoldersQuerySchema.parse(request.query ?? {});
      const tenantId = request.user.tenantId;

      let sql: string;
      let values: unknown[];

      if (query.parentId) {
        sql = `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                      parent_id AS "parentId", name, folder_type AS "folderType",
                      depth, sort_order AS "sortOrder",
                      created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM folders
                WHERE tenant_id = $1 AND parent_id = $2
                ORDER BY sort_order, name`;
        values = [tenantId, query.parentId];
      } else {
        sql = `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                      parent_id AS "parentId", name, folder_type AS "folderType",
                      depth, sort_order AS "sortOrder",
                      created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM folders
                WHERE tenant_id = $1 AND parent_id IS NULL
                ORDER BY sort_order, name`;
        values = [tenantId];
      }

      const folders = await fastify.db.queryTenant<FolderRow>(tenantId, sql, values);
      return { folders };
    }
  );

  // GET /v1/folders/:id — single folder + breadcrumb ancestors
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                parent_id AS "parentId", name, folder_type AS "folderType",
                depth, sort_order AS "sortOrder",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );

      if (!rows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      // Build breadcrumb by walking parent chain (max 5 levels)
      const breadcrumb: { id: string; name: string }[] = [];
      let current: FolderRow | undefined = rows[0];
      const visited = new Set<string>();

      while (current) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        breadcrumb.unshift({ id: current.id, name: current.name });

        if (!current.parentId) break;
        const parentRows = await fastify.db.queryTenant<FolderRow>(
          tenantId,
          `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                  parent_id AS "parentId", name, folder_type AS "folderType",
                  depth, sort_order AS "sortOrder",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, current.parentId]
        );
        current = parentRows[0];
      }

      return { folder: rows[0], breadcrumb };
    }
  );

  // POST /v1/folders
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = CreateFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      let depth = 0;
      if (body.parentId) {
        const parentRows = await fastify.db.queryTenant<{ depth: number }>(
          tenantId,
          `SELECT depth FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, body.parentId]
        );
        if (!parentRows[0]) throw fastify.httpErrors.notFound("Parent folder not found.");
        depth = parentRows[0].depth + 1;
        if (depth > 4) {
          throw fastify.httpErrors.badRequest("Maximum folder nesting depth (5 levels) exceeded.");
        }
      }

      const rows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `INSERT INTO folders (tenant_id, project_id, parent_id, name, folder_type, depth, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tenant_id AS "tenantId", project_id AS "projectId",
                   parent_id AS "parentId", name, folder_type AS "folderType",
                   depth, sort_order AS "sortOrder",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, body.projectId ?? null, body.parentId ?? null, body.name, body.folderType, depth, request.user.userId]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "folder.create",
        objectType: "folder",
        objectId: rows[0].id,
        details: { name: body.name, folderType: body.folderType, parentId: body.parentId ?? null },
      });

      return reply.code(201).send({ folder: rows[0] });
    }
  );

  // PATCH /v1/folders/:id — rename
  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = RenameFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const existing = await fastify.db.queryTenant<{ id: string; folderType: string }>(
        tenantId,
        `SELECT id, folder_type AS "folderType" FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!existing[0]) throw fastify.httpErrors.notFound("Folder not found.");

      const rows = await fastify.db.queryTenant<{ id: string; name: string }>(
        tenantId,
        `UPDATE folders SET name = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2
         RETURNING id, name`,
        [tenantId, id, body.name]
      );

      return { folder: rows[0] };
    }
  );

  // PATCH /v1/folders/:id/move
  fastify.patch(
    "/:id/move",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = MoveFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const folderRows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                parent_id AS "parentId", name, folder_type AS "folderType",
                depth, sort_order AS "sortOrder",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!folderRows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      if (folderRows[0].folderType === "general" || (folderRows[0].folderType === "project" && folderRows[0].parentId === null)) {
        throw fastify.httpErrors.forbidden("Cannot move root-level project or General folders.");
      }

      let newDepth = 0;
      if (body.newParentId) {
        if (body.newParentId === id) {
          throw fastify.httpErrors.badRequest("Cannot move a folder into itself.");
        }

        const parentRows = await fastify.db.queryTenant<{ depth: number; id: string }>(
          tenantId,
          `SELECT depth, id FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, body.newParentId]
        );
        if (!parentRows[0]) throw fastify.httpErrors.notFound("Target folder not found.");
        newDepth = parentRows[0].depth + 1;

        const descendantRows = await fastify.db.queryTenant<{ maxDepth: number }>(
          tenantId,
          `WITH RECURSIVE tree AS (
             SELECT id, depth FROM folders WHERE tenant_id = $1 AND id = $2
             UNION ALL
             SELECT f.id, f.depth FROM folders f JOIN tree t ON f.parent_id = t.id WHERE f.tenant_id = $1
           )
           SELECT COALESCE(MAX(depth) - MIN(depth), 0) AS "maxDepth" FROM tree`,
          [tenantId, id]
        );
        const subtreeHeight = descendantRows[0]?.maxDepth ?? 0;
        if (newDepth + subtreeHeight > 4) {
          throw fastify.httpErrors.badRequest("Moving this folder here would exceed the maximum nesting depth (5 levels).");
        }
      }

      const depthDiff = newDepth - folderRows[0].depth;

      await fastify.db.queryTenant(
        tenantId,
        `WITH RECURSIVE tree AS (
           SELECT id FROM folders WHERE tenant_id = $1 AND id = $2
           UNION ALL
           SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id WHERE f.tenant_id = $1
         )
         UPDATE folders SET depth = depth + $3, updated_at = NOW()
         WHERE id IN (SELECT id FROM tree)`,
        [tenantId, id, depthDiff]
      );

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE folders SET parent_id = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, body.newParentId]
      );

      return { ok: true };
    }
  );

  // DELETE /v1/folders/:id
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{ id: string; folderType: string; parentId: string | null }>(
        tenantId,
        `SELECT id, folder_type AS "folderType", parent_id AS "parentId"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!rows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      if (rows[0].folderType === "general") {
        throw fastify.httpErrors.forbidden("Cannot delete the General folder.");
      }
      if (rows[0].folderType === "project" && rows[0].parentId === null) {
        throw fastify.httpErrors.forbidden("Cannot delete a project root folder.");
      }

      await fastify.db.queryTenant(
        tenantId,
        `DELETE FROM folders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "folder.delete",
        objectType: "folder",
        objectId: id,
        details: {},
      });

      return reply.code(204).send();
    }
  );

  // GET /v1/folders/:id/contents — subfolders + documents in this folder
  fastify.get(
    "/:id/contents",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const [subfolders, documents, larryDocs] = await Promise.all([
        fastify.db.queryTenant<FolderRow>(
          tenantId,
          `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                  parent_id AS "parentId", name, folder_type AS "folderType",
                  depth, sort_order AS "sortOrder",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM folders WHERE tenant_id = $1 AND parent_id = $2
             ORDER BY sort_order, name`,
          [tenantId, id]
        ),
        fastify.db.queryTenant(
          tenantId,
          `SELECT id, project_id AS "projectId", title, doc_type AS "docType",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM documents WHERE tenant_id = $1 AND folder_id = $2
             ORDER BY updated_at DESC`,
          [tenantId, id]
        ),
        fastify.db.queryTenant(
          tenantId,
          `SELECT id, project_id AS "projectId", title, doc_type AS "docType",
                  state, created_at AS "createdAt", updated_at AS "updatedAt"
             FROM larry_documents WHERE tenant_id = $1 AND folder_id = $2
             ORDER BY updated_at DESC`,
          [tenantId, id]
        ),
      ]);

      return { subfolders, documents, larryDocuments: larryDocs };
    }
  );
};
