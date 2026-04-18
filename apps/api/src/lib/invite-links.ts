import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { Db } from "@larry/db";
import type { InvitableTenantRole } from "./permissions.js";
import type { ProjectInvitationRole } from "./invitations.js";

export function generateInviteLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface InviteLinkRow {
  id: string;
  tenantId: string;
  createdByUserId: string | null;
  defaultRole: InvitableTenantRole;
  defaultProjectId: string | null;
  defaultProjectRole: ProjectInvitationRole | null;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const SELECT_COLUMNS = `
  id,
  tenant_id              AS "tenantId",
  created_by_user_id     AS "createdByUserId",
  default_role           AS "defaultRole",
  default_project_id     AS "defaultProjectId",
  default_project_role   AS "defaultProjectRole",
  max_uses               AS "maxUses",
  uses_count             AS "usesCount",
  expires_at::text       AS "expiresAt",
  revoked_at::text       AS "revokedAt",
  created_at::text       AS "createdAt"
`;

export interface CreateInviteLinkInput {
  tenantId: string;
  createdByUserId: string;
  defaultRole: InvitableTenantRole;
  defaultProjectId?: string | null;
  defaultProjectRole?: ProjectInvitationRole | null;
  maxUses?: number | null;
  expiresInDays?: number | null;
}

export interface CreateInviteLinkResult {
  link: InviteLinkRow;
  rawToken: string;
}

export async function createInviteLink(
  db: Db,
  input: CreateInviteLinkInput,
): Promise<CreateInviteLinkResult> {
  const rawToken = generateInviteLinkToken();
  const tokenHash = hashInviteLinkToken(rawToken);
  const projectId = input.defaultProjectId ?? null;
  const projectRole = input.defaultProjectRole ?? null;
  if ((projectId === null) !== (projectRole === null)) {
    throw new Error("defaultProjectId and defaultProjectRole must be provided together.");
  }
  const maxUses = input.maxUses ?? null;
  if (maxUses !== null && maxUses <= 0) {
    throw new Error("maxUses must be a positive integer.");
  }
  const expiresInDays = input.expiresInDays ?? null;
  if (expiresInDays !== null && expiresInDays <= 0) {
    throw new Error("expiresInDays must be a positive integer.");
  }

  const rows = await db.queryTenant<InviteLinkRow>(
    input.tenantId,
    `INSERT INTO invite_links (
       tenant_id, token_hash, created_by_user_id,
       default_role, default_project_id, default_project_role,
       max_uses, expires_at
     )
     VALUES (
       $1, $2, $3,
       $4::role_type, $5, $6,
       $7,
       CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + ($8::int || ' days')::interval END
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.tenantId,
      tokenHash,
      input.createdByUserId,
      input.defaultRole,
      projectId,
      projectRole,
      maxUses,
      expiresInDays,
    ],
  );
  return { link: rows[0], rawToken };
}

export async function findInviteLinkByToken(
  db: Db,
  rawToken: string,
): Promise<InviteLinkRow | null> {
  const tokenHash = hashInviteLinkToken(rawToken);
  const rows = await db.query<InviteLinkRow>(
    `SELECT ${SELECT_COLUMNS} FROM invite_links WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export type InviteLinkUsability =
  | { ok: true }
  | { ok: false; code: "revoked" | "expired" | "exhausted" };

export function assessInviteLink(link: InviteLinkRow): InviteLinkUsability {
  if (link.revokedAt) return { ok: false, code: "revoked" };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return { ok: false, code: "expired" };
  }
  if (link.maxUses !== null && link.usesCount >= link.maxUses) {
    return { ok: false, code: "exhausted" };
  }
  return { ok: true };
}

export async function listInviteLinks(db: Db, tenantId: string): Promise<InviteLinkRow[]> {
  return db.queryTenant<InviteLinkRow>(
    tenantId,
    `SELECT ${SELECT_COLUMNS}
       FROM invite_links
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId],
  );
}

export async function revokeInviteLink(
  db: Db,
  tenantId: string,
  linkId: string,
  actorUserId: string,
): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `UPDATE invite_links
        SET revoked_at = NOW(),
            revoked_by_user_id = $3,
            updated_at = NOW()
      WHERE tenant_id = $1
        AND id = $2
        AND revoked_at IS NULL
      RETURNING id`,
    [tenantId, linkId, actorUserId],
  );
  return rows.length > 0;
}

/**
 * Atomically reserve a seat on the link. Returns the row if reservation
 * succeeded (and counts as a use), null if the link is no longer usable
 * (revoked, expired, or exhausted) at the instant of the UPDATE. This is
 * the single source of truth for "can this redemption proceed" — all guards
 * are enforced by the WHERE clause to avoid TOCTOU races.
 */
export async function reserveInviteLinkUse(
  client: PoolClient,
  rawToken: string,
): Promise<InviteLinkRow | null> {
  const tokenHash = hashInviteLinkToken(rawToken);
  const res = await client.query<InviteLinkRow>(
    `UPDATE invite_links
        SET uses_count = uses_count + 1,
            updated_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses_count < max_uses)
      RETURNING ${SELECT_COLUMNS}`,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}
