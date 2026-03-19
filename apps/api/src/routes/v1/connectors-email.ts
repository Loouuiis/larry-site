import { randomUUID } from "node:crypto";
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";
import { createSignedStateToken, verifySignedStateToken } from "../../services/connectors/slack.js";

const EmailInstallStateSchema = z.object({
  kind: z.literal("email_oauth_state"),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  accountEmail: z.string().email(),
  nonce: z.string().uuid(),
});

const EmailInstallQuerySchema = z.object({
  accountEmail: z.string().email().optional(),
});

const EmailCallbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().optional(),
  error: z.string().optional(),
});

const EmailInboundBodySchema = z.object({
  accountEmail: z.string().email(),
  messageId: z.string().min(1),
  from: z.string().optional(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  threadId: z.string().optional(),
});

const EmailDraftSendBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  to: z.string().min(1),
  subject: z.string().min(1).max(400),
  body: z.string().min(1).max(20_000),
  sendNow: z.boolean().default(false),
});

const EmailDraftListQuerySchema = z.object({
  state: z.enum(["draft", "sent"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

function resolvePublicBaseUrl(
  fastify: Parameters<FastifyPluginAsync>[0],
  request: FastifyRequest
): string {
  if (fastify.config.EMAIL_CONNECTOR_PUBLIC_BASE_URL) {
    return fastify.config.EMAIL_CONNECTOR_PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  const host = request.headers.host;
  if (!host) {
    throw fastify.httpErrors.failedDependency(
      "EMAIL_CONNECTOR_PUBLIC_BASE_URL is required when host header is unavailable."
    );
  }
  const protocol = request.protocol || "http";
  return `${protocol}://${host}`;
}

async function lookupInstallationByEmail(
  fastify: Parameters<FastifyPluginAsync>[0],
  accountEmail: string
): Promise<{ tenantId: string; webhookSecret: string } | null> {
  return fastify.db.tx(async (client) => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
    const rows = await client.query<{ tenant_id: string; webhook_secret: string }>(
      `SELECT tenant_id, webhook_secret
       FROM email_installations
       WHERE account_email = $1
       LIMIT 1`,
      [accountEmail]
    );
    if (!rows.rows[0]) return null;
    return {
      tenantId: rows.rows[0].tenant_id,
      webhookSecret: rows.rows[0].webhook_secret,
    };
  });
}

export const emailConnectorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const rows = await fastify.db.queryTenant<{
        account_email: string;
        provider: string;
        connected_at: string;
        updated_at: string;
      }>(
        request.user.tenantId,
        `SELECT account_email, provider, connected_at, updated_at
         FROM email_installations
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [request.user.tenantId]
      );

      if (!rows[0]) return { connected: false };
      return {
        connected: true,
        accountEmail: rows[0].account_email,
        provider: rows[0].provider,
        connectedAt: rows[0].connected_at,
        updatedAt: rows[0].updated_at,
      };
    }
  );

  fastify.get(
    "/install-url",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const query = EmailInstallQuerySchema.parse(request.query);
      const accountEmail = query.accountEmail ?? request.user.email;
      if (!accountEmail) {
        throw fastify.httpErrors.badRequest(
          "accountEmail is required when user email is not available."
        );
      }

      const state = createSignedStateToken(
        {
          kind: "email_oauth_state",
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          accountEmail,
          nonce: randomUUID(),
        },
        fastify.config.JWT_ACCESS_SECRET,
        fastify.config.EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS
      );

      const callbackUrl = `${resolvePublicBaseUrl(fastify, request)}/v1/connectors/email/callback`;

      return {
        provider: fastify.config.EMAIL_CONNECTOR_PROVIDER,
        installUrl: `${callbackUrl}?state=${encodeURIComponent(state)}&code=mock-${randomUUID()}`,
        callbackUrl,
      };
    }
  );

  fastify.get("/callback", async (request, reply) => {
    const query = EmailCallbackQuerySchema.parse(request.query);

    if (query.error) {
      throw fastify.httpErrors.badRequest(`Email connector authorization failed: ${query.error}`);
    }

    let parsedState: z.infer<typeof EmailInstallStateSchema>;
    try {
      parsedState = EmailInstallStateSchema.parse(
        verifySignedStateToken(query.state, fastify.config.JWT_ACCESS_SECRET)
      );
    } catch {
      throw fastify.httpErrors.badRequest("Invalid or expired email connector state.");
    }

    const rows = await fastify.db.queryTenant<{ id: string; account_email: string; webhook_secret: string }>(
      parsedState.tenantId,
      `INSERT INTO email_installations
        (tenant_id, installed_by_user_id, provider, account_email, provider_account_id, oauth_access_token, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tenant_id, account_email) DO UPDATE SET
         installed_by_user_id = EXCLUDED.installed_by_user_id,
         provider = EXCLUDED.provider,
         provider_account_id = EXCLUDED.provider_account_id,
         oauth_access_token = EXCLUDED.oauth_access_token,
         updated_at = NOW()
       RETURNING id, account_email, webhook_secret`,
      [
        parsedState.tenantId,
        parsedState.userId,
        fastify.config.EMAIL_CONNECTOR_PROVIDER,
        parsedState.accountEmail,
        `${fastify.config.EMAIL_CONNECTOR_PROVIDER}:${parsedState.accountEmail}`,
        query.code ?? null,
      ]
    );

    await writeAuditLog(fastify.db, {
      tenantId: parsedState.tenantId,
      actorUserId: parsedState.userId,
      actionType: "connector.email.connected",
      objectType: "email_installation",
      objectId: rows[0].id,
      details: { accountEmail: rows[0].account_email },
    });

    return reply.send({
      connected: true,
      accountEmail: rows[0].account_email,
      inboundSecret: rows[0].webhook_secret,
    });
  });

  fastify.post("/inbound", async (request, reply) => {
    const body = EmailInboundBodySchema.parse(request.body);
    const installation = await lookupInstallationByEmail(fastify, body.accountEmail);
    if (!installation) {
      return reply.send({ ok: true, ignored: true, reason: "unmapped_account" });
    }

    const secretHeader = request.headers["x-larry-email-secret"];
    const inboundSecret = typeof secretHeader === "string" ? secretHeader : undefined;
    if (!inboundSecret || inboundSecret !== installation.webhookSecret) {
      throw fastify.httpErrors.unauthorized("Invalid email inbound secret.");
    }

    const result = await ingestCanonicalEvent(fastify, installation.tenantId, {
      source: "email",
      sourceEventId: body.messageId,
      actor: body.from ?? "email",
      occurredAt: body.occurredAt,
      payload: {
        accountEmail: body.accountEmail,
        from: body.from ?? null,
        subject: body.subject,
        bodyText: body.bodyText,
        threadId: body.threadId ?? null,
      },
    });

    await writeAuditLog(fastify.db, {
      tenantId: installation.tenantId,
      actionType: "ingest.email.webhook",
      objectType: "canonical_event",
      objectId: result.canonicalEventId,
      details: { accountEmail: body.accountEmail, messageId: body.messageId },
    });

    return reply.code(202).send({ ok: true, ...result });
  });

  fastify.post(
    "/draft/send",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const body = EmailDraftSendBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO email_outbound_drafts
          (tenant_id, project_id, action_id, created_by_user_id, recipient, subject, body, state, sent_at, metadata)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'sent' THEN NOW() ELSE NULL END, $9::jsonb)
         RETURNING id`,
        [
          tenantId,
          body.projectId ?? null,
          body.actionId ?? null,
          request.user.userId,
          body.to,
          body.subject,
          body.body,
          body.sendNow ? "sent" : "draft",
          JSON.stringify({ provider: fastify.config.EMAIL_CONNECTOR_PROVIDER }),
        ]
      );

      if (body.sendNow) {
        await fastify.db.queryTenant(
          tenantId,
          `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, sent_at, metadata)
           VALUES ($1, NULL, 'email', $2, $3, NOW(), $4::jsonb)`,
          [
            tenantId,
            body.subject,
            body.body,
            JSON.stringify({ recipient: body.to, draftId: rows[0].id }),
          ]
        );
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: body.sendNow ? "connector.email.send" : "connector.email.draft",
        objectType: "email_outbound_draft",
        objectId: rows[0].id,
        details: { recipient: body.to, projectId: body.projectId ?? null },
      });

      return {
        success: true,
        draftId: rows[0].id,
        state: body.sendNow ? "sent" : "draft",
      };
    }
  );

  fastify.get(
    "/drafts",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = EmailDraftListQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId];
      let sql = `SELECT id, project_id as "projectId", action_id as "actionId",
                        recipient, subject, body, state, sent_at as "sentAt",
                        metadata, created_at as "createdAt", updated_at as "updatedAt"
                 FROM email_outbound_drafts
                 WHERE tenant_id = $1`;

      if (query.state) {
        values.push(query.state);
        sql += ` AND state = $${values.length}`;
      }

      values.push(query.limit);
      sql += ` ORDER BY created_at DESC LIMIT $${values.length}`;

      const rows = await fastify.db.queryTenant(tenantId, sql, values);
      return { items: rows };
    }
  );
};
