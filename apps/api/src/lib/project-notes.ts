import type { Db } from "@larry/db";

export type ProjectNoteVisibility = "shared" | "personal";

export interface ProjectNoteRecord {
  id: string;
  projectId: string;
  authorUserId: string;
  authorName: string;
  visibility: ProjectNoteVisibility;
  recipientUserId: string | null;
  recipientName: string | null;
  content: string;
  sourceKind: string | null;
  sourceRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectNoteInput {
  projectId: string;
  authorUserId: string;
  visibility: ProjectNoteVisibility;
  recipientUserId?: string | null;
  content: string;
  sourceKind?: string | null;
  sourceRecordId?: string | null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function isProjectCollaborator(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string
): Promise<boolean> {
  const rows = await db.queryTenant<{ user_id: string }>(
    tenantId,
    `SELECT user_id
       FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3
      LIMIT 1`,
    [tenantId, projectId, userId]
  );
  return Boolean(rows[0]?.user_id);
}

export async function listProjectNotesForUser(
  db: Db,
  tenantId: string,
  projectId: string,
  actorUserId: string,
  options?: { visibility?: "all" | ProjectNoteVisibility; limit?: number }
): Promise<ProjectNoteRecord[]> {
  const visibility = options?.visibility ?? "all";
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const params: unknown[] = [tenantId, projectId, actorUserId];
  const filters = [
    "pn.tenant_id = $1",
    "pn.project_id = $2",
    `(pn.visibility = 'shared' OR (pn.visibility = 'personal' AND (pn.author_user_id = $3 OR pn.recipient_user_id = $3)))`,
  ];

  if (visibility === "shared") {
    filters.push("pn.visibility = 'shared'");
  } else if (visibility === "personal") {
    filters.push("pn.visibility = 'personal'");
  }

  params.push(limit);

  return db.queryTenant<ProjectNoteRecord>(
    tenantId,
    `SELECT pn.id,
            pn.project_id AS "projectId",
            pn.author_user_id AS "authorUserId",
            COALESCE(NULLIF(author_u.display_name, ''), SPLIT_PART(author_u.email, '@', 1)) AS "authorName",
            pn.visibility::text AS visibility,
            pn.recipient_user_id AS "recipientUserId",
            COALESCE(NULLIF(recipient_u.display_name, ''), SPLIT_PART(recipient_u.email, '@', 1)) AS "recipientName",
            pn.content,
            pn.source_kind AS "sourceKind",
            pn.source_record_id AS "sourceRecordId",
            pn.created_at::text AS "createdAt",
            pn.updated_at::text AS "updatedAt"
       FROM project_notes pn
       JOIN users author_u
         ON author_u.id = pn.author_user_id
       LEFT JOIN users recipient_u
         ON recipient_u.id = pn.recipient_user_id
      WHERE ${filters.join("\n        AND ")}
      ORDER BY pn.created_at DESC
      LIMIT $4`,
    params
  );
}

export async function createProjectNote(
  db: Db,
  tenantId: string,
  input: CreateProjectNoteInput
): Promise<ProjectNoteRecord> {
  const recipientUserId = input.visibility === "personal"
    ? normalizeOptionalText(input.recipientUserId) ?? null
    : null;
  const sourceKind = normalizeOptionalText(input.sourceKind);
  const sourceRecordId = normalizeOptionalText(input.sourceRecordId);

  const rows = await db.queryTenant<ProjectNoteRecord>(
    tenantId,
    `WITH inserted AS (
       INSERT INTO project_notes (
         tenant_id,
         project_id,
         author_user_id,
         visibility,
         recipient_user_id,
         content,
         source_kind,
         source_record_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id,
                 project_id,
                 author_user_id,
                 visibility::text AS visibility,
                 recipient_user_id,
                 content,
                 source_kind,
                 source_record_id,
                 created_at::text AS created_at,
                 updated_at::text AS updated_at
     )
     SELECT i.id,
            i.project_id AS "projectId",
            i.author_user_id AS "authorUserId",
            COALESCE(NULLIF(author_u.display_name, ''), SPLIT_PART(author_u.email, '@', 1)) AS "authorName",
            i.visibility::text AS visibility,
            i.recipient_user_id AS "recipientUserId",
            COALESCE(NULLIF(recipient_u.display_name, ''), SPLIT_PART(recipient_u.email, '@', 1)) AS "recipientName",
            i.content,
            i.source_kind AS "sourceKind",
            i.source_record_id AS "sourceRecordId",
            i.created_at AS "createdAt",
            i.updated_at AS "updatedAt"
       FROM inserted i
       JOIN users author_u
         ON author_u.id = i.author_user_id
       LEFT JOIN users recipient_u
         ON recipient_u.id = i.recipient_user_id`,
    [
      tenantId,
      input.projectId,
      input.authorUserId,
      input.visibility,
      recipientUserId,
      input.content,
      sourceKind,
      sourceRecordId,
    ]
  );

  const note = rows[0];
  if (!note) {
    throw new Error("Failed to create project note.");
  }

  return note;
}
