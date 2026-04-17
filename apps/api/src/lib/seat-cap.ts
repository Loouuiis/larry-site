import type { Db } from "@larry/db";

export class SeatCapReachedError extends Error {
  readonly code = "seat_cap_reached";
  constructor(message = "Seat cap reached for this organisation.") {
    super(message);
  }
}

/**
 * Counts memberships + pending invitations against tenants.seat_cap.
 * If seat_cap is null, seats are unlimited.
 */
export async function assertSeatAvailable(db: Db, tenantId: string): Promise<void> {
  const rows = await db.query<{ seat_cap: number | null; used: number | string }>(
    `SELECT
       (SELECT seat_cap FROM tenants WHERE id = $1) AS seat_cap,
       ((SELECT COUNT(*) FROM memberships WHERE tenant_id = $1)
        + (SELECT COUNT(*) FROM invitations WHERE tenant_id = $1 AND status = 'pending'))::int AS used`,
    [tenantId],
  );
  const row = rows[0];
  if (!row || row.seat_cap == null) return;
  const usedNum =
    typeof row.used === "number" ? row.used : Number.parseInt(String(row.used ?? "0"), 10);
  if (Number.isNaN(usedNum)) return;
  if (usedNum >= row.seat_cap) throw new SeatCapReachedError();
}
