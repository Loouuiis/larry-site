import { randomUUID, timingSafeEqual } from "node:crypto";
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";
import { createSignedStateToken, verifySignedStateToken } from "../../services/connectors/slack.js";
import { buildGmailInstallUrl, fetchGmailUserProfile, sendGmailMessage } from "../../services/connectors/gmail.js";
import { exchangeGoogleOauthCode, refreshGoogleAccessToken } from "../../services/connectors/google-calendar.js";

const EmailInstallStateSchema = z.object({
  kind: z.literal("email_oauth_state"),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  accountEmail: z.string(),
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
  projectId: z.string().uuid().optional(),
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

interface EmailInstallationRow {
  id: string;
  provider: string;
  account_email: string;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_scope: string | null;
  oauth_token_expires_at: string | null;
}

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

function requireGmailOauthConfig(
  app: Parameters<FastifyPluginAsync>[0]
): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  stateTtlSeconds: number;
} {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GMAIL_REDIRECT_URI,
    GMAIL_SCOPES,
    EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS,
  } = app.config;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REDIRECT_URI) {
    throw app.httpErrors.failedDependency(
      "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_REDIRECT_URI."
    );
  }

  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GMAIL_REDIRECT_URI,
    scopes: GMAIL_SCOPES,
    stateTtlSeconds: EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS,
  };
}

async function loadEmailInstallation(
  app: Parameters<FastifyPluginAsync>[0],
  tenantId: string
): Promise<EmailInstallationRow | null> {
  const rows = await app.db.queryTenant<EmailInstallationRow>(
    tenantId,
    `SELECT id, provider, account_email, oauth_access_token, oauth_refresh_token, oauth_scope, oauth_token_expires_at
     FROM email_installations
     WHERE tenant_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId]
  );
  return rows[0] ?? null;
}

async function ensureFreshEmailToken(
  app: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  installation: EmailInstallationRow,
  oauthConfig: ReturnType<typeof requireGmailOauthConfig>
): Promise<string> {
  if (!installation.oauth_access_token) {
    throw app.httpErrors.failedDependency(
      "Gmail installation has no access token. Reconnect Gmail."
    );
  }

  const expiresAt = installation.oauth_token_expires_at
    ? new Date(installation.oauth_token_expires_at).getTime()
    : null;
  const aboutToExpire = expiresAt !== null && expiresAt <= Date.now() + 60_000;

  if (!aboutToExpire) {
    return installation.oauth_access_token;
  }

  if (!installation.oauth_refresh_token) {
    throw app.httpErrors.failedDependency(
      "Gmail access token expired and no refresh token is available. Reconnect Gmail."
    );
  }

  const refreshed = await refreshGoogleAccessToken({
    clientId: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    refreshToken: installation.oauth_refresh_token,
  });

  await app.db.queryTenant(
    tenantId,
    `UPDATE email_installations
     SET oauth_access_token = $3,
         oauth_refresh_token = COALESCE($4, oauth_refresh_token),
         oauth_scope = COALESCE($5, oauth_scope),
         oauth_token_expires_at = $6,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [
      tenantId,
      installation.id,
      refreshed.accessToken,
      refreshed.refreshToken ?? null,
      refreshed.scope ?? null,
      refreshed.expiresAt ?? null,
    ]
  );

  return refreshed.accessToken;
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
      if (fastify.config.EMAIL_CONNECTOR_PROVIDER === "gmail") {
        const oauthConfig = requireGmailOauthConfig(fastify);

        const state = createSignedStateToken(
          {
            kind: "email_oauth_state",
            tenantId: request.user.tenantId,
            userId: request.user.userId,
            accountEmail: request.user.email ?? "",
            nonce: randomUUID(),
          },
          fastify.config.JWT_ACCESS_SECRET,
          oauthConfig.stateTtlSeconds
        );

        return {
          provider: "gmail",
          installUrl: buildGmailInstallUrl({
            clientId: oauthConfig.clientId,
            redirectUri: oauthConfig.redirectUri,
            scopes: oauthConfig.scopes,
            state,
          }),
        };
      }

      // Mock behavior for non-Gmail providers
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

    if (fastify.config.EMAIL_CONNECTOR_PROVIDER === "gmail") {
      if (!query.code) {
        throw fastify.httpErrors.badRequest("Gmail callback missing required code.");
      }

      let parsedState: z.infer<typeof EmailInstallStateSchema>;
      try {
        parsedState = EmailInstallStateSchema.parse(
          verifySignedStateToken(query.state, fastify.config.JWT_ACCESS_SECRET)
        );
      } catch {
        throw fastify.httpErrors.badRequest("Invalid or expired email connector state.");
      }

      const oauthConfig = requireGmailOauthConfig(fastify);

      const tokenSet = await exchangeGoogleOauthCode({
        clientId: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
        redirectUri: oauthConfig.redirectUri,
        code: query.code,
      });

      const profile = await fetchGmailUserProfile(tokenSet.accessToken);

      const rows = await fastify.db.queryTenant<{ id: string; account_email: string; webhook_secret: string }>(
        parsedState.tenantId,
        `INSERT INTO email_installations
          (tenant_id, installed_by_user_id, provider, account_email, provider_account_id,
           oauth_access_token, oauth_refresh_token, oauth_scope, oauth_token_expires_at,
           connected_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (tenant_id, account_email) DO UPDATE SET
           installed_by_user_id = EXCLUDED.installed_by_user_id,
           provider = EXCLUDED.provider,
           provider_account_id = EXCLUDED.provider_account_id,
           oauth_access_token = EXCLUDED.oauth_access_token,
           oauth_refresh_token = COALESCE(EXCLUDED.oauth_refresh_token, email_installations.oauth_refresh_token),
           oauth_scope = COALESCE(EXCLUDED.oauth_scope, email_installations.oauth_scope),
           oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
           connected_at = COALESCE(email_installations.connected_at, NOW()),
           updated_at = NOW()
         RETURNING id, account_email, webhook_secret`,
        [
          parsedState.tenantId,
          parsedState.userId,
          "gmail",
          profile.email,
          `gmail:${profile.email}`,
          tokenSet.accessToken,
          tokenSet.refreshToken ?? null,
          tokenSet.scope ?? null,
          tokenSet.expiresAt ?? null,
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

      return reply.redirect(`${fastify.config.CORS_ORIGINS.split(",")[0]}/workspace/settings/connectors?connected=email`);
    }

    // Mock behavior for non-Gmail providers
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

    return reply.redirect(`${fastify.config.CORS_ORIGINS.split(",")[0]}/workspace/settings/connectors?connected=email`);
  });

  fastify.post("/inbound", async (request, reply) => {
    const body = EmailInboundBodySchema.parse(request.body);
    const installation = await lookupInstallationByEmail(fastify, body.accountEmail);
    if (!installation) {
      return reply.send({ ok: true, ignored: true, reason: "unmapped_account" });
    }

    const secretHeader = request.headers["x-larry-email-secret"];
    const inboundSecret = typeof secretHeader === "string" ? secretHeader : undefined;
    if (!inboundSecret) {
      throw fastify.httpErrors.unauthorized("Invalid email inbound secret.");
    }
    const a = Buffer.from(inboundSecret, "utf8");
    const b = Buffer.from(installation.webhookSecret, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
        projectId: body.projectId ?? null,
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

      const draftId = rows[0].id;
      const draftState = body.sendNow ? "sent" : "draft";
      await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO documents
          (tenant_id, project_id, title, content, doc_type, source_kind, source_record_id, version, metadata, created_by_user_id)
         VALUES
          ($1, $2, $3, $4, 'email_draft', 'email_draft', $5, 1, $6::jsonb, $7)
         RETURNING id`,
        [
          tenantId,
          body.projectId ?? null,
          body.subject,
          body.body,
          draftId,
          JSON.stringify({
            recipient: body.to,
            state: draftState,
            provider: fastify.config.EMAIL_CONNECTOR_PROVIDER,
            actionId: body.actionId ?? null,
          }),
          request.user.userId,
        ]
      );

      if (body.sendNow) {
        let gmailUsed = false;

        if (fastify.config.EMAIL_CONNECTOR_PROVIDER === "gmail") {
          const installation = await loadEmailInstallation(fastify, tenantId);
          if (installation) {
            try {
              const oauthConfig = requireGmailOauthConfig(fastify);
              const accessToken = await ensureFreshEmailToken(fastify, tenantId, installation, oauthConfig);
              await sendGmailMessage({
                accessToken,
                to: body.to,
                subject: body.subject,
                body: body.body,
              });
              gmailUsed = true;
            } catch (err) {
              fastify.log.warn({ err }, "Gmail email delivery failed — draft saved anyway");
            }
          }
        }

        if (!gmailUsed) {
          // Fallback to Resend when Gmail is not configured or has no installation
          const resendKey = fastify.config.RESEND_API_KEY;
          if (resendKey) {
            try {
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: fastify.config.RESEND_FROM_LARRY,
                  to: [body.to],
                  subject: body.subject,
                  text: body.body,
                }),
              });
              if (!res.ok) {
                const errBody = await res.text().catch(() => "<unreadable>");
                throw new Error(`Resend responded ${res.status}: ${errBody.slice(0, 500)}`);
              }
            } catch (err) {
              fastify.log.warn({ err }, "Resend email delivery failed — draft saved anyway");
            }
          }
        }

        await fastify.db.queryTenant(
          tenantId,
          `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, sent_at, metadata)
           VALUES ($1, NULL, 'email', $2, $3, NOW(), $4::jsonb)`,
          [
            tenantId,
            body.subject,
            body.body,
            JSON.stringify({ recipient: body.to, draftId: rows[0].id, gmailUsed }),
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
        draftId,
        state: draftState,
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
      let sql = `SELECT eod.id, eod.project_id as "projectId", eod.action_id as "actionId",
                        eod.recipient, eod.subject, eod.body, eod.state, eod.sent_at as "sentAt",
                        eod.metadata, eod.created_at as "createdAt", eod.updated_at as "updatedAt",
                        p.name as "projectName"
                 FROM email_outbound_drafts eod
                 LEFT JOIN projects p ON p.tenant_id = eod.tenant_id AND p.id = eod.project_id
                 WHERE eod.tenant_id = $1`;

      if (query.state) {
        values.push(query.state);
        sql += ` AND state = $${values.length}`;
      }

      values.push(query.limit);
      sql += ` ORDER BY eod.created_at DESC LIMIT $${values.length}`;

      const rows = await fastify.db.queryTenant(tenantId, sql, values);
      return { items: rows };
    }
  );
};
