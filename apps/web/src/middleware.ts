import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/session-secret";
import { CSRF_HEADER, isCsrfExempt, isMutatingMethod } from "@/lib/csrf";

const SESSION_COOKIE = "larry_session";
const SESSION_DURATION_SECS = 24 * 60 * 60; // 24 hours
const SLIDING_REFRESH_THRESHOLD_SECS = 12 * 60 * 60; // reissue if < 12h remaining

// Pages that must be reachable without a session. Still run through
// pageMiddleware so that when a session DOES exist (e.g. right after
// /api/auth/signup or /api/auth/google/complete minted one), we mirror
// the session's csrfToken into the readable larry_csrf cookie before
// the signup wizard fires its first mutating /api/** call.
const PUBLIC_AUTH_PAGES: ReadonlySet<string> = new Set([
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-email-required",
  "/confirm-email-change",
]);

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return apiMiddleware(req);
  }
  return pageMiddleware(req);
}

// ── /api/** CSRF enforcement ───────────────────────────────────────────────
// Runs only for /api/** mutating methods. Exempt bootstrap routes that
// cannot have a token yet (login/signup/invite accept etc.). Unauth'd
// mutating requests fall through so the API route returns a normal 401.
async function apiMiddleware(req: NextRequest) {
  if (!isMutatingMethod(req.method)) return NextResponse.next();
  if (isCsrfExempt(req.nextUrl.pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.next();

  let secret: Uint8Array;
  try {
    secret = getSessionSecret();
  } catch {
    return NextResponse.next();
  }

  let sessionCsrf: string | null = null;
  try {
    const { payload } = await jwtVerify(token, secret);
    sessionCsrf =
      typeof payload.csrfToken === "string" ? payload.csrfToken : null;
  } catch {
    return NextResponse.next();
  }

  if (!sessionCsrf) {
    return NextResponse.json(
      { error: "CSRF token missing from session. Please sign in again." },
      { status: 403 },
    );
  }

  const presented = req.headers.get(CSRF_HEADER) ?? req.headers.get("X-CSRF-Token");
  if (!presented || presented !== sessionCsrf) {
    return NextResponse.json(
      { error: "Invalid CSRF token." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

// ── Page-level session gate (existing behaviour) ────────────────────────────
async function pageMiddleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const isPublicAuth = PUBLIC_AUTH_PAGES.has(req.nextUrl.pathname);

  if (!token) {
    // Unauth'd visit to a public auth page (signup, login, etc.) — just
    // render. No CSRF cookie to mirror yet.
    if (isPublicAuth) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let secret: Uint8Array;
  try {
    secret = getSessionSecret();
  } catch {
    // SESSION_SECRET misconfigured in production — fail closed
    const res = isPublicAuth
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
    return res;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const res = NextResponse.next();

    // CSRF double-submit cookie: mirror the session-bound CSRF token
    // into a non-httpOnly cookie so the client can echo it back on
    // mutating /api/** requests (enforced by apiMiddleware above).
    if (payload.csrfToken) {
      res.cookies.set({
        name: "larry_csrf",
        value: String(payload.csrfToken),
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }

    // Sliding refresh: reissue the session JWT if less than 12 hours remain,
    // so active users never get logged out unexpectedly.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp - now < SLIDING_REFRESH_THRESHOLD_SECS) {
      const { exp: _exp, iat: _iat, ...claims } = payload;
      const refreshed = await new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DURATION_SECS}s`)
        .sign(secret);
      res.cookies.set({
        name: SESSION_COOKIE,
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
    // Token expired or tampered — clear cookie. On public auth pages
    // just render (no redirect-loop on /login itself); elsewhere send
    // the user to /login.
    const res = isPublicAuth
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
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
  ],
};
