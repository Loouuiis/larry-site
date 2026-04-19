import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { CSRF_HEADER } from "@/lib/csrf";

// Ensure SESSION_SECRET is present before middleware imports session-secret.
beforeAll(() => {
  process.env.SESSION_SECRET = "a".repeat(48);
});

async function makeSessionJwt(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function loadMiddleware() {
  // Import after env is set.
  const mod = await import("./middleware");
  return mod.middleware;
}

function apiReq(
  path: string,
  method: string,
  opts: { sessionJwt?: string; csrfHeader?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.csrfHeader) headers.set(CSRF_HEADER, opts.csrfHeader);
  const cookies: string[] = [];
  if (opts.sessionJwt) cookies.push(`larry_session=${opts.sessionJwt}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return new NextRequest(new Request(`https://larry-pm.com${path}`, { method, headers }));
}

describe("middleware — CSRF gating on /api/**", () => {
  it("blocks mutating /api/** request without header (session present)", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(apiReq("/api/workspace/tasks", "POST", { sessionJwt: jwt }));
    expect(res.status).toBe(403);
  });

  it("blocks mutating /api/** request with wrong header", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(
      apiReq("/api/workspace/tasks", "POST", { sessionJwt: jwt, csrfHeader: "wrong" }),
    );
    expect(res.status).toBe(403);
  });

  it("passes mutating /api/** request with matching header", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(
      apiReq("/api/workspace/tasks", "POST", { sessionJwt: jwt, csrfHeader: "tok-A" }),
    );
    // NextResponse.next() has no explicit status; default is 200.
    expect(res.status).toBe(200);
  });

  it("passes GET /api/** regardless of header", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(apiReq("/api/workspace/tasks", "GET", { sessionJwt: jwt }));
    expect(res.status).toBe(200);
  });

  it("passes exempt routes without header (login / signup / accept / redeem / password reset / verify)", async () => {
    const middleware = await loadMiddleware();
    for (const path of [
      "/api/auth/login",
      "/api/auth/signup",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/verify-email",
      "/api/auth/logout",
      "/api/invitations/abc/accept",
      "/api/invite-links/xyz/redeem",
    ]) {
      const res = await middleware(apiReq(path, "POST"));
      expect(res.status).toBe(200);
    }
  });

  it("lets unauth'd mutating /api/** calls fall through (no session → route handles 401)", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(apiReq("/api/workspace/tasks", "POST"));
    // No session cookie → middleware passes through to the route,
    // which will 401. Middleware status here is 200 (NextResponse.next()).
    expect(res.status).toBe(200);
  });
});

function pageReq(path: string, opts: { sessionJwt?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.sessionJwt) headers.set("cookie", `larry_session=${opts.sessionJwt}`);
  return new NextRequest(new Request(`https://larry-pm.com${path}`, { method: "GET", headers }));
}

describe("middleware — P2-6 auth page security headers", () => {
  it("injects X-Frame-Options: DENY + Referrer-Policy: no-referrer on /login (unauth)", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(pageReq("/login"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("injects headers on /signup, /forgot-password, /reset-password, /verify-email, /confirm-email-change", async () => {
    const middleware = await loadMiddleware();
    for (const path of [
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/confirm-email-change",
    ]) {
      const res = await middleware(pageReq(path));
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("injects headers on /login even when a valid session exists (authed user hitting /login)", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(pageReq("/login", { sessionJwt: jwt }));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("does NOT inject auth headers on workspace pages", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1", csrfToken: "tok-A" });
    const res = await middleware(pageReq("/workspace", { sessionJwt: jwt }));
    expect(res.headers.get("X-Frame-Options")).toBeNull();
  });
});
