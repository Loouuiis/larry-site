import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/session-secret";
import {
  clearApiTokensCookieOptions,
  clearLarryCsrfCookieLegacyOptions,
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/session-cookie-flags";

const SESSION_DURATION_SECS = 24 * 60 * 60; // 24 hours
const SLIDING_REFRESH_THRESHOLD_SECS = 12 * 60 * 60; // reissue if < 12h remaining

// Paths that serve the user's credentials or account-recovery flows. We
// harden these against clickjacking (X-Frame-Options) and referrer leaks
// (Referrer-Policy). Login audit P2-6.
const AUTH_CREDENTIAL_PAGES: ReadonlySet<string> = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-email-required",
  "/confirm-email-change",
  "/mfa/enrol",
]);

// Pages that must be reachable without a session.
const PUBLIC_AUTH_PAGES: ReadonlySet<string> = new Set([
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-email-required",
  "/confirm-email-change",
  "/mfa/enrol",
]);

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  return pageMiddleware(req);
}

const AUTH_PAGE_PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "gamepad=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "identity-credentials-get=()",
  "idle-detection=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "otp-credentials=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-create=(self)",
  "publickey-credentials-get=(self)",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "web-share=()",
  "xr-spatial-tracking=()",
].join(", ");

function applyAuthPageSecurityHeaders(res: NextResponse, pathname: string) {
  if (!AUTH_CREDENTIAL_PAGES.has(pathname)) return;
  if (pathname.startsWith("/invite/")) return;
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Permissions-Policy", AUTH_PAGE_PERMISSIONS_POLICY);
}

async function pageMiddleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isPublicAuth = PUBLIC_AUTH_PAGES.has(req.nextUrl.pathname);

  if (!token) {
    if (isPublicAuth) {
      const res = NextResponse.next();
      applyAuthPageSecurityHeaders(res, req.nextUrl.pathname);
      return res;
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let secret: Uint8Array;
  try {
    secret = getSessionSecret();
  } catch {
    const res = isPublicAuth
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(clearSessionCookieOptions());
    res.cookies.set(clearApiTokensCookieOptions());
    res.cookies.set(clearLarryCsrfCookieLegacyOptions());
    applyAuthPageSecurityHeaders(res, req.nextUrl.pathname);
    return res;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const res = NextResponse.next();
    applyAuthPageSecurityHeaders(res, req.nextUrl.pathname);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp - now < SLIDING_REFRESH_THRESHOLD_SECS) {
      const { exp: _exp, iat: _iat, ...claims } = payload;
      const refreshed = await new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DURATION_SECS}s`)
        .sign(secret);
      res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: refreshed,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION_SECS,
        path: "/",
      });
    }

    return res;
  } catch {
    const res = isPublicAuth
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(clearSessionCookieOptions());
    res.cookies.set(clearApiTokensCookieOptions());
    res.cookies.set(clearLarryCsrfCookieLegacyOptions());
    applyAuthPageSecurityHeaders(res, req.nextUrl.pathname);
    return res;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/workspace/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/signup",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/verify-email-required",
    "/confirm-email-change",
    "/mfa/enrol",
  ],
};
