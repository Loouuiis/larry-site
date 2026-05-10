import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  clearApiTokensCookieOptions,
  clearLarryCsrfCookieLegacyOptions,
  clearSessionCookieOptions,
  getSession,
} from "@/lib/auth";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger("auth.logout");

function getApiBaseUrl(): string | null {
  return process.env.LARRY_API_BASE_URL?.replace(/\/+$/, "") ?? null;
}

export async function POST() {
  const session = await getSession();
  const apiBaseUrl = getApiBaseUrl();

  if (session && apiBaseUrl && (session.apiAccessToken || session.apiRefreshToken)) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (session.apiAccessToken) {
      headers.Authorization = `Bearer ${session.apiAccessToken}`;
    }

    if (session.apiRefreshToken) {
      headers["x-current-token-hash"] = createHash("sha256")
        .update(session.apiRefreshToken)
        .digest("hex");
    }

    try {
      await fetch(`${apiBaseUrl}/v1/auth/logout`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          refreshToken: session.apiRefreshToken,
          tenantId: session.tenantId,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      logger.warn("API token revocation failed", { err });
    }
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(clearSessionCookieOptions());
  res.cookies.set(clearApiTokensCookieOptions());
  res.cookies.set(clearLarryCsrfCookieLegacyOptions());
  return res;
}
