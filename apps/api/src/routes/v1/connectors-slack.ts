import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  buildSlackInstallUrl,
  createSignedStateToken,
  exchangeSlackOauthCode,
  listSlackChannels,
  parseSlackEventTimestampToIso,
  verifySignedStateToken,
  verifySlackSignature,
} from "../../services/connectors/slack.js";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";
import { claimStateToken } from "../../lib/oauth-state.js";

const SlackOauthStateSchema = z.object({
  kind: z.literal("slack_oauth_state"),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  nonce: z.string().uuid(),
});

const SlackCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

const SlackEventEnvelopeSchema = z.object({
  type: z.string().min(1),
  challenge: z.string().optional(),
  team_id: z.string().optional(),
  event_id: z.string().optional(),
  event_time: z.number().optional(),
  event: z.record(z.string(), z.unknown()).optional(),
});

async function lookupInstallationByTeamId(
  app: Parameters<FastifyPluginAsync>[0],
  slackTeamId: string
): Promise<{ tenantId: string } | null> {
  return app.db.tx(async (client) => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM slack_installations WHERE slack_team_id = $1 LIMIT 1",
      [slackTeamId]
    );
    if (!rows.rows[0]) return null;
    return { tenantId: rows.rows[0].tenant_id };
  });
}

function requireSlackOauthConfig(
  app: Parameters<FastifyPluginAsync>[0]
): { clientId: string; clientSecret: string; redirectUri: string; scopes: string } {
  const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI, SLACK_BOT_SCOPES } = app.config;
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_REDIRECT_URI) {
    throw app.httpErrors.failedDependency(
      "Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_REDIRECT_URI."
    );
  }
  return {
    clientId: SLACK_CLIENT_ID,
    clientSecret: SLACK_CLIENT_SECRET,
    redirectUri: SLACK_REDIRECT_URI,
    scopes: SLACK_BOT_SCOPES,
  };
}

export const slackConnectorRoutes: FastifyPluginAsync = async (fastify) => {
  // Slack signature verification requires the exact raw request body bytes.
  // Must use the string literal "application/json" to override Fastify's built-in parser.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => done(null, body)
  );

  fastify.get(
    "/install-url",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const oauth = requireSlackOauthConfig(fastify);
      const state = createSignedStateToken(
        {
          kind: "slack_oauth_state",
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          nonce: randomUUID(),
        },
        fastify.config.JWT_ACCESS_SECRET,
        fastify.config.SLACK_OAUTH_STATE_TTL_SECONDS
      );

      const installUrl = buildSlackInstallUrl({
        clientId: oauth.clientId,
        redirectUri: oauth.redirectUri,
        scopes: oauth.scopes,
        state,
      });

      return { installUrl };
    }
  );

  fastify.get("/status", { preHandler: [fastify.authenticate] }, async (request) => {
    const rows = await fastify.db.queryTenant<{
      slack_team_id: string;
      slack_team_name: string | null;
      installed_at: string;
      updated_at: string;
    }>(
      request.user.tenantId,
      `SELECT slack_team_id, slack_team_name, installed_at, updated_at
       FROM slack_installations
       WHERE tenant_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [request.user.tenantId]
    );

    if (!rows[0]) {
      return { connected: false };
    }

    return {
      connected: true,
      teamId: rows[0].slack_team_id,
      teamName: rows[0].slack_team_name,
      installedAt: rows[0].installed_at,
      updatedAt: rows[0].updated_at,
    };
  });

  fastify.get("/callback", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const oauth = requireSlackOauthConfig(fastify);
    const query = SlackCallbackQuerySchema.parse(request.query);

    if (query.error) {
      throw fastify.httpErrors.badRequest(`Slack authorization failed: ${query.error}`);
    }
    if (!query.code || !query.state) {
      throw fastify.httpErrors.badRequest("Slack callback missing required code/state.");
    }

    let oauthState: z.infer<typeof SlackOauthStateSchema>;
    let decodedJti: string | undefined;
    try {
      const decoded = verifySignedStateToken(query.state, fastify.config.JWT_ACCESS_SECRET);
      decodedJti = typeof decoded.jti === "string" ? decoded.jti : undefined;
      oauthState = SlackOauthStateSchema.parse(decoded);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      if (fastify.config.NODE_ENV === "development") {
        throw fastify.httpErrors.badRequest(`Invalid or expired Slack OAuth state (${reason}).`);
      }
      throw fastify.httpErrors.badRequest("Invalid or expired Slack OAuth state.");
    }

    // Single-use enforcement to defeat state replay (see lib/oauth-state.ts).
    if (decodedJti && !(await claimStateToken(decodedJti, fastify.config.SLACK_OAUTH_STATE_TTL_SECONDS))) {
      request.log.warn({ jti: decodedJti }, "slack/callback: state replay rejected");
      throw fastify.httpErrors.badRequest("OAuth state already used.");
    }

    const oauthResult = await exchangeSlackOauthCode({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      code: query.code,
      redirectUri: oauth.redirectUri,
    });

    const existing = await lookupInstallationByTeamId(fastify, oauthResult.teamId);
    if (existing && existing.tenantId !== oauthState.tenantId) {
      throw fastify.httpErrors.conflict("This Slack workspace is already connected to another tenant.");
    }

    const installationRows = await fastify.db.queryTenant<{ id: string }>(
      oauthState.tenantId,
      `INSERT INTO slack_installations
        (tenant_id, installed_by_user_id, slack_team_id, slack_team_name, slack_enterprise_id,
         slack_bot_user_id, slack_scope, app_id, bot_access_token, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (slack_team_id) DO UPDATE SET
         installed_by_user_id = EXCLUDED.installed_by_user_id,
         slack_team_name = EXCLUDED.slack_team_name,
         slack_enterprise_id = EXCLUDED.slack_enterprise_id,
         slack_bot_user_id = EXCLUDED.slack_bot_user_id,
         slack_scope = EXCLUDED.slack_scope,
         app_id = EXCLUDED.app_id,
         bot_access_token = EXCLUDED.bot_access_token,
         updated_at = NOW()
       RETURNING id`,
      [
        oauthState.tenantId,
        oauthState.userId,
        oauthResult.teamId,
        oauthResult.teamName ?? null,
        oauthResult.enterpriseId ?? null,
        oauthResult.botUserId ?? null,
        oauthResult.scope ?? null,
        oauthResult.appId ?? null,
        oauthResult.accessToken,
      ]
    );

    await writeAuditLog(fastify.db, {
      tenantId: oauthState.tenantId,
      actorUserId: oauthState.userId,
      actionType: "connector.slack.connected",
      objectType: "slack_installation",
      objectId: installationRows[0].id,
      details: {
        slackTeamId: oauthResult.teamId,
        slackTeamName: oauthResult.teamName ?? null,
      },
    });

    return reply.redirect(`${fastify.config.CORS_ORIGINS.split(",")[0]}/workspace/settings/connectors?connected=slack`);
  });

  fastify.post("/events", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (request, reply) => {
    const timestampHeader = request.headers["x-slack-request-timestamp"];
    const signatureHeader = request.headers["x-slack-signature"];
    const rawBody =
      typeof request.body === "string" ? request.body : JSON.stringify((request.body ?? {}) as object);

    const signingSecret = fastify.config.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      throw fastify.httpErrors.failedDependency(
        "Slack events webhook is not configured. Set SLACK_SIGNING_SECRET."
      );
    }

    const verified = verifySlackSignature({
      rawBody,
      timestampHeader: typeof timestampHeader === "string" ? timestampHeader : undefined,
      signatureHeader: typeof signatureHeader === "string" ? signatureHeader : undefined,
      signingSecret,
      toleranceSeconds: fastify.config.SLACK_SIGNATURE_TOLERANCE_SECONDS,
    });
    if (!verified) {
      throw fastify.httpErrors.unauthorized("Invalid Slack request signature.");
    }

    let envelope: z.infer<typeof SlackEventEnvelopeSchema>;
    try {
      envelope = SlackEventEnvelopeSchema.parse(JSON.parse(rawBody));
    } catch {
      throw fastify.httpErrors.badRequest("Invalid Slack events payload.");
    }

    if (envelope.type === "url_verification") {
      return reply.send({ challenge: envelope.challenge ?? "" });
    }

    if (envelope.type !== "event_callback") {
      return reply.send({ ok: true, ignored: true });
    }

    if (!envelope.team_id) {
      throw fastify.httpErrors.badRequest("Slack event missing team_id.");
    }

    const installation = await lookupInstallationByTeamId(fastify, envelope.team_id);
    if (!installation) {
      return reply.send({ ok: true, ignored: true, reason: "unmapped_team" });
    }

    const event = envelope.event ?? {};
    const eventSubtype = typeof event.subtype === "string" ? event.subtype : undefined;
    if (eventSubtype === "bot_message" || typeof event.bot_id === "string") {
      return reply.send({ ok: true, ignored: true, reason: "bot_event" });
    }

    const sourceEventId =
      envelope.event_id ??
      (typeof event.client_msg_id === "string" ? event.client_msg_id : undefined) ??
      (typeof event.event_ts === "string" ? `evt:${event.event_ts}` : undefined) ??
      randomUUID();

    const occurredAt =
      parseSlackEventTimestampToIso(event.event_ts) ??
      (typeof envelope.event_time === "number"
        ? new Date(envelope.event_time * 1000).toISOString()
        : undefined);

    const actor = typeof event.user === "string" ? event.user : undefined;
    const slackChannel = typeof event.channel === "string" ? event.channel : null;
    const slackText = typeof event.text === "string" ? event.text : "";
    const threadTs = typeof event.thread_ts === "string" ? event.thread_ts : null;
    const channelType = typeof event.channel_type === "string" ? event.channel_type : null;

    // Resolve channel → project mapping
    let projectIdHint: string | null = null;
    if (slackChannel && envelope.team_id) {
      const mapping = await fastify.db.queryTenant<{ project_id: string }>(
        installation.tenantId,
        `SELECT project_id FROM slack_channel_project_mappings
         WHERE tenant_id = $1 AND slack_channel_id = $2
         LIMIT 1`,
        [installation.tenantId, slackChannel]
      );
      projectIdHint = mapping[0]?.project_id ?? null;
    }

    const result = await ingestCanonicalEvent(fastify, installation.tenantId, {
      source: "slack",
      sourceEventId,
      actor,
      occurredAt,
      payload: {
        text: slackText,
        channel: slackChannel,
        channelType,
        threadTs,
        parentUserId: typeof event.parent_user_id === "string" ? event.parent_user_id : null,
        slackUserId: actor ?? null,
        teamId: envelope.team_id ?? null,
        projectId: projectIdHint,
        rawEvent: event,
      },
    });

    await writeAuditLog(fastify.db, {
      tenantId: installation.tenantId,
      actionType: "ingest.slack.webhook",
      objectType: "canonical_event",
      objectId: result.canonicalEventId,
      details: {
        slackTeamId: envelope.team_id,
        slackChannel,
        projectIdHint,
        sourceEventId,
      },
    });

    return reply.code(202).send({ ok: true, ...result });
  });

  // List Slack channels accessible to the bot
  fastify.get(
    "/channels",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const rows = await fastify.db.queryTenant<{ bot_access_token: string }>(
        tenantId,
        `SELECT bot_access_token FROM slack_installations WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [tenantId]
      );
      if (!rows[0]?.bot_access_token) {
        throw fastify.httpErrors.failedDependency("Slack is not connected.");
      }
      const channels = await listSlackChannels(rows[0].bot_access_token);
      return { channels };
    }
  );

  // Get all channel→project mappings for this tenant
  fastify.get(
    "/channel-mapping",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const rows = await fastify.db.queryTenant<{
        slack_channel_id: string;
        slack_channel_name: string | null;
        project_id: string;
      }>(
        tenantId,
        `SELECT slack_channel_id, slack_channel_name, project_id
         FROM slack_channel_project_mappings
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );
      return {
        mappings: rows.map((r) => ({
          slackChannelId: r.slack_channel_id,
          slackChannelName: r.slack_channel_name,
          projectId: r.project_id,
        })),
      };
    }
  );

  // Upsert or delete a channel→project mapping
  fastify.put(
    "/channel-mapping",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const body = z.object({
        slackChannelId: z.string().min(1),
        slackChannelName: z.string().optional().nullable(),
        projectId: z.string().uuid().nullable(),
      }).parse(request.body);

      const tenantId = request.user.tenantId;

      if (body.projectId === null) {
        await fastify.db.queryTenant(
          tenantId,
          `DELETE FROM slack_channel_project_mappings WHERE tenant_id = $1 AND slack_channel_id = $2`,
          [tenantId, body.slackChannelId]
        );
        return { ok: true, deleted: true };
      }

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO slack_channel_project_mappings (tenant_id, slack_team_id, slack_channel_id, slack_channel_name, project_id)
         SELECT $1, si.slack_team_id, $3, $4, $5
         FROM slack_installations si WHERE si.tenant_id = $1 ORDER BY si.updated_at DESC LIMIT 1
         ON CONFLICT (tenant_id, slack_channel_id)
         DO UPDATE SET project_id = EXCLUDED.project_id, slack_channel_name = EXCLUDED.slack_channel_name, updated_at = NOW()`,
        [tenantId, null, body.slackChannelId, body.slackChannelName ?? null, body.projectId]
      );

      return { ok: true, slackChannelId: body.slackChannelId, projectId: body.projectId };
    }
  );
};
