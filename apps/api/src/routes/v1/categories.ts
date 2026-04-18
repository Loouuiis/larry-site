import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listCategoriesForTenant, insertCategory, updateCategory,
  deleteCategory, reorderCategories,
} from "../../lib/categories.js";

const SINGLE_PARENT_MSG =
  "A category may have parentCategoryId or projectId set, but not both (exactly one or neither).";

const CreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    colour: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    parentCategoryId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !(v.parentCategoryId && v.projectId), { message: SINGLE_PARENT_MSG });

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    colour: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    parentCategoryId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !(v.parentCategoryId && v.projectId), { message: SINGLE_PARENT_MSG });

const IdSchema = z.object({ id: z.string().uuid() });
const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const categoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    const categories = await listCategoriesForTenant(fastify.db, request.user.tenantId);
    return { categories };
  });

  fastify.post("/", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw fastify.httpErrors.badRequest(parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }
    const body = parsed.data;
    const category = await insertCategory(fastify.db, request.user.tenantId, {
      name: body.name,
      colour: body.colour ?? null,
      sortOrder: body.sortOrder ?? 0,
      parentCategoryId: body.parentCategoryId ?? null,
      projectId: body.projectId ?? null,
    });
    reply.code(201);
    return { category };
  });

  fastify.patch("/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const params = IdSchema.safeParse(request.params);
    if (!params.success) {
      throw fastify.httpErrors.badRequest(params.error.issues[0]?.message ?? "Invalid params.");
    }
    const patch = UpdateSchema.safeParse(request.body);
    if (!patch.success) {
      throw fastify.httpErrors.badRequest(patch.error.issues[0]?.message ?? "Invalid request payload.");
    }
    const category = await updateCategory(fastify.db, request.user.tenantId, params.data.id, patch.data);
    if (!category) throw fastify.httpErrors.notFound("Category not found");
    return { category };
  });

  fastify.delete("/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = IdSchema.safeParse(request.params);
    if (!params.success) {
      throw fastify.httpErrors.badRequest(params.error.issues[0]?.message ?? "Invalid params.");
    }
    await deleteCategory(fastify.db, request.user.tenantId, params.data.id);
    reply.code(204);
    return null;
  });

  fastify.post("/reorder", { preHandler: [fastify.authenticate] }, async (request) => {
    const parsed = ReorderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw fastify.httpErrors.badRequest(parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }
    await reorderCategories(fastify.db, request.user.tenantId, parsed.data.ids);
    return { ok: true };
  });
};
