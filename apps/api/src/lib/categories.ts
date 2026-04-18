import type { Db } from "@larry/db";
import type { ProjectCategory } from "@larry/shared";

const SELECT_COLS = `
  id,
  tenant_id           AS "tenantId",
  name,
  colour,
  sort_order          AS "sortOrder",
  parent_category_id  AS "parentCategoryId",
  project_id          AS "projectId",
  created_at          AS "createdAt",
  updated_at          AS "updatedAt"
`;

export async function listCategoriesForTenant(
  db: Db, tenantId: string
): Promise<ProjectCategory[]> {
  const sql = `SELECT ${SELECT_COLS} FROM project_categories
               WHERE tenant_id = $1
               ORDER BY sort_order ASC, created_at ASC`;
  return db.queryTenant<ProjectCategory>(tenantId, sql, [tenantId]);
}

export async function insertCategory(
  db: Db, tenantId: string,
  input: {
    name: string;
    colour: string | null;
    sortOrder: number;
    parentCategoryId?: string | null;
    projectId?: string | null;
  }
): Promise<ProjectCategory> {
  if (input.parentCategoryId && input.projectId) {
    throw new Error(
      "insertCategory: exactly one of parentCategoryId or projectId may be non-null.",
    );
  }
  const sql = `INSERT INTO project_categories
               (tenant_id, name, colour, sort_order, parent_category_id, project_id)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId,
    input.name,
    input.colour,
    input.sortOrder,
    input.parentCategoryId ?? null,
    input.projectId ?? null,
  ]);
  if (!rows[0]) throw new Error("insertCategory: INSERT returned no rows");
  return rows[0];
}

export async function updateCategory(
  db: Db, tenantId: string, id: string,
  patch: {
    name?: string;
    colour?: string | null;
    sortOrder?: number;
    parentCategoryId?: string | null;
    projectId?: string | null;
  }
): Promise<ProjectCategory | null> {
  if (patch.parentCategoryId && patch.projectId) {
    throw new Error(
      "updateCategory: exactly one of parentCategoryId or projectId may be non-null.",
    );
  }
  // Explicit-null support for colour/parentCategoryId/projectId: boolean flag
  // says "caller supplied this field", value carries null | new value.
  const sql = `UPDATE project_categories
               SET name                = COALESCE($3, name),
                   colour              = CASE WHEN $4::boolean THEN $5                  ELSE colour             END,
                   sort_order          = COALESCE($6, sort_order),
                   parent_category_id  = CASE WHEN $7::boolean THEN $8::uuid            ELSE parent_category_id END,
                   project_id          = CASE WHEN $9::boolean THEN $10::uuid           ELSE project_id         END,
                   updated_at          = NOW()
               WHERE tenant_id = $1 AND id = $2
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId, id,
    patch.name ?? null,
    patch.colour !== undefined,
    patch.colour ?? null,
    patch.sortOrder ?? null,
    patch.parentCategoryId !== undefined,
    patch.parentCategoryId ?? null,
    patch.projectId !== undefined,
    patch.projectId ?? null,
  ]);
  return rows[0] ?? null;
}

export async function deleteCategory(
  db: Db, tenantId: string, id: string
): Promise<void> {
  const sql = `DELETE FROM project_categories WHERE tenant_id = $1 AND id = $2`;
  await db.queryTenant(tenantId, sql, [tenantId, id]);
}

export async function reorderCategories(
  db: Db, tenantId: string, orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const cases = orderedIds.map((_, i) => `WHEN $${i + 2}::uuid THEN ${i}`).join(" ");
  const sql = `UPDATE project_categories
               SET sort_order = CASE id ${cases} ELSE sort_order END,
                   updated_at = NOW()
               WHERE tenant_id = $1
                 AND id IN (${orderedIds.map((_, i) => `$${i + 2}::uuid`).join(",")})`;
  await db.queryTenant(tenantId, sql, [tenantId, ...orderedIds]);
}
