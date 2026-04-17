import { randomBytes } from "node:crypto";
import type { Db } from "@larry/db";

export type TenantDomainMode = "auto_join" | "invite_only" | "blocked";

export interface TenantDomainRow {
  id: string;
  tenantId: string;
  domain: string;
  mode: TenantDomainMode;
  defaultRole: string;
  verifiedAt: string | null;
  verificationToken: string | null;
  createdAt: string;
}

const COLS = `
  id,
  tenant_id           AS "tenantId",
  lower(domain)       AS domain,
  mode,
  default_role        AS "defaultRole",
  verified_at::text   AS "verifiedAt",
  verification_token  AS "verificationToken",
  created_at::text    AS "createdAt"
`;

export async function addTenantDomain(
  db: Db,
  tenantId: string,
  domain: string,
  mode: TenantDomainMode,
  defaultRole = "member",
): Promise<TenantDomainRow> {
  const token = "larry-verify-" + randomBytes(16).toString("hex");
  const rows = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `INSERT INTO tenant_domains (tenant_id, domain, mode, default_role, verification_token)
     VALUES ($1, lower($2), $3, $4::role_type, $5)
     RETURNING ${COLS}`,
    [tenantId, domain, mode, defaultRole, token],
  );
  return rows[0];
}

export async function listTenantDomains(db: Db, tenantId: string): Promise<TenantDomainRow[]> {
  return db.queryTenant<TenantDomainRow>(
    tenantId,
    `SELECT ${COLS} FROM tenant_domains WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
}

export async function deleteTenantDomain(
  db: Db,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `DELETE FROM tenant_domains WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, id],
  );
  return rows.length > 0;
}

export async function verifyTenantDomain(
  db: Db,
  tenantId: string,
  id: string,
  txtRecords: string[],
): Promise<TenantDomainRow | null> {
  const rows = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `SELECT ${COLS} FROM tenant_domains WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id],
  );
  const d = rows[0];
  if (!d || !d.verificationToken) return null;
  const expected = `_larry-verify=${d.verificationToken}`;
  const match = txtRecords.some((r) => r.trim() === expected);
  if (!match) return null;
  const upd = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `UPDATE tenant_domains SET verified_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING ${COLS}`,
    [tenantId, id],
  );
  return upd[0] ?? null;
}

export async function findAutoJoinTenantForEmail(
  db: Db,
  email: string,
): Promise<{ tenantId: string; defaultRole: string } | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const rows = await db.query<{ tenant_id: string; default_role: string }>(
    `SELECT tenant_id, default_role
       FROM tenant_domains
      WHERE lower(domain) = $1
        AND mode = 'auto_join'
        AND verified_at IS NOT NULL
      LIMIT 1`,
    [domain],
  );
  return rows[0] ? { tenantId: rows[0].tenant_id, defaultRole: rows[0].default_role } : null;
}
