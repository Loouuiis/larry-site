import type { Db } from "@larry/db";

export type ProjectMembershipRole = "owner" | "editor" | "viewer";

export interface ProjectMemberRecord {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  projectRole: ProjectMembershipRole;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMembershipAccess {
  projectExists: boolean;
  projectRole: ProjectMembershipRole | null;
  canRead: boolean;
  canManage: boolean;
}

export async function projectExists(db: Db, tenantId: string, projectId: string): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `SELECT id
       FROM projects
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1`,
    [tenantId, projectId]
  );
  return Boolean(rows[0]);
}

export async function getProjectMembershipRole(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string
): Promise<ProjectMembershipRole | null> {
  const rows = await db.queryTenant<{ role: ProjectMembershipRole }>(
    tenantId,
    `SELECT role
       FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3
      LIMIT 1`,
    [tenantId, projectId, userId]
  );
  return rows[0]?.role ?? null;
}

export async function getProjectMembershipAccess(input: {
  db: Db;
  tenantId: string;
  projectId: string;
  userId: string;
  tenantRole: string;
}): Promise<ProjectMembershipAccess> {
  const [exists, projectRole] = await Promise.all([
    projectExists(input.db, input.tenantId, input.projectId),
    getProjectMembershipRole(input.db, input.tenantId, input.projectId, input.userId),
  ]);

  const isAdmin = input.tenantRole === "admin";
  const canRead = exists && (isAdmin || projectRole !== null);
  const canManage = exists && (isAdmin || projectRole === "owner" || projectRole === "editor");

  return {
    projectExists: exists,
    projectRole,
    canRead,
    canManage,
  };
}

export async function listProjectMembers(
  db: Db,
  tenantId: string,
  projectId: string
): Promise<ProjectMemberRecord[]> {
  return db.queryTenant<ProjectMemberRecord>(
    tenantId,
    `SELECT pm.user_id AS "userId",
            COALESCE(NULLIF(u.display_name, ''), SPLIT_PART(u.email, '@', 1)) AS "name",
            u.email,
            m.role AS "tenantRole",
            pm.role AS "projectRole",
            pm.created_at::text AS "createdAt",
            pm.updated_at::text AS "updatedAt"
       FROM project_memberships pm
       JOIN users u
         ON u.id = pm.user_id
       JOIN memberships m
         ON m.tenant_id = pm.tenant_id
        AND m.user_id = pm.user_id
      WHERE pm.tenant_id = $1
        AND pm.project_id = $2
      ORDER BY
        CASE pm.role
          WHEN 'owner' THEN 0
          WHEN 'editor' THEN 1
          ELSE 2
        END,
        "name" ASC`,
    [tenantId, projectId]
  );
}

export async function hasTenantMembership(
  db: Db,
  tenantId: string,
  userId: string
): Promise<boolean> {
  const rows = await db.queryTenant<{ user_id: string }>(
    tenantId,
    `SELECT user_id
       FROM memberships
      WHERE tenant_id = $1
        AND user_id = $2
      LIMIT 1`,
    [tenantId, userId]
  );
  return Boolean(rows[0]);
}

export async function upsertProjectMembership(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
  role: ProjectMembershipRole
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, project_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
    [tenantId, projectId, userId, role]
  );
}

export async function deleteProjectMembership(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string
): Promise<boolean> {
  const rows = await db.queryTenant<{ user_id: string }>(
    tenantId,
    `DELETE FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3
      RETURNING user_id`,
    [tenantId, projectId, userId]
  );
  return Boolean(rows[0]);
}

export async function countProjectOwners(
  db: Db,
  tenantId: string,
  projectId: string
): Promise<number> {
  const rows = await db.queryTenant<{ owner_count: string | number }>(
    tenantId,
    `SELECT COUNT(*)::int AS owner_count
       FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND role = 'owner'`,
    [tenantId, projectId]
  );
  const value = rows[0]?.owner_count;
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function createProjectOwnerMembership(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string
): Promise<void> {
  await upsertProjectMembership(db, tenantId, projectId, userId, "owner");
}
