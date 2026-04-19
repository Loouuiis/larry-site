import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  CSRF_HEADER,
  fetchWithCsrf,
  installCsrfFetchPatch,
  isCsrfExempt,
  isMutatingMethod,
  readCsrfCookie,
} from "./csrf";

describe("isMutatingMethod", () => {
  it("treats POST/PUT/PATCH/DELETE as mutating", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "delete"]) {
      expect(isMutatingMethod(m)).toBe(true);
    }
  });
  it("treats GET/HEAD/OPTIONS and empty as non-mutating", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "", undefined, null]) {
      expect(isMutatingMethod(m)).toBe(false);
    }
  });
});

describe("isCsrfExempt", () => {
  it("exempts bootstrap auth routes", () => {
    expect(isCsrfExempt("/api/auth/login")).toBe(true);
    expect(isCsrfExempt("/api/auth/signup")).toBe(true);
    expect(isCsrfExempt("/api/auth/logout")).toBe(true);
    expect(isCsrfExempt("/api/auth/verify-email")).toBe(true);
    expect(isCsrfExempt("/api/auth/forgot-password")).toBe(true);
    expect(isCsrfExempt("/api/auth/reset-password")).toBe(true);
  });
  it("exempts invite accept + invite-link redeem only (not create / revoke)", () => {
    expect(isCsrfExempt("/api/invitations/abc/accept")).toBe(true);
    expect(isCsrfExempt("/api/invite-links/xyz/redeem")).toBe(true);
    expect(isCsrfExempt("/api/invitations")).toBe(false);
    expect(isCsrfExempt("/api/workspace/invitations/123/revoke")).toBe(false);
    expect(isCsrfExempt("/api/workspace/invite-links/456/revoke")).toBe(false);
  });
  it("does NOT exempt routes that look similar", () => {
    expect(isCsrfExempt("/api/workspace/tasks")).toBe(false);
    expect(isCsrfExempt("/api/auth/change-password")).toBe(false);
    expect(isCsrfExempt("/api/auth/switch-tenant")).toBe(false);
    expect(isCsrfExempt("/api/auth/login/extra")).toBe(false);
  });
});

describe("readCsrfCookie", () => {
  afterEach(() => {
    // @ts-expect-error cleanup
    delete globalThis.document;
  });
  it("returns null when no document", () => {
    expect(readCsrfCookie()).toBeNull();
  });
  it("parses larry_csrf cookie value", () => {
    // @ts-expect-error stub
    globalThis.document = { cookie: "foo=bar; larry_csrf=abc123; baz=qux" };
    expect(readCsrfCookie()).toBe("abc123");
  });
  it("returns null when cookie absent", () => {
    // @ts-expect-error stub
    globalThis.document = { cookie: "foo=bar" };
    expect(readCsrfCookie()).toBeNull();
  });
  it("decodes URI-encoded values", () => {
    // @ts-expect-error stub
    globalThis.document = { cookie: "larry_csrf=" + encodeURIComponent("a b/c") };
    expect(readCsrfCookie()).toBe("a b/c");
  });
});

describe("fetchWithCsrf", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error stub
    globalThis.document = { cookie: "larry_csrf=tok-123" };
    // @ts-expect-error stub
    globalThis.window = { location: { origin: "https://larry-pm.com" } };
  });
  afterEach(() => {
    // @ts-expect-error cleanup
    delete globalThis.document;
    // @ts-expect-error cleanup
    delete globalThis.window;
  });

  it("adds header on mutating /api/** request", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await fetchWithCsrf("/api/workspace/tasks", { method: "POST" });
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get(CSRF_HEADER)).toBe("tok-123");
  });

  it("skips header on GET", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await fetchWithCsrf("/api/workspace/tasks");
    const init = spy.mock.calls[0][1];
    if (init) {
      const headers = new Headers(init.headers as HeadersInit);
      expect(headers.get(CSRF_HEADER)).toBeNull();
    }
  });

  it("skips header on non-/api/** URL", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await fetchWithCsrf("https://external.example.com/foo", { method: "POST" });
    const init = spy.mock.calls[0][1] as RequestInit;
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      expect(headers.get(CSRF_HEADER)).toBeNull();
    }
  });

  it("no-ops when cookie missing", async () => {
    // @ts-expect-error stub
    globalThis.document = { cookie: "" };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await fetchWithCsrf("/api/workspace/tasks", { method: "POST" });
    const init = spy.mock.calls[0][1] as RequestInit;
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      expect(headers.get(CSRF_HEADER)).toBeNull();
    }
  });

  it("preserves caller-supplied header", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await fetchWithCsrf("/api/x", {
      method: "POST",
      headers: { [CSRF_HEADER]: "explicit" },
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get(CSRF_HEADER)).toBe("explicit");
  });
});

describe("installCsrfFetchPatch", () => {
  it("makes window.fetch inject header on mutating /api/** calls", async () => {
    vi.resetModules();
    const inner = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("window", {
      fetch: inner,
      location: { origin: "https://larry-pm.com" },
    });
    vi.stubGlobal("document", { cookie: "larry_csrf=tok-xyz" });
    const mod = await import("./csrf");
    mod.installCsrfFetchPatch();
    await window.fetch("/api/workspace/tasks", { method: "POST" });
    expect(inner).toHaveBeenCalledTimes(1);
    const init = inner.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get(CSRF_HEADER)).toBe("tok-xyz");
    vi.unstubAllGlobals();
  });

  it("leaves GET requests alone", async () => {
    vi.resetModules();
    const inner = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("window", {
      fetch: inner,
      location: { origin: "https://larry-pm.com" },
    });
    vi.stubGlobal("document", { cookie: "larry_csrf=tok-xyz" });
    const mod = await import("./csrf");
    mod.installCsrfFetchPatch();
    await window.fetch("/api/workspace/tasks");
    const init = inner.mock.calls[0][1];
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      expect(headers.get(CSRF_HEADER)).toBeNull();
    }
    vi.unstubAllGlobals();
  });
});
