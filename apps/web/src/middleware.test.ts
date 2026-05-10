import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

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
  const mod = await import("./middleware");
  return mod.middleware;
}

function apiReq(path: string, method: string, opts: { sessionJwt?: string } = {}): NextRequest {
  const headers = new Headers();
  const cookies: string[] = [];
  if (opts.sessionJwt) cookies.push(`larry_session=${opts.sessionJwt}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return new NextRequest(new Request(`https://larry-pm.com${path}`, { method, headers }));
}

describe("middleware — /api/** passes through", () => {
  it("does not gate mutating /api/** requests (SameSite=Lax session cookie protects CSRF)", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1" });
    const res = await middleware(apiReq("/api/workspace/tasks", "POST", { sessionJwt: jwt }));
    expect(res.status).toBe(200);
  });

  it("passes GET /api/**", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1" });
    const res = await middleware(apiReq("/api/workspace/tasks", "GET", { sessionJwt: jwt }));
    expect(res.status).toBe(200);
  });

  it("allows unauthenticated mutating /api/** calls to reach the route (401 from handler)", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(apiReq("/api/workspace/tasks", "POST"));
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

  it("injects Cross-Origin-Resource-Policy: same-origin + restrictive Permissions-Policy on /login", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(pageReq("/login"));
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    const pp = res.headers.get("Permissions-Policy") ?? "";
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/microphone=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
    expect(pp).toMatch(/payment=\(\)/);
    expect(pp).toMatch(/usb=\(\)/);
    expect(pp).toMatch(/publickey-credentials-create=\(self\)/);
    expect(pp).toMatch(/publickey-credentials-get=\(self\)/);
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
    const jwt = await makeSessionJwt({ sub: "u1" });
    const res = await middleware(pageReq("/login", { sessionJwt: jwt }));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("does NOT inject auth headers on workspace pages", async () => {
    const middleware = await loadMiddleware();
    const jwt = await makeSessionJwt({ sub: "u1" });
    const res = await middleware(pageReq("/workspace", { sessionJwt: jwt }));
    expect(res.headers.get("X-Frame-Options")).toBeNull();
  });
});
