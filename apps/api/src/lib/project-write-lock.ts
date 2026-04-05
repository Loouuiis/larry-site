import type { Db } from "@larry/db";
import {
  ARCHIVED_PROJECT_STATUS,
  normalizeProjectStatus,
  projectStatusSql,
  type ProjectStatus,
} from "./project-status.js";

export const ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE =
  "Archived projects are read-only. Unarchive the project before making changes.";

export interface ProjectWriteState {
  projectId: string;
  name: string;
  status: ProjectStatus;
  ownerUserId: string | null;
}

export interface TaskProjectWriteState {
  taskId: string;
  projectId: string;
  projectStatus: ProjectStatus;
}

export function isProjectWriteLocked(status: string | null | undefined): boolean {
  return normalizeProjectStatus(status) === ARCHIVED_PROJECT_STATUS;
}

export async function loadProjectWriteState(
  db: Db,
  tenantId: string,
  projectId: string
): Promise<ProjectWriteState | null> {
  const rows = await db.queryTenant<{ id: string; name: string; status: string; owner_user_id: string | null }>(
    tenantId,
    `SELECT id,
            name,
            owner_user_id,
            ${projectStatusSql("status")} as status
       FROM projects
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1`,
    [tenantId, projectId]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    projectId: row.id,
    name: row.name,
    status: normalizeProjectStatus(row.status),
    ownerUserId: row.owner_user_id,
  };
}

export async function loadTaskProjectWriteState(
  db: Db,
  tenantId: string,
  taskId: string
): Promise<TaskProjectWriteState | null> {
  const rows = await db.queryTenant<{ taskId: string; projectId: string; projectStatus: string }>(
    tenantId,
    `SELECT tasks.id as "taskId",
            tasks.project_id as "projectId",
            ${projectStatusSql("projects.status")} as "projectStatus"
       FROM tasks
       JOIN projects
         ON projects.tenant_id = tasks.tenant_id
        AND projects.id = tasks.project_id
      WHERE tasks.tenant_id = $1
        AND tasks.id = $2
      LIMIT 1`,
    [tenantId, taskId]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    taskId: row.taskId,
    projectId: row.projectId,
    projectStatus: normalizeProjectStatus(row.projectStatus),
  };
}
