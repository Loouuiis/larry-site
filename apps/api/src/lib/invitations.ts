import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { Db } from "@larry/db";
import type { InvitableTenantRole } from "./permissions.js";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationRow {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  status: InvitationStatus;
  invitedByUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: InvitableTenantRole;
  invitedByUserId: string;
  expiresInDays?: number;
}

export interface CreateInvitationResult {
  invitation: InvitationRow;
  rawToken: string;
}

const SELECT_COLUMNS = `
  id,
  tenant_id          AS "tenantId",
  email,
  role,
  status,
  invited_by_user_id AS "invitedByUserId",
  expires_at::text   AS "expiresAt",
  accepted_at::text  AS "acceptedAt",
  accepted_by_user_id AS "acceptedByUserId",
  revoked_at::text   AS "revokedAt",
  created_at::text   AS "createdAt"
`;

export async function createInvitation(
  db: Db,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const days = input.expiresInDays ?? 7;
  const rows = await db.queryTenant<InvitationRow>(
    input.tenantId,
    `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by_user_id, expires_at)
     VALUES ($1, lower($2), $3::role_type, $4, $5, NOW() + ($6 || ' days')::interval)
     RETURNING ${SELECT_COLUMNS}`,
    [input.tenantId, input.email, input.role, tokenHash, input.invitedByUserId, String(days)],
  );
  return { invitation: rows[0], rawToken };
}

export async function findPendingInvitationByToken(
  db: Db,
  rawToken: string,
): Promise<InvitationRow | null> {
  const tokenHash = hashInvitationToken(rawToken);
  const rows = await db.query<InvitationRow>(
    `SELECT ${SELECT_COLUMNS} FROM invitations WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export function isInvitationConsumable(inv: InvitationRow): boolean {
  if (inv.status !== "pending") return false;
  return new Date(inv.expiresAt).getTime() > Date.now();
}

/**
 * Single-use mark. Returns true if this call flipped pending → accepted;
 * false if another request consumed it first (concurrent race).
 */
export async function markInvitationAccepted(
  client: PoolClient,
  invitationId: string,
  acceptedByUserId: string,
): Promise<boolean> {
  const res = await client.query(
    `UPDATE invitations
        SET status = 'accepted',
            accepted_at = NOW(),
            accepted_by_user_id = $2,
            updated_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [invitationId, acceptedByUserId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function revokeInvitation(
  db: Db,
  tenantId: string,
  invitationId: string,
  actorUserId: string,
): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `UPDATE invitations
        SET status = 'revoked',
            revoked_at = NOW(),
            revoked_by_user_id = $3,
            updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [tenantId, invitationId, actorUserId],
  );
  return rows.length > 0;
}

export async function listInvitations(
  db: Db,
  tenantId: string,
  status?: InvitationStatus,
): Promise<InvitationRow[]> {
  if (status) {
    return db.queryTenant<InvitationRow>(
      tenantId,
      `SELECT ${SELECT_COLUMNS} FROM invitations
        WHERE tenant_id = $1 AND status = $2
        ORDER BY created_at DESC`,
      [tenantId, status],
    );
  }
  return db.queryTenant<InvitationRow>(
    tenantId,
    `SELECT ${SELECT_COLUMNS} FROM invitations
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId],
  );
}
