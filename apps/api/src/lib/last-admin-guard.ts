import type { Db } from "@larry/db";

export class LastAdminRequiredError extends Error {
  readonly code = "last_admin_required";
  constructor(message = "Operation would leave the organisation without any admin or owner.") {
    super(message);
  }
}

export async function countRemainingAdmins(
  db: Db,
  tenantId: string,
  excludeUserId: string,
): Promise<number> {
  const rows = await db.queryTenant<{ n: number | string }>(
    tenantId,
    `SELECT COUNT(*)::int AS n
       FROM memberships
      WHERE tenant_id = $1
        AND user_id <> $2
        AND role IN ('owner','admin')`,
    [tenantId, excludeUserId],
  );
  const n = rows[0]?.n;
  if (typeof n === "number") return n;
  const parsed = Number.parseInt(String(n ?? "0"), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function assertTenantHasRemainingAdmin(
  db: Db,
  tenantId: string,
  excludeUserId: string,
): Promise<void> {
  const n = await countRemainingAdmins(db, tenantId, excludeUserId);
  if (n < 1) throw new LastAdminRequiredError();
}
