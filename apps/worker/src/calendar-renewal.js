import { createHmac, randomUUID } from "node:crypto";
import { db, env } from "./context.js";
// Renew Google Calendar watch channels that expire within 5 days.
// Google channels last ~7 days; we renew with 5 days headroom to avoid silent drops.
const RENEWAL_HORIZON_MS = 5 * 24 * 60 * 60 * 1000;
const GOOGLE_CHANNEL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
async function refreshGoogleAccessToken(input) {
    const body = new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
        grant_type: "refresh_token",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google OAuth refresh failed: ${response.status} ${text}`);
    }
    const payload = (await response.json());
    return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: payload.expires_in
            ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
            : undefined,
    };
}
async function renewWatchChannel(input) {
    const channelId = randomUUID();
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/watch`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: channelId,
            type: "web_hook",
            address: input.webhookUrl,
            token: input.channelToken,
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google watch renew failed: ${response.status} ${text}`);
    }
    const payload = (await response.json());
    return {
        channelId: payload.id,
        resourceId: payload.resourceId,
        expiration: payload.expiration,
    };
}
function createSignedStateToken(payload, secret, ttlSeconds = 600) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
}
function createGoogleChannelToken(tenantId, installationId, secret) {
    return createSignedStateToken({ k: "gcalch", t: tenantId, i: installationId }, secret, GOOGLE_CHANNEL_TOKEN_TTL_SECONDS);
}
export async function runCalendarWebhookRenewal() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_WEBHOOK_URL, JWT_ACCESS_SECRET } = env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.log("[calendar-renewal] skipped — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not configured");
        return;
    }
    if (!GOOGLE_CALENDAR_WEBHOOK_URL) {
        console.log("[calendar-renewal] skipped — GOOGLE_CALENDAR_WEBHOOK_URL not configured");
        return;
    }
    if (!JWT_ACCESS_SECRET) {
        console.log("[calendar-renewal] skipped — JWT_ACCESS_SECRET not configured");
        return;
    }
    try {
        const renewalCutoff = new Date(Date.now() + RENEWAL_HORIZON_MS).toISOString();
        // Fetch all active installations expiring within the renewal window (cross-tenant)
        const rows = await db.tx(async (client) => {
            await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
            const r = await client.query(`SELECT id, tenant_id, google_calendar_id, google_access_token, google_refresh_token,
                token_expires_at, webhook_channel_id, webhook_resource_id, webhook_expiration
         FROM google_calendar_installations
         WHERE webhook_channel_id IS NOT NULL
           AND (webhook_expiration IS NULL OR webhook_expiration <= $1)`, [renewalCutoff]);
            return r.rows;
        });
        if (rows.length === 0) {
            console.log("[calendar-renewal] no channels require renewal");
            return;
        }
        let renewed = 0;
        let failed = 0;
        for (const row of rows) {
            try {
                let accessToken = row.google_access_token;
                // Refresh the OAuth token if it's expired or about to expire
                const tokenExpiry = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
                const tokenAboutToExpire = tokenExpiry !== null && tokenExpiry <= Date.now() + 60_000;
                if (tokenAboutToExpire && row.google_refresh_token) {
                    const refreshed = await refreshGoogleAccessToken({
                        clientId: GOOGLE_CLIENT_ID,
                        clientSecret: GOOGLE_CLIENT_SECRET,
                        refreshToken: row.google_refresh_token,
                    });
                    accessToken = refreshed.accessToken;
                    await db.queryTenant(row.tenant_id, `UPDATE google_calendar_installations
             SET google_access_token = $3,
                 google_refresh_token = COALESCE($4, google_refresh_token),
                 token_expires_at = $5,
                 updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2`, [
                        row.tenant_id,
                        row.id,
                        refreshed.accessToken,
                        refreshed.refreshToken ?? null,
                        refreshed.expiresAt ?? null,
                    ]);
                }
                const channelToken = createGoogleChannelToken(row.tenant_id, row.id, JWT_ACCESS_SECRET);
                const watch = await renewWatchChannel({
                    accessToken,
                    calendarId: row.google_calendar_id,
                    channelToken,
                    webhookUrl: GOOGLE_CALENDAR_WEBHOOK_URL,
                });
                const expirationIso = watch.expiration
                    ? new Date(Number(watch.expiration)).toISOString()
                    : null;
                await db.queryTenant(row.tenant_id, `UPDATE google_calendar_installations
           SET webhook_channel_id = $3,
               webhook_resource_id = $4,
               webhook_expiration = $5,
               updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`, [row.tenant_id, row.id, watch.channelId, watch.resourceId, expirationIso]);
                console.log(`[calendar-renewal] renewed tenant=${row.tenant_id} calendar=${row.google_calendar_id} ` +
                    `newChannel=${watch.channelId} expiry=${expirationIso ?? "unknown"}`);
                renewed++;
            }
            catch (err) {
                console.error(`[calendar-renewal] failed for installation id=${row.id} tenant=${row.tenant_id}`, err);
                failed++;
            }
        }
        console.log(`[calendar-renewal] complete — renewed=${renewed} failed=${failed}`);
    }
    catch (err) {
        console.error("[calendar-renewal] error", err);
    }
}
