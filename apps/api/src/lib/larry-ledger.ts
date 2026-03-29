import type { Db } from "@larry/db";
import type {
  LarryActionCentreData,
  LarryConversationPreview,
  LarryEventSummary,
  LarryEventType,
  LarryMessageRecord,
} from "@larry/shared";

export interface LarryEventListOptions {
  projectId?: string;
  eventTypes?: LarryEventType[];
  ids?: string[];
  responseMessageIds?: string[];
  limit?: number;
  sort?: "chronological" | "recent";
}

export interface LarryEventMutationRecord {
  id: string;
  projectId: string;
  eventType: LarryEventType;
  actionType: string;
  payload: Record<string, unknown>;
}

interface LarryMessageRow {
  id: string;
  role: "user" | "larry";
  content: string;
  reasoning: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
}

const EVENT_SUMMARY_SELECT = `
  SELECT e.id,
         e.project_id AS "projectId",
         project.name AS "projectName",
         e.event_type AS "eventType",
         e.action_type AS "actionType",
         e.display_text AS "displayText",
         e.reasoning,
         e.payload,
         e.executed_at AS "executedAt",
         e.triggered_by AS "triggeredBy",
         e.chat_message AS "chatMessage",
         e.created_at AS "createdAt",
         e.conversation_id AS "conversationId",
         e.request_message_id AS "requestMessageId",
         e.response_message_id AS "responseMessageId",
         e.requested_by_user_id AS "requestedByUserId",
         COALESCE(NULLIF(requested.display_name, ''), SPLIT_PART(requested.email, '@', 1)) AS "requestedByName",
         e.approved_by_user_id AS "approvedByUserId",
         COALESCE(NULLIF(approved.display_name, ''), SPLIT_PART(approved.email, '@', 1)) AS "approvedByName",
         e.approved_at AS "approvedAt",
         e.dismissed_by_user_id AS "dismissedByUserId",
         COALESCE(NULLIF(dismissed.display_name, ''), SPLIT_PART(dismissed.email, '@', 1)) AS "dismissedByName",
         e.dismissed_at AS "dismissedAt",
         e.executed_by_kind AS "executedByKind",
         e.executed_by_user_id AS "executedByUserId",
         COALESCE(NULLIF(executor.display_name, ''), SPLIT_PART(executor.email, '@', 1)) AS "executedByName",
         e.execution_mode AS "executionMode",
         e.source_kind AS "sourceKind",
         e.source_record_id AS "sourceRecordId",
         c.title AS "conversationTitle",
         LEFT(request_message.content, 160) AS "requestMessagePreview",
         LEFT(response_message.content, 160) AS "responseMessagePreview"
    FROM larry_events e
    LEFT JOIN projects project
      ON project.tenant_id = e.tenant_id
     AND project.id = e.project_id
    LEFT JOIN larry_conversations c
      ON c.tenant_id = e.tenant_id
     AND c.id = e.conversation_id
    LEFT JOIN larry_messages request_message
      ON request_message.tenant_id = e.tenant_id
     AND request_message.id = e.request_message_id
    LEFT JOIN larry_messages response_message
      ON response_message.tenant_id = e.tenant_id
     AND response_message.id = e.response_message_id
    LEFT JOIN users requested
      ON requested.tenant_id = e.tenant_id
     AND requested.id = e.requested_by_user_id
    LEFT JOIN users approved
      ON approved.tenant_id = e.tenant_id
     AND approved.id = e.approved_by_user_id
    LEFT JOIN users dismissed
      ON dismissed.tenant_id = e.tenant_id
     AND dismissed.id = e.dismissed_by_user_id
    LEFT JOIN users executor
      ON executor.tenant_id = e.tenant_id
     AND executor.id = e.executed_by_user_id`;

export async function listLarryConversationPreviews(
  db: Db,
  tenantId: string,
  userId: string,
  options: { projectId?: string; limit?: number } = {}
): Promise<LarryConversationPreview[]> {
  const params: unknown[] = [tenantId, userId];
  const filters = ["c.tenant_id = $1", "c.user_id = $2"];

  if (options.projectId) {
    params.push(options.projectId);
    filters.push(`c.project_id = $${params.length}`);
  }

  params.push(options.limit ?? 50);

  return db.queryTenant<LarryConversationPreview>(
    tenantId,
    `SELECT c.id,
            c.project_id AS "projectId",
            c.title,
            c.created_at AS "createdAt",
            c.updated_at AS "updatedAt",
            last_message.preview AS "lastMessagePreview",
            COALESCE(last_message.created_at, c.updated_at) AS "lastMessageAt"
       FROM larry_conversations c
       LEFT JOIN LATERAL (
         SELECT LEFT(content, 160) AS preview, created_at
           FROM larry_messages
          WHERE tenant_id = c.tenant_id
            AND conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
       ) last_message ON TRUE
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC, c.created_at DESC
      LIMIT $${params.length}`,
    params
  );
}

export async function createLarryConversation(
  db: Db,
  tenantId: string,
  userId: string,
  input: { projectId?: string | null; title?: string | null }
): Promise<LarryConversationPreview> {
  const rows = await db.queryTenant<LarryConversationPreview>(
    tenantId,
    `INSERT INTO larry_conversations (tenant_id, user_id, project_id, title)
     VALUES ($1, $2, $3, $4)
     RETURNING id,
               project_id AS "projectId",
               title,
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [tenantId, userId, input.projectId ?? null, input.title ?? null]
  );

  return {
    ...rows[0],
    lastMessagePreview: null,
    lastMessageAt: rows[0]?.updatedAt ?? null,
  };
}

export async function getLarryConversationForUser(
  db: Db,
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<LarryConversationPreview | null> {
  const rows = await db.queryTenant<LarryConversationPreview>(
    tenantId,
    `SELECT id,
            project_id AS "projectId",
            title,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM larry_conversations
      WHERE tenant_id = $1
        AND id = $2
        AND user_id = $3
      LIMIT 1`,
    [tenantId, conversationId, userId]
  );

  return rows[0] ? { ...rows[0], lastMessagePreview: null, lastMessageAt: rows[0].updatedAt } : null;
}

export async function touchLarryConversation(
  db: Db,
  tenantId: string,
  conversationId: string,
  title?: string | null
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE larry_conversations
        SET updated_at = NOW(),
            title = COALESCE(title, NULLIF($3, ''))
      WHERE tenant_id = $1
        AND id = $2`,
    [tenantId, conversationId, title ?? null]
  );
}

export async function insertLarryMessage(
  db: Db,
  tenantId: string,
  conversationId: string,
  input: {
    role: "user" | "larry";
    content: string;
    reasoning?: Record<string, unknown> | null;
    actorUserId?: string | null;
  }
): Promise<{ id: string; createdAt: string }> {
  const rows = await db.queryTenant<{ id: string; createdAt: string }>(
    tenantId,
    `INSERT INTO larry_messages (tenant_id, conversation_id, role, content, reasoning, actor_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, created_at AS "createdAt"`,
    [
      tenantId,
      conversationId,
      input.role,
      input.content,
      JSON.stringify(input.reasoning ?? null),
      input.actorUserId ?? null,
    ]
  );

  return rows[0];
}

async function hydrateLarryMessages(
  db: Db,
  tenantId: string,
  rows: LarryMessageRow[]
): Promise<LarryMessageRecord[]> {
  if (rows.length === 0) return [];

  const linkedEvents = await listLarryEventSummaries(db, tenantId, {
    responseMessageIds: rows.map((row) => row.id),
    sort: "chronological",
  });

  const eventsByMessageId = new Map<string, LarryEventSummary[]>();
  for (const event of linkedEvents) {
    if (!event.responseMessageId) continue;
    const existing = eventsByMessageId.get(event.responseMessageId) ?? [];
    existing.push(event);
    eventsByMessageId.set(event.responseMessageId, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning ?? null,
    createdAt: row.createdAt,
    actorUserId: row.actorUserId,
    actorDisplayName: row.actorDisplayName,
    linkedActions: eventsByMessageId.get(row.id) ?? [],
  }));
}

export async function listLarryMessagesForConversation(
  db: Db,
  tenantId: string,
  conversationId: string
): Promise<LarryMessageRecord[]> {
  const rows = await db.queryTenant<LarryMessageRow>(
    tenantId,
    `SELECT m.id,
            m.role,
            m.content,
            m.reasoning,
            m.created_at AS "createdAt",
            m.actor_user_id AS "actorUserId",
            COALESCE(NULLIF(u.display_name, ''), SPLIT_PART(u.email, '@', 1)) AS "actorDisplayName"
       FROM larry_messages m
       LEFT JOIN users u
         ON u.tenant_id = m.tenant_id
        AND u.id = m.actor_user_id
      WHERE m.tenant_id = $1
        AND m.conversation_id = $2
      ORDER BY m.created_at ASC`,
    [tenantId, conversationId]
  );

  return hydrateLarryMessages(db, tenantId, rows);
}

export async function listLarryMessagesByIds(
  db: Db,
  tenantId: string,
  messageIds: string[]
): Promise<LarryMessageRecord[]> {
  if (messageIds.length === 0) return [];

  const rows = await db.queryTenant<LarryMessageRow>(
    tenantId,
    `SELECT m.id,
            m.role,
            m.content,
            m.reasoning,
            m.created_at AS "createdAt",
            m.actor_user_id AS "actorUserId",
            COALESCE(NULLIF(u.display_name, ''), SPLIT_PART(u.email, '@', 1)) AS "actorDisplayName"
       FROM larry_messages m
       LEFT JOIN users u
         ON u.tenant_id = m.tenant_id
        AND u.id = m.actor_user_id
      WHERE m.tenant_id = $1
        AND m.id = ANY($2::uuid[])
      ORDER BY m.created_at ASC`,
    [tenantId, messageIds]
  );

  return hydrateLarryMessages(db, tenantId, rows);
}

export async function listLarryEventSummaries(
  db: Db,
  tenantId: string,
  options: LarryEventListOptions = {}
): Promise<LarryEventSummary[]> {
  const params: unknown[] = [tenantId];
  const filters = ["e.tenant_id = $1"];

  if (options.projectId) {
    params.push(options.projectId);
    filters.push(`e.project_id = $${params.length}`);
  }

  if (options.eventTypes && options.eventTypes.length > 0) {
    params.push(options.eventTypes);
    filters.push(`e.event_type = ANY($${params.length}::text[])`);
  }

  if (options.ids && options.ids.length > 0) {
    params.push(options.ids);
    filters.push(`e.id = ANY($${params.length}::uuid[])`);
  }

  if (options.responseMessageIds && options.responseMessageIds.length > 0) {
    params.push(options.responseMessageIds);
    filters.push(`e.response_message_id = ANY($${params.length}::uuid[])`);
  }

  let limitClause = "";
  if (typeof options.limit === "number") {
    params.push(options.limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const orderBy =
    options.sort === "chronological"
      ? "e.created_at ASC"
      : "COALESCE(e.executed_at, e.created_at) DESC, e.created_at DESC";

  return db.queryTenant<LarryEventSummary>(
    tenantId,
    `${EVENT_SUMMARY_SELECT}
      WHERE ${filters.join(" AND ")}
      ORDER BY ${orderBy}
      ${limitClause}`,
    params
  );
}

export async function getLarryActionCentreData(
  db: Db,
  tenantId: string,
  userId: string,
  projectId?: string
): Promise<LarryActionCentreData> {
  const [suggested, activity, conversations] = await Promise.all([
    listLarryEventSummaries(db, tenantId, {
      projectId,
      eventTypes: ["suggested"],
      limit: 25,
    }),
    listLarryEventSummaries(db, tenantId, {
      projectId,
      eventTypes: ["auto_executed", "accepted"],
      limit: 10,
    }),
    listLarryConversationPreviews(db, tenantId, userId, {
      projectId,
      limit: 6,
    }),
  ]);

  return { suggested, activity, conversations };
}

export async function getLarryEventForMutation(
  db: Db,
  tenantId: string,
  eventId: string
): Promise<LarryEventMutationRecord | null> {
  const rows = await db.queryTenant<LarryEventMutationRecord>(
    tenantId,
    `SELECT id,
            project_id AS "projectId",
            event_type AS "eventType",
            action_type AS "actionType",
            payload
       FROM larry_events
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1`,
    [tenantId, eventId]
  );

  return rows[0] ?? null;
}

export async function markLarryEventAccepted(
  db: Db,
  tenantId: string,
  eventId: string,
  actorUserId: string
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE larry_events
        SET event_type = 'accepted',
            executed_at = NOW(),
            approved_by_user_id = $3,
            approved_at = NOW(),
            executed_by_kind = 'user',
            executed_by_user_id = $3
      WHERE tenant_id = $1
        AND id = $2`,
    [tenantId, eventId, actorUserId]
  );
}

export async function markLarryEventDismissed(
  db: Db,
  tenantId: string,
  eventId: string,
  actorUserId: string,
  reason?: string | null
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE larry_events
        SET event_type = 'dismissed',
            dismissed_by_user_id = $3,
            dismissed_at = NOW(),
            payload = payload || $4::jsonb
      WHERE tenant_id = $1
        AND id = $2`,
    [tenantId, eventId, actorUserId, JSON.stringify({ dismissReason: reason ?? null })]
  );
}
