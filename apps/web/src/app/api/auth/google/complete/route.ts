import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * Verify the HMAC-signed one-time code from the API's Google OAuth callback.
 * Uses the same createSignedStateToken / verifySignedStateToken scheme as the API
 * (HMAC-SHA256 + base64url payload).
 */
function verifyOneTimeCode(
  token: string,
  secret: string
): Record<string, unknown> {

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid code format");
  }

  const expected = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url") as string;

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (
    expectedBuf.length !== signatureBuf.length ||
    !timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    throw new Error("Invalid code signature");
  }

  const parsed = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as { exp?: number } & Record<string, unknown>;

  if (
    typeof parsed.exp !== "number" ||
    Math.floor(Date.now() / 1000) > parsed.exp
  ) {
    throw new Error("Expired code");
  }

  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(new URL("/login?error=google_missing_code", req.url));
    }

    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      console.error("[google/complete] JWT_ACCESS_SECRET not set");
      return NextResponse.redirect(new URL("/login?error=config", req.url));
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifyOneTimeCode(code, secret);
    } catch (err) {
      console.error("[google/complete] code verification failed:", err);
      return NextResponse.redirect(new URL("/login?error=google_invalid_code", req.url));
    }

    if (payload.kind !== "google_auth_complete") {
      return NextResponse.redirect(new URL("/login?error=google_invalid_code", req.url));
    }

    const userId = String(payload.userId);
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const tenantId = typeof payload.tenantId === "string" ? payload.tenantId : undefined;
    const role = typeof payload.role === "string" ? payload.role : undefined;
    const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : undefined;
    const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : undefined;
    const isNewUser = payload.isNewUser === true;

    const { token: sessionToken, csrfToken } = await createSessionToken({
      userId,
      email,
      tenantId,
      role,
      apiAccessToken: accessToken,
      apiRefreshToken: refreshToken,
      authMode: "api",
    });

    const destination = isNewUser ? "/signup?step=role" : "/workspace";
    const res = NextResponse.redirect(new URL(destination, req.url));
    res.cookies.set(sessionCookieOptions(sessionToken));
    res.cookies.set(csrfCookieOptions(csrfToken));
    return res;
  } catch (err) {
    console.error("[google/complete]", err);
    return NextResponse.redirect(new URL("/login?error=google_unexpected", req.url));
  }
}
