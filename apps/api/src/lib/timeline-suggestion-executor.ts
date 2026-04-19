import type { FastifyInstance } from "fastify";

export interface TimelineRegroupPayload {
  displayText: string;
  reasoning: string;
  createCategories?: Array<{ tempId: string; name: string; colour: string }>;
  moveProjects?: Array<{ projectId: string; toCategoryTempId?: string; toCategoryId?: string }>;
  recolourCategories?: Array<{ categoryId: string; colour: string }>;
}

export interface ExecuteResult {
  applied: { categories: number; moves: number; recolours: number };
  skipped: Array<{ reason: string; projectId?: string; categoryId?: string }>;
}

export async function executeTimelineSuggestion(
  fastify: FastifyInstance,
  tenantId: string,
  eventId: string,
  payload: TimelineRegroupPayload,
  actorUserId: string,
): Promise<ExecuteResult> {
  return fastify.db.tx(async (client) => {
    // Set tenant for RLS within this transaction.
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    // Concurrency guard — lock the event row first. Blocks a concurrent
    // accept on the same event; second caller waits on the lock, finds the
    // already-updated event_type and no-ops.
    const lock = await client.query<{ id: string; eventType: string }>(
      `SELECT id, event_type AS "eventType"
         FROM larry_events
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE`,
      [eventId, tenantId],
    );

    if (lock.rows.length === 0) {
      throw new Error(`larry_events row ${eventId} not found for tenant ${tenantId}`);
    }

    if (lock.rows[0].eventType !== "suggested") {
      return {
        applied: { categories: 0, moves: 0, recolours: 0 },
        skipped: [{ reason: "already_resolved" }],
      };
    }

    // Tasks 12-14 fill the apply loops in here.
    const applied = { categories: 0, moves: 0, recolours: 0 };
    const skipped: ExecuteResult["skipped"] = [];

    const tempIdToRealId = new Map<string, string>();

    for (const cat of payload.createCategories ?? []) {
      try {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO project_categories (tenant_id, name, colour)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [tenantId, cat.name, cat.colour],
        );
        tempIdToRealId.set(cat.tempId, ins.rows[0].id);
        applied.categories += 1;
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (code !== "23505") throw e;
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM project_categories
            WHERE tenant_id = $1 AND name = $2
              AND parent_category_id IS NULL AND project_id IS NULL`,
          [tenantId, cat.name],
        );
        if (existing.rows.length > 0) {
          const id = existing.rows[0].id;
          tempIdToRealId.set(cat.tempId, id);
          skipped.push({ reason: "category_name_already_exists", categoryId: id });
        } else {
          throw e;
        }
      }
    }

    // Mark the event accepted.
    await client.query(
      `UPDATE larry_events
          SET event_type = 'accepted',
              approved_by_user_id = $2,
              approved_at = NOW(),
              execution_mode = 'approval',
              executed_by_kind = 'user',
              executed_by_user_id = $2
        WHERE id = $1 AND tenant_id = $3`,
      [eventId, actorUserId, tenantId],
    );

    return { applied, skipped };
  });
}
