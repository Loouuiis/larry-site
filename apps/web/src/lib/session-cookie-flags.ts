// Edge-compatible cookie option helpers (no Node crypto). Shared by middleware
// and Node route handlers via auth/session flows.

export const SESSION_COOKIE_NAME = "larry_session";
export const API_TOKENS_COOKIE_NAME = "larry_api_tokens";
/** Deprecated — kept only so logout / termination can clear orphaned values. */
export const LEGACY_CSRF_COOKIE_NAME = "larry_csrf";

function prodSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function clearSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true as const,
    secure: prodSecure(),
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

export function clearApiTokensCookieOptions() {
  return {
    name: API_TOKENS_COOKIE_NAME,
    value: "",
    httpOnly: true as const,
    secure: prodSecure(),
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

export function clearLarryCsrfCookieLegacyOptions() {
  return {
    name: LEGACY_CSRF_COOKIE_NAME,
    value: "",
    httpOnly: false as const,
    secure: prodSecure(),
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}
