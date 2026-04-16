import type { Db } from "@larry/db";
import type { ProjectCategory } from "@larry/shared";

const SELECT_COLS = `
  id,
  tenant_id    AS "tenantId",
  name,
  colour,
  sort_order   AS "sortOrder",
  created_at   AS "createdAt",
  updated_at   AS "updatedAt"
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
  input: { name: string; colour: string | null; sortOrder: number }
): Promise<ProjectCategory> {
  const sql = `INSERT INTO project_categories (tenant_id, name, colour, sort_order)
               VALUES ($1, $2, $3, $4)
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId, input.name, input.colour, input.sortOrder,
  ]);
  if (!rows[0]) throw new Error("insertCategory: INSERT returned no rows");
  return rows[0];
}

export async function updateCategory(
  db: Db, tenantId: string, id: string,
  patch: { name?: string; colour?: string | null; sortOrder?: number }
): Promise<ProjectCategory | null> {
  const sql = `UPDATE project_categories
               SET name       = COALESCE($3, name),
                   colour     = CASE WHEN $4::boolean THEN $5 ELSE colour END,
                   sort_order = COALESCE($6, sort_order),
                   updated_at = NOW()
               WHERE tenant_id = $1 AND id = $2
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId, id,
    patch.name ?? null,
    patch.colour !== undefined,
    patch.colour ?? null,
    patch.sortOrder ?? null,
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
