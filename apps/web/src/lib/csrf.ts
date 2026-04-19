// Client + server CSRF utilities.
//
// The session JWT carries a per-session `csrfToken`. The root middleware
// mirrors it into a non-httpOnly `larry_csrf` cookie so the browser can
// echo it as an `X-CSRF-Token` header on state-changing requests
// (double-submit cookie pattern).
//
// P1-1, login audit 2026-04-19.

export const CSRF_COOKIE = "larry_csrf";
export const CSRF_HEADER = "x-csrf-token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Request paths that MUST be allowed without a CSRF token because they
// are the bootstrap flows that mint a session in the first place —
// they cannot have a token yet. Every other mutating /api/** route
// requires the header.
//
// Entries support exact strings OR a RegExp so we can exempt dynamic
// segments (e.g. invite tokens) without accidentally exempting sibling
// routes that do require CSRF (e.g. POST /api/invitations which
// CREATES invitations from an authed workspace session).
export const CSRF_EXEMPT_PATTERNS: readonly (string | RegExp)[] = [
  "/api/auth/login",
  "/api/auth/dev-login",
  "/api/auth/mfa/verify",
  "/api/auth/signup",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/send-verification",
  "/api/auth/confirm-email-change",
  "/api/auth/logout",
  /^\/api\/auth\/google(\/|$)/,
  /^\/api\/invitations\/[^/]+\/accept$/,
  /^\/api\/invite-links\/[^/]+\/redeem$/,
  "/api/orgs/request",
  "/api/founder-contact",
  "/api/waitlist",
  "/api/referral",
];

export function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATTERNS.some((pattern) =>
    typeof pattern === "string" ? pathname === pattern : pattern.test(pathname),
  );
}

export function isMutatingMethod(method: string | undefined | null): boolean {
  if (!method) return false;
  return MUTATING_METHODS.has(method.toUpperCase());
}

// ── Client helpers ──────────────────────────────────────────────────────────

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName && rawName.trim() === CSRF_COOKIE) {
      try {
        return decodeURIComponent(rest.join("=").trim());
      } catch {
        return rest.join("=").trim() || null;
      }
    }
  }
  return null;
}

function targetsLocalApi(input: RequestInfo | URL): boolean {
  let url: string;
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input instanceof Request) {
    url = input.url;
  } else {
    return false;
  }
  // Same-origin /api/** call. Absolute URLs to our own origin also count;
  // we conservatively check only relative paths + current origin.
  if (url.startsWith("/api/")) return true;
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin !== window.location.origin) return false;
      return parsed.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  return false;
}

function methodOf(init: RequestInit | undefined, input: RequestInfo | URL): string {
  if (init?.method) return init.method;
  if (input instanceof Request && input.method) return input.method;
  return "GET";
}

// Drop-in fetch wrapper. Adds `X-CSRF-Token` to same-origin /api/**
// requests that use a mutating method. No-op everywhere else.
export async function fetchWithCsrf(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = methodOf(init, input);
  if (!isMutatingMethod(method) || !targetsLocalApi(input)) {
    return fetch(input, init);
  }
  const token = readCsrfCookie();
  if (!token) {
    return fetch(input, init);
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, token);
  }
  return fetch(input, { ...(init ?? {}), headers });
}

// Monkey-patches `window.fetch` so every existing mutating fetch to
// `/api/**` picks up the CSRF header without a call-site migration.
// Idempotent; safe to call from multiple client boundaries.
let patched = false;
export function installCsrfFetchPatch(): void {
  if (typeof window === "undefined") return;
  if (patched) return;
  const original = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = methodOf(init, input);
    if (!isMutatingMethod(method) || !targetsLocalApi(input)) {
      return original(input, init);
    }
    const token = readCsrfCookie();
    if (!token) {
      return original(input, init);
    }
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(CSRF_HEADER)) {
      headers.set(CSRF_HEADER, token);
    }
    return original(input, { ...(init ?? {}), headers });
  }) as typeof window.fetch;
  patched = true;
}
