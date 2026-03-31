import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
} from "../../lib/project-write-lock.js";
import { createSignedStateToken, verifySignedStateToken } from "../../services/connectors/slack.js";
import {
  buildOutlookCalendarInstallUrl,
  exchangeOutlookOauthCode,
  refreshOutlookAccessToken,
} from "../../services/connectors/outlook-calendar.js";

const OutlookOauthStateSchema = z.object({
  kind: z.literal("outlook_calendar_oauth_state"),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  calendarId: z.string().min(1),
  nonce: z.string().uuid(),
});

const OutlookCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

const OutlookInstallQuerySchema = z.object({
  calendarId: z.string().min(1).optional(),
});

const OutlookStatusQuerySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

const OutlookProjectLinkBodySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
  projectId: z.string().uuid().nullable().optional().default(null),
});

const OutlookProjectLinkQuerySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

interface OutlookInstallationRow {
  id: string;
  tenant_id: string;
  project_id: string | null;
  outlook_calendar_id: string;
  outlook_access_token: string;
  outlook_refresh_token: string | null;
  token_expires_at: string | null;
}

function requireOutlookOauthConfig(app: Parameters<FastifyPluginAsync>[0]): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  stateTtlSeconds: number;
} {
  const {
    OUTLOOK_CLIENT_ID,
    OUTLOOK_CLIENT_SECRET,
    OUTLOOK_REDIRECT_URI,
    OUTLOOK_CALENDAR_SCOPES,
    OUTLOOK_OAUTH_STATE_TTL_SECONDS,
  } = app.config;

  if (!OUTLOOK_CLIENT_ID || !OUTLOOK_CLIENT_SECRET || !OUTLOOK_REDIRECT_URI) {
    throw app.httpErrors.failedDependency(
      "Outlook Calendar OAuth is not configured. Set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, and OUTLOOK_REDIRECT_URI."
    );
  }

  return {
    clientId: OUTLOOK_CLIENT_ID,
    clientSecret: OUTLOOK_CLIENT_SECRET,
    redirectUri: OUTLOOK_REDIRECT_URI,
    scopes: OUTLOOK_CALENDAR_SCOPES,
    stateTtlSeconds: OUTLOOK_OAUTH_STATE_TTL_SECONDS,
  };
}

async function loadTenantOutlookInstallation(
  app: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  calendarId: string
): Promise<OutlookInstallationRow | null> {
  const rows = await app.db.queryTenant<OutlookInstallationRow>(
    tenantId,
    `SELECT id, tenant_id, project_id, outlook_calendar_id, outlook_access_token, outlook_refresh_token, token_expires_at
     FROM outlook_calendar_installations
     WHERE tenant_id = $1 AND outlook_calendar_id = $2
     LIMIT 1`,
    [tenantId, calendarId]
  );
  return rows[0] ?? null;
}

async function ensureFreshOutlookAccessToken(input: {
  app: Parameters<FastifyPluginAsync>[0];
  tenantId: string;
  installation: OutlookInstallationRow;
  oauthConfig: ReturnType<typeof requireOutlookOauthConfig>;
}): Promise<string> {
  const expiresAt = input.installation.token_expires_at
    ? new Date(input.installation.token_expires_at).getTime()
    : null;
  const aboutToExpire = expiresAt !== null && expiresAt <= Date.now() + 60_000;

  if (!aboutToExpire) {
    return input.installation.outlook_access_token;
  }
  if (!input.installation.outlook_refresh_token) {
    throw input.app.httpErrors.failedDependency(
      "Outlook access token expired and no refresh token is available. Reconnect Outlook Calendar."
    );
  }

  const refreshed = await refreshOutlookAccessToken({
    clientId: input.oauthConfig.clientId,
    clientSecret: input.oauthConfig.clientSecret,
    refreshToken: input.installation.outlook_refresh_token,
    scopes: input.oauthConfig.scopes,
  });

  await input.app.db.queryTenant(
    input.tenantId,
    `UPDATE outlook_calendar_installations
     SET outlook_access_token = $3,
         outlook_refresh_token = COALESCE($4, outlook_refresh_token),
         outlook_scope = COALESCE($5, outlook_scope),
         token_expires_at = $6,
         updated_at = NOW()
     WHERE tenant_id = $1
       AND id = $2`,
    [
      input.tenantId,
      input.installation.id,
      refreshed.accessToken,
      refreshed.refreshToken ?? null,
      refreshed.scope ?? null,
      refreshed.expiresAt ?? null,
    ]
  );

  return refreshed.accessToken;
}

export const outlookCalendarConnectorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/install-url",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const query = OutlookInstallQuerySchema.parse(request.query);
      const oauth = requireOutlookOauthConfig(fastify);
      const calendarId = query.calendarId ?? "primary";

      const state = createSignedStateToken(
        {
          kind: "outlook_calendar_oauth_state",
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          calendarId,
          nonce: randomUUID(),
        },
        fastify.config.JWT_ACCESS_SECRET,
        oauth.stateTtlSeconds
      );

      return {
        installUrl: buildOutlookCalendarInstallUrl({
          clientId: oauth.clientId,
          redirectUri: oauth.redirectUri,
          scopes: oauth.scopes,
          state,
        }),
      };
    }
  );

  fastify.get("/callback", async (request, reply) => {
    const oauth = requireOutlookOauthConfig(fastify);
    const query = OutlookCallbackQuerySchema.parse(request.query);

    if (query.error) {
      throw fastify.httpErrors.badRequest(`Outlook authorization failed: ${query.error}`);
    }
    if (!query.code || !query.state) {
      throw fastify.httpErrors.badRequest("Outlook callback missing required code/state.");
    }

    let oauthState: z.infer<typeof OutlookOauthStateSchema>;
    try {
      const decoded = verifySignedStateToken(query.state, fastify.config.JWT_ACCESS_SECRET);
      oauthState = OutlookOauthStateSchema.parse(decoded);
    } catch {
      throw fastify.httpErrors.badRequest("Invalid or expired Outlook OAuth state.");
    }

    const tokenSet = await exchangeOutlookOauthCode({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri: oauth.redirectUri,
      code: query.code,
    });

    const rows = await fastify.db.queryTenant<{ id: string; outlook_calendar_id: string }>(
      oauthState.tenantId,
      `INSERT INTO outlook_calendar_installations
         (tenant_id, installed_by_user_id, outlook_calendar_id, outlook_access_token, outlook_refresh_token, outlook_scope, token_expires_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (tenant_id, outlook_calendar_id) DO UPDATE SET
         installed_by_user_id = EXCLUDED.installed_by_user_id,
         outlook_access_token = EXCLUDED.outlook_access_token,
         outlook_refresh_token = COALESCE(EXCLUDED.outlook_refresh_token, outlook_calendar_installations.outlook_refresh_token),
         outlook_scope = COALESCE(EXCLUDED.outlook_scope, outlook_calendar_installations.outlook_scope),
         token_expires_at = EXCLUDED.token_expires_at,
         updated_at = NOW()
       RETURNING id, outlook_calendar_id`,
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
      actionType: "connector.outlook_calendar.connected",
      objectType: "outlook_calendar_installation",
      objectId: rows[0].id,
      details: { calendarId: rows[0].outlook_calendar_id },
    });

    return reply.redirect(`${fastify.config.CORS_ORIGINS.split(",")[0]}/workspace/settings/connectors?connected=outlook-calendar`);
  });

  fastify.get(
    "/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = OutlookStatusQuerySchema.parse(request.query);
      const installation = await loadTenantOutlookInstallation(
        fastify,
        request.user.tenantId,
        query.calendarId
      );

      if (!installation) {
        return { connected: false, calendarId: query.calendarId };
      }

      const oauth = requireOutlookOauthConfig(fastify);
      const token = await ensureFreshOutlookAccessToken({
        app: fastify,
        tenantId: request.user.tenantId,
        installation,
        oauthConfig: oauth,
      });

      return {
        connected: Boolean(token),
        calendarId: installation.outlook_calendar_id,
        projectId: installation.project_id,
      };
    }
  );

  fastify.get(
    "/project-link",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = OutlookProjectLinkQuerySchema.parse(request.query);
      const installation = await loadTenantOutlookInstallation(
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
        calendarId: installation.outlook_calendar_id,
        projectId: installation.project_id,
        linked: Boolean(installation.project_id),
      };
    }
  );

  fastify.put(
    "/project-link",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const body = OutlookProjectLinkBodySchema.parse(request.body);
      const installation = await loadTenantOutlookInstallation(
        fastify,
        request.user.tenantId,
        body.calendarId
      );
      if (!installation) {
        throw fastify.httpErrors.notFound("Outlook Calendar installation not found for this calendar ID.");
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
        `UPDATE outlook_calendar_installations
         SET project_id = $3,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND id = $2`,
        [request.user.tenantId, installation.id, body.projectId]
      );

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "connector.outlook_calendar.project_link.updated",
        objectType: "outlook_calendar_installation",
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
};
