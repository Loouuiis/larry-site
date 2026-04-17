import type { Db } from "@larry/db";
import type { Role } from "@larry/shared";

export class MfaEnrollmentRequiredError extends Error {
  readonly code = "mfa_enrollment_required";
  constructor(message = "This organisation requires admins to enrol MFA before performing this action.") {
    super(message);
  }
}

const PROTECTED_ROLES: Role[] = ["owner", "admin"];

/**
 * If the tenant has mfa_required_for_admins=true and the caller is owner/admin
 * without an mfa_enrolled_at timestamp, throws MfaEnrollmentRequiredError.
 */
export async function assertMfaIfRequired(
  db: Db,
  tenantId: string,
  userId: string,
  role: Role,
): Promise<void> {
  if (!PROTECTED_ROLES.includes(role)) return;
  const rows = await db.query<{
    mfa_required_for_admins: boolean;
    mfa_enrolled_at: string | null;
  }>(
    `SELECT t.mfa_required_for_admins, u.mfa_enrolled_at
       FROM tenants t, users u
      WHERE t.id = $1 AND u.id = $2`,
    [tenantId, userId],
  );
  const row = rows[0];
  if (!row?.mfa_required_for_admins) return;
  if (!row.mfa_enrolled_at) throw new MfaEnrollmentRequiredError();
}
