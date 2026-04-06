import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/session-secret";

const SESSION_COOKIE = "larry_session";
const SESSION_DURATION_SECS = 24 * 60 * 60; // 24 hours
const SLIDING_REFRESH_THRESHOLD_SECS = 12 * 60 * 60; // reissue if < 12h remaining

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let secret: Uint8Array;
  try {
    secret = getSessionSecret();
  } catch {
    // SESSION_SECRET misconfigured in production — fail closed
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
    return res;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const res = NextResponse.next();

    // CSRF double-submit cookie: expose the CSRF token to frontend JS.
    // NOTE: The cookie is set here but X-CSRF-Token header validation is intentionally
    // deferred. All mutating BFF routes are same-origin server-to-server calls and the
    // session cookie uses sameSite:"lax", so the actual CSRF risk is low.
    // TODO: Add CSRF validation middleware that checks X-CSRF-Token header against this
    // cookie value once the frontend starts sending the header on mutating requests.
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
    // Token expired or tampered — clear and redirect
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
    return res;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*", "/admin/:path*"],
};
