import Redis from "ioredis";
import { createServerLogger } from "@/lib/server-logger";

const MAX_ATTEMPTS = 5;
const WINDOW_SECS = 15 * 60; // 15 minutes
const logger = createServerLogger("web.rate-limit");

export interface RateLimitOptions {
  namespace: string;
  identifier: string;
  max: number;
  windowSecs: number;
}

// --- Redis client (Vercel Node.js serverless — not Edge) ---
//
// This module is a UX nicety. The Larry API (Railway) is the source of
// truth for auth rate limits — see apps/api/src/routes/v1/auth.ts. The
// purpose of the web-side check is to short-circuit obvious abuse at
// the edge so the browser sees a friendly 429 quickly instead of a
// proxied API response.
//
// Without Redis we cannot enforce a distributed limit on Vercel
// (in-memory state is per-invocation), and the previous in-memory
// fallback gave a false sense of safety. We now no-op silently —
// the API still rejects abuse, just one network hop later.

let _redis: Redis | null = null;
let warnedNoRedis = false;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) {
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      logger.warn(
        "REDIS_URL is not set; web-side throttle is disabled. API limits still apply.",
      );
    }
    return null;
  }
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      lazyConnect: true,
    });
    // Suppress unhandled error events; errors surface through try/catch in callers
    _redis.on("error", () => {});
  }
  return _redis;
}

function normalizeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_.@-]/g, "_").slice(0, 200) || "unknown";
}

// --- Public API ---

export async function checkNamedRateLimit({
  namespace,
  identifier,
  max,
  windowSecs,
}: RateLimitOptions): Promise<{ limited: boolean }> {
  const r = getRedis();
  if (!r) return { limited: false };
  try {
    const key = `ratelimit:${normalizeKeyPart(namespace)}:${normalizeKeyPart(identifier)}`;
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, windowSecs);
    return { limited: count > max };
  } catch {
    // Redis unreachable — fall through to a permit. The Larry API will
    // still reject auth abuse via its own (Redis-backed) limiter.
    return { limited: false };
  }
}

export async function checkRateLimit(ip: string): Promise<{ limited: boolean }> {
  return checkNamedRateLimit({
    namespace: "login",
    identifier: ip,
    max: MAX_ATTEMPTS,
    windowSecs: WINDOW_SECS,
  });
}

// no-op: attempt counting is now handled atomically inside checkRateLimit
export async function recordLoginAttempt(_ip: string): Promise<void> {
  void _ip;
}
