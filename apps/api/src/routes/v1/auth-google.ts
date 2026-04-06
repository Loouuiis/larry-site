import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { issueAccessToken, issueRefreshToken } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import {
  createSignedStateToken,
  verifySignedStateToken,
} from "../../services/connectors/slack.js";

/* ─── Schemas ────────────────────────────────────────────────────── */

const GoogleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

const GoogleLinkBodySchema = z.object({
  idToken: z.string().min(1),
});

const GoogleStateSchema = z.object({
  kind: z.literal("google_auth_state"),
  tenantId: z.string().uuid(),
  nonce: z.string().uuid(),
});

/* ─── Helpers ────────────────────────────────────────────────────── */

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google userinfo request failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleUserInfo;
}

async function exchangeGoogleAuthCode(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; idToken?: string }> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    id_token?: string;
  };

  return { accessToken: data.access_token, idToken: data.id_token };
}

function requireGoogleAuthConfig(app: Parameters<FastifyPluginAsync>[0]) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_AUTH_REDIRECT_URI,
  } = app.config;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_AUTH_REDIRECT_URI) {
    throw app.httpErrors.failedDependency(
      "Google OAuth sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_AUTH_REDIRECT_URI."
    );
  }

  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_AUTH_REDIRECT_URI,
  };
}

/* ─── Plugin ─────────────────────────────────────────────────────── */

export const authGoogleRoutes: FastifyPluginAsync = async (fastify) => {
  // ─────────────────────────────────────────────────────────────────
  // GET /google — Initiate Google OAuth flow
  // ─────────────────────────────────────────────────────────────────
  fastify.get("/google", async (request, reply) => {
    const oauth = requireGoogleAuthConfig(fastify);

    const tenantId =
      typeof request.headers["x-tenant-id"] === "string"
        ? request.headers["x-tenant-id"]
        : process.env.LARRY_API_TENANT_ID ?? "";

    const state = createSignedStateToken(
      {
        kind: "google_auth_state",
        tenantId,
        nonce: randomUUID(),
      },
      fastify.config.JWT_ACCESS_SECRET,
      600, // 10-minute TTL
    );

    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return reply.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /google/callback — Handle Google redirect
  // ─────────────────────────────────────────────────────────────────
  fastify.get("/google/callback", async (request, reply) => {
    const oauth = requireGoogleAuthConfig(fastify);
    const query = GoogleCallbackQuerySchema.parse(request.query);

    const frontendUrl = (
      fastify.config.FRONTEND_URL ??
      fastify.config.CORS_ORIGINS.split(",")[0].trim()
    ).replace(/\/+$/, "");

    if (query.error) {
      return reply.redirect(`${frontendUrl}/login?error=google_denied`);
    }

    if (!query.code || !query.state) {
      return reply.redirect(`${frontendUrl}/login?error=google_missing_params`);
    }

    // Verify state
    let oauthState: z.infer<typeof GoogleStateSchema>;
    try {
      const decoded = verifySignedStateToken(
        query.state,
        fastify.config.JWT_ACCESS_SECRET
      );
      oauthState = GoogleStateSchema.parse(decoded);
    } catch {
      return reply.redirect(`${frontendUrl}/login?error=google_invalid_state`);
    }

    // Exchange code for tokens
    let googleAccessToken: string;
    try {
      const tokenResult = await exchangeGoogleAuthCode({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        redirectUri: oauth.redirectUri,
        code: query.code,
      });
      googleAccessToken = tokenResult.accessToken;
    } catch (err) {
      request.log.error({ err }, "Google token exchange failed");
      return reply.redirect(`${frontendUrl}/login?error=google_token_exchange`);
    }

    // Fetch user info
    let googleUser: GoogleUserInfo;
    try {
      googleUser = await fetchGoogleUserInfo(googleAccessToken);
    } catch (err) {
      request.log.error({ err }, "Google userinfo fetch failed");
      return reply.redirect(`${frontendUrl}/login?error=google_userinfo`);
    }

    if (!googleUser.email) {
      return reply.redirect(`${frontendUrl}/login?error=google_no_email`);
    }

    const tenantId = oauthState.tenantId;
    let isNewUser = false;

    // --- Try to find existing user by provider_user_id ---
    let existingOauth = await fastify.db.query<{
      user_id: string;
    }>(
      `SELECT user_id FROM user_oauth_accounts
       WHERE provider = 'google' AND provider_user_id = $1
       LIMIT 1`,
      [googleUser.sub]
    );

    let userId: string | null = existingOauth[0]?.user_id ?? null;
    let role: "admin" | "pm" | "member" | "executive" = "member";
    let userEmail = googleUser.email;

    if (userId) {
      // Existing OAuth-linked user — look up membership
      const membership = await fastify.db.query<{
        role: "admin" | "pm" | "member" | "executive";
        email: string;
      }>(
        `SELECT m.role, u.email FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.user_id = $1 AND m.tenant_id = $2
         LIMIT 1`,
        [userId, tenantId]
      );
      if (membership[0]) {
        role = membership[0].role;
        userEmail = membership[0].email;
      }
    } else {
      // --- Try to find existing user by email in this tenant ---
      const emailMatch = await fastify.db.query<{
        id: string;
        role: "admin" | "pm" | "member" | "executive";
        email: string;
      }>(
        `SELECT u.id, m.role, u.email FROM users u
         JOIN memberships m ON m.user_id = u.id
         WHERE u.email = $1 AND m.tenant_id = $2
         LIMIT 1`,
        [googleUser.email, tenantId]
      );

      if (emailMatch[0]) {
        // Existing user matched by email — link Google account
        userId = emailMatch[0].id;
        role = emailMatch[0].role;
        userEmail = emailMatch[0].email;

        await fastify.db.query(
          `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
           VALUES ($1, 'google', $2, $3, $4, $5)
           ON CONFLICT (provider, provider_user_id) DO NOTHING`,
          [
            userId,
            googleUser.sub,
            googleUser.email,
            googleUser.name ?? null,
            googleUser.picture ?? null,
          ]
        );
      } else {
        // --- New user: create account ---
        isNewUser = true;

        const newUser = await fastify.db.tx(async (client) => {
          const result = await client.query(
            `INSERT INTO users (email, password_hash, display_name, email_verified_at)
             VALUES ($1, NULL, $2, NOW())
             RETURNING id, email`,
            [googleUser.email, googleUser.name ?? null]
          );
          const user = result.rows[0] as { id: string; email: string };

          await client.query(
            `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'member')`,
            [user.id, tenantId]
          );

          await client.query(
            `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
             VALUES ($1, 'google', $2, $3, $4, $5)`,
            [
              user.id,
              googleUser.sub,
              googleUser.email,
              googleUser.name ?? null,
              googleUser.picture ?? null,
            ]
          );

          return user;
        });

        userId = newUser.id;
        userEmail = newUser.email;
      }
    }

    // Issue API tokens
    const accessToken = await issueAccessToken(fastify, {
      userId: userId!,
      tenantId,
      role,
      email: userEmail,
    });

    const refreshToken = await issueRefreshToken(fastify, {
      userId: userId!,
      tenantId,
      role,
      email: userEmail,
    });

    // Audit log
    await writeAuditLog(fastify.db, {
      tenantId,
      actorUserId: userId!,
      actionType: isNewUser ? "auth.signup" : "auth.login",
      objectType: "user",
      objectId: userId!,
      details: { method: "google", googleSub: googleUser.sub, email: userEmail },
    });

    // Generate one-time code containing session data
    const oneTimeCode = createSignedStateToken(
      {
        kind: "google_auth_complete",
        userId: userId!,
        email: userEmail,
        tenantId,
        role,
        accessToken,
        refreshToken,
        isNewUser,
      },
      fastify.config.JWT_ACCESS_SECRET,
      300, // 5-minute TTL
    );

    return reply.redirect(
      `${frontendUrl}/api/auth/google/complete?code=${encodeURIComponent(oneTimeCode)}`
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /google/link — Link Google account to current user
  // ─────────────────────────────────────────────────────────────────
  fastify.post(
    "/google/link",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = GoogleLinkBodySchema.parse(request.body);
      const user = request.user;

      // Verify the token by fetching Google userinfo
      let googleUser: GoogleUserInfo;
      try {
        googleUser = await fetchGoogleUserInfo(body.idToken);
      } catch {
        throw fastify.httpErrors.badRequest("Invalid Google token.");
      }

      // Check if Google account already linked to a different user
      const existingLink = await fastify.db.query<{ user_id: string }>(
        `SELECT user_id FROM user_oauth_accounts
         WHERE provider = 'google' AND provider_user_id = $1
         LIMIT 1`,
        [googleUser.sub]
      );

      if (existingLink[0] && existingLink[0].user_id !== user.userId) {
        throw fastify.httpErrors.conflict(
          "This Google account is already linked to a different user."
        );
      }

      if (existingLink[0]?.user_id === user.userId) {
        return reply.send({ linked: true, email: googleUser.email });
      }

      await fastify.db.query(
        `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
         VALUES ($1, 'google', $2, $3, $4, $5)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [
          user.userId,
          googleUser.sub,
          googleUser.email,
          googleUser.name ?? null,
          googleUser.picture ?? null,
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actionType: "auth.google.link",
        objectType: "user_oauth_account",
        objectId: user.userId,
        details: { googleSub: googleUser.sub, email: googleUser.email },
      });

      return reply.send({ linked: true, email: googleUser.email });
    }
  );

  // ─────────────────────────────────────────────────────────────────
  // POST /google/unlink — Unlink Google account from current user
  // ─────────────────────────────────────────────────────────────────
  fastify.post(
    "/google/unlink",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user;

      // Block if user has no password (would lock them out)
      const userRow = await fastify.db.query<{ password_hash: string | null }>(
        `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
        [user.userId]
      );

      if (!userRow[0]?.password_hash) {
        throw fastify.httpErrors.conflict(
          "Cannot unlink Google — you have no password set. Set a password first."
        );
      }

      const deleted = await fastify.db.query<{ id: string }>(
        `DELETE FROM user_oauth_accounts
         WHERE user_id = $1 AND provider = 'google'
         RETURNING id`,
        [user.userId]
      );

      if (deleted.length === 0) {
        throw fastify.httpErrors.notFound("No Google account linked.");
      }

      await writeAuditLog(fastify.db, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actionType: "auth.google.unlink",
        objectType: "user_oauth_account",
        objectId: user.userId,
      });

      return reply.send({ unlinked: true });
    }
  );
};
