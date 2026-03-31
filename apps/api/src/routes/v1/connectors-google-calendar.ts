import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
} from "../../lib/project-write-lock.js";
import { createSignedStateToken, verifySignedStateToken } from "../../services/connectors/slack.js";
import {
  buildGoogleCalendarInstallUrl,
  createGoogleCalendarWatch,
  exchangeGoogleOauthCode,
  parseGoogExpiration,
  refreshGoogleAccessToken,
} from "../../services/connectors/google-calendar.js";

const GoogleOauthStateSchema = z.object({
  kind: z.literal("google_calendar_oauth_state"),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  calendarId: z.string().min(1),
  nonce: z.string().uuid(),
});

const GoogleChannelTokenSchema = z.object({
  k: z.literal("gcalch"),
  t: z.string().uuid(),
  i: z.string().uuid(),
});

const GoogleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

const GoogleInstallQuerySchema = z.object({
  calendarId: z.string().min(1).optional(),
});

const GoogleWatchBodySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

const GoogleStatusQuerySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

const GoogleProjectLinkQuerySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

const GoogleProjectLinkBodySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
  projectId: z.string().uuid().nullable().optional().default(null),
});

interface GoogleInstallationRow {
  id: string;
  tenant_id: string;
  project_id: string | null;
  google_calendar_id: string;
  google_access_token: string;
  google_refresh_token: string | null;
  token_expires_at: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_expiration: string | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function readGoogleCalendarProjectHint(value: unknown): string | null {
  const body = readOptionalRecord(value);
  if (!body) return null;

  const bodyEvent = readOptionalRecord(body.event);
  const bodyPayload = readOptionalRecord(body.payload);
  const candidates = [
    readOptionalString(body.projectId),
    readOptionalString(body.project_id),
    readOptionalString(bodyEvent?.projectId),
    readOptionalString(bodyEvent?.project_id),
    readOptionalString(bodyPayload?.projectId),
    readOptionalString(bodyPayload?.project_id),
  ];

  for (const candidate of candidates) {
    if (candidate && isUuid(candidate)) {
      return candidate;
    }
  }

  return null;
}

function requireGoogleOauthConfig(
  app: Parameters<FastifyPluginAsync>[0]
): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  stateTtlSeconds: number;
  webhookUrl?: string;
} {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_CALENDAR_SCOPES,
    GOOGLE_OAUTH_STATE_TTL_SECONDS,
    GOOGLE_CALENDAR_WEBHOOK_URL,
  } = app.config;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw app.httpErrors.failedDependency(
      "Google Calendar OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
    );
  }

  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_CALENDAR_SCOPES,
    stateTtlSeconds: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    webhookUrl: GOOGLE_CALENDAR_WEBHOOK_URL,
  };
}

function resolveGoogleWebhookUrl(redirectUri: string, explicitWebhookUrl?: string): string {
  if (explicitWebhookUrl) return explicitWebhookUrl;
  const origin = new URL(redirectUri).origin;
  return `${origin}/v1/connectors/google-calendar/webhook`;
}

async function lookupGoogleInstallationByChannelId(
  app: Parameters<FastifyPluginAsync>[0],
  channelId: string
): Promise<GoogleInstallationRow | null> {
  return app.db.tx(async (client) => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
    const rows = await client.query<GoogleInstallationRow>(
      `SELECT id, tenant_id, project_id, google_calendar_id, google_access_token, google_refresh_token, token_expires_at,
              webhook_channel_id, webhook_resource_id, webhook_expiration
       FROM google_calendar_installations
       WHERE webhook_channel_id = $1
       LIMIT 1`,
      [channelId]
    );
    return rows.rows[0] ?? null;
  });
}

async function loadTenantGoogleInstallation(
  app: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  calendarId: string
): Promise<GoogleInstallationRow | null> {
  const rows = await app.db.queryTenant<GoogleInstallationRow>(
    tenantId,
    `SELECT id, tenant_id, project_id, google_calendar_id, google_access_token, google_refresh_token, token_expires_at,
            webhook_channel_id, webhook_resource_id, webhook_expiration
     FROM google_calendar_installations
     WHERE tenant_id = $1 AND google_calendar_id = $2
     LIMIT 1`,
    [tenantId, calendarId]
  );
  return rows[0] ?? null;
}

async function ensureFreshGoogleAccessToken(
  app: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  installation: GoogleInstallationRow,
  oauthConfig: ReturnType<typeof requireGoogleOauthConfig>
): Promise<string> {
  const expiresAt = installation.token_expires_at ? new Date(installation.token_expires_at).getTime() : null;
  const aboutToExpire = expiresAt !== null && expiresAt <= Date.now() + 60_000;

  if (!aboutToExpire) {
    return installation.google_access_token;
  }
  if (!installation.google_refresh_token) {
    throw app.httpErrors.failedDependency(
      "Google access token expired and no refresh token is available. Reconnect Google Calendar."
    );
  }

  const refreshed = await refreshGoogleAccessToken({
    clientId: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    refreshToken: installation.google_refresh_token,
  });

  await app.db.queryTenant(
    tenantId,
    `UPDATE google_calendar_installations
     SET google_access_token = $3,
         google_refresh_token = COALESCE($4, google_refresh_token),
         google_scope = COALESCE($5, google_scope),
         token_expires_at = $6,
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

export const googleCalendarConnectorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/install-url",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const query = GoogleInstallQuerySchema.parse(request.query);
      const oauth = requireGoogleOauthConfig(fastify);
      const calendarId = query.calendarId ?? "primary";

      const state = createSignedStateToken(
        {
          kind: "google_calendar_oauth_state",
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          calendarId,
          nonce: randomUUID(),
        },
        fastify.config.JWT_ACCESS_SECRET,
        oauth.stateTtlSeconds
      );

      return {
        installUrl: buildGoogleCalendarInstallUrl({
          clientId: oauth.clientId,
          redirectUri: oauth.redirectUri,
          scopes: oauth.scopes,
          state,
        }),
      };
    }
  );

  fastify.get("/callback", async (request, reply) => {
    const oauth = requireGoogleOauthConfig(fastify);
    const query = GoogleCallbackQuerySchema.parse(request.query);

    if (query.error) {
      throw fastify.httpErrors.badRequest(`Google authorization failed: ${query.error}`);
    }
    if (!query.code || !query.state) {
      throw fastify.httpErrors.badRequest("Google callback missing required code/state.");
    }

    let oauthState: z.infer<typeof GoogleOauthStateSchema>;
    try {
      const decoded = verifySignedStateToken(query.state, fastify.config.JWT_ACCESS_SECRET);
      oauthState = GoogleOauthStateSchema.parse(decoded);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      if (fastify.config.NODE_ENV === "development") {
        throw fastify.httpErrors.badRequest(`Invalid or expired Google OAuth state (${reason}).`);
      }
      throw fastify.httpErrors.badRequest("Invalid or expired Google OAuth state.");
    }

    const tokenSet = await exchangeGoogleOauthCode({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri: oauth.redirectUri,
      code: query.code,
    });

    const rows = await fastify.db.queryTenant<{ id: string; google_calendar_id: string }>(
      oauthState.tenantId,
      `INSERT INTO google_calendar_installations
        (tenant_id, installed_by_user_id, google_calendar_id, google_access_token, google_refresh_token, google_scope, token_expires_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (tenant_id, google_calendar_id) DO UPDATE SET
         installed_by_user_id = EXCLUDED.installed_by_user_id,
         google_access_token = EXCLUDED.google_access_token,
         google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, google_calendar_installations.google_refresh_token),
         google_scope = COALESCE(EXCLUDED.google_scope, google_calendar_installations.google_scope),
         token_expires_at = EXCLUDED.token_expires_at,
         updated_at = NOW()
       RETURNING id, google_calendar_id`,
      [
        oauthState.tenantId,
        oauthState.userId,
        oauthState.calendarId,
        tokenSet.accessToken,
        tokenSet.refreshToken ?? null,
        tokenSet.scope ?? null,
        tokenSet.expiresAt ?? null,
      ]
    );

    await writeAuditLog(fastify.db, {
      tenantId: oauthState.tenantId,
      actorUserId: oauthState.userId,
      actionType: "connector.google_calendar.connected",
      objectType: "google_calendar_installation",
      objectId: rows[0].id,
      details: { calendarId: rows[0].google_calendar_id },
    });

    return reply.redirect(`${fastify.config.CORS_ORIGINS.split(",")[0]}/workspace/settings/connectors?connected=calendar`);
  });

  fastify.get(
    "/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = GoogleStatusQuerySchema.parse(request.query);
      const row = await loadTenantGoogleInstallation(fastify, request.user.tenantId, query.calendarId);

      if (!row) {
        return { connected: false, calendarId: query.calendarId };
      }

      return {
        connected: true,
        calendarId: row.google_calendar_id,
        projectId: row.project_id,
        watchActive: Boolean(row.webhook_channel_id && row.webhook_resource_id),
        webhookChannelId: row.webhook_channel_id,
        webhookResourceId: row.webhook_resource_id,
        webhookExpiration: row.webhook_expiration,
      };
    }
  );

  fastify.get(
    "/project-link",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = GoogleProjectLinkQuerySchema.parse(request.query);
      const installation = await loadTenantGoogleInstallation(
        fastify,
        request.user.tenantId,
        query.calendarId
      );

      if (!installation) {
        return {
          calendarId: query.calendarId,
          projectId: null,
          linked: false,
        };
      }

      return {
        calendarId: installation.google_calendar_id,
        projectId: installation.project_id,
        linked: Boolean(installation.project_id),
      };
    }
  );

  fastify.put(
    "/project-link",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const body = GoogleProjectLinkBodySchema.parse(request.body);
      const installation = await loadTenantGoogleInstallation(
        fastify,
        request.user.tenantId,
        body.calendarId
      );
      if (!installation) {
        throw fastify.httpErrors.notFound("Google Calendar installation not found for this calendar ID.");
      }

      if (body.projectId) {
        const projectWriteState = await loadProjectWriteState(
          fastify.db,
          request.user.tenantId,
          body.projectId
        );
        if (!projectWriteState) {
          throw fastify.httpErrors.notFound("Project not found for this tenant.");
        }
        if (isProjectWriteLocked(projectWriteState.status)) {
          throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
        }
      }

      await fastify.db.queryTenant(
        request.user.tenantId,
        `UPDATE google_calendar_installations
         SET project_id = $3,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND id = $2`,
        [request.user.tenantId, installation.id, body.projectId]
      );

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "connector.google_calendar.project_link.updated",
        objectType: "google_calendar_installation",
        objectId: installation.id,
        details: {
          calendarId: body.calendarId,
          projectId: body.projectId,
        },
      });

      return {
        calendarId: body.calendarId,
        projectId: body.projectId,
        linked: Boolean(body.projectId),
      };
    }
  );

  fastify.post(
    "/watch",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const oauth = requireGoogleOauthConfig(fastify);
      const body = GoogleWatchBodySchema.parse(request.body);
      const installation = await loadTenantGoogleInstallation(fastify, request.user.tenantId, body.calendarId);

      if (!installation) {
        throw fastify.httpErrors.notFound("Google Calendar installation not found for this calendar ID.");
      }

      const accessToken = await ensureFreshGoogleAccessToken(
        fastify,
        request.user.tenantId,
        installation,
        oauth
      );
      const webhookUrl = resolveGoogleWebhookUrl(oauth.redirectUri, oauth.webhookUrl);

      const channelId = randomUUID();
      // Google Calendar requires channel token length <= 256 chars.
      // Keep payload compact while still signed + verifiable.
      const channelToken = createSignedStateToken(
        { k: "gcalch", t: request.user.tenantId, i: installation.id },
        fastify.config.JWT_ACCESS_SECRET,
        60 * 60 * 24 * 30
      );

      const watch = await createGoogleCalendarWatch({
        accessToken,
        calendarId: body.calendarId,
        channelId,
        channelToken,
        webhookUrl,
      });

      await fastify.db.queryTenant(
        request.user.tenantId,
        `UPDATE google_calendar_installations
         SET webhook_channel_id = $3,
             webhook_resource_id = $4,
             webhook_expiration = $5,
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [
          request.user.tenantId,
          installation.id,
          watch.channelId,
          watch.resourceId,
          watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null,
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "connector.google_calendar.watch.start",
        objectType: "google_calendar_installation",
        objectId: installation.id,
        details: {
          calendarId: body.calendarId,
          channelId: watch.channelId,
          resourceId: watch.resourceId,
          webhookUrl,
        },
      });

      return {
        watchActive: true,
        calendarId: body.calendarId,
        channelId: watch.channelId,
        resourceId: watch.resourceId,
        expiration: watch.expiration ?? null,
      };
    }
  );

  fastify.post("/webhook", async (request, reply) => {
    const channelIdHeader = request.headers["x-goog-channel-id"];
    const resourceStateHeader = request.headers["x-goog-resource-state"];
    const messageNumberHeader = request.headers["x-goog-message-number"];
    const resourceIdHeader = request.headers["x-goog-resource-id"];
    const channelTokenHeader = request.headers["x-goog-channel-token"];
    const expirationHeader = request.headers["x-goog-channel-expiration"];

    const channelId = typeof channelIdHeader === "string" ? channelIdHeader : undefined;
    const resourceState = typeof resourceStateHeader === "string" ? resourceStateHeader : undefined;
    const messageNumber = typeof messageNumberHeader === "string" ? messageNumberHeader : undefined;
    const resourceId = typeof resourceIdHeader === "string" ? resourceIdHeader : undefined;
    const channelToken = typeof channelTokenHeader === "string" ? channelTokenHeader : undefined;

    if (!channelId || !resourceState) {
      throw fastify.httpErrors.badRequest("Missing Google webhook headers: x-goog-channel-id / x-goog-resource-state.");
    }

    const installation = await lookupGoogleInstallationByChannelId(fastify, channelId);
    if (!installation) {
      return reply.send({ ok: true, ignored: true, reason: "unmapped_channel" });
    }

    // Token is always set when registering a watch channel — reject requests that omit it.
    if (!channelToken) {
      throw fastify.httpErrors.unauthorized("Missing Google channel token.");
    }
    try {
      const decoded = verifySignedStateToken(channelToken, fastify.config.JWT_ACCESS_SECRET);
      const parsed = GoogleChannelTokenSchema.parse(decoded);
      if (parsed.i !== installation.id || parsed.t !== installation.tenant_id) {
        throw new Error("channel_token_mismatch");
      }
    } catch {
      throw fastify.httpErrors.unauthorized("Invalid Google channel token.");
    }

    if (resourceState === "sync") {
      return reply.send({ ok: true, sync: true });
    }

    const bodyPayload = typeof request.body === "object" && request.body !== null ? request.body : null;
    const projectHint = readGoogleCalendarProjectHint(bodyPayload);
    const resolvedProjectId = projectHint ?? installation.project_id ?? null;
    const sourceEventId = `gcal:${channelId}:${messageNumber ?? randomUUID()}`;
    const payload: Record<string, unknown> = {
      channelId,
      resourceState,
      messageNumber: messageNumber ?? null,
      resourceId: resourceId ?? null,
      expiration: typeof expirationHeader === "string" ? parseGoogExpiration(expirationHeader) : undefined,
      body: bodyPayload ?? {},
    };
    if (resolvedProjectId) {
      payload.projectId = resolvedProjectId;
    }

    const result = await ingestCanonicalEvent(fastify, installation.tenant_id, {
      source: "calendar",
      sourceEventId,
      actor: "google-calendar",
      payload,
    });

    await writeAuditLog(fastify.db, {
      tenantId: installation.tenant_id,
      actionType: "ingest.calendar.webhook",
      objectType: "canonical_event",
      objectId: result.canonicalEventId,
      details: {
        sourceEventId,
        channelId,
        resourceState,
      },
    });

    return reply.code(202).send({ ok: true, ...result });
  });
};
