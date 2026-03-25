import Redis from "ioredis";

const MAX_ATTEMPTS = 5;
const WINDOW_SECS = 15 * 60; // 15 minutes

// --- Redis client (Vercel Node.js serverless — not Edge) ---

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
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

// --- In-memory fallback ---
// WARNING: Vercel serverless functions are stateless — the in-memory store is NOT
// shared across concurrent function invocations. This fallback is acceptable for
// local dev and low-traffic deploys but does not enforce limits at scale.
// Set REDIS_URL in Vercel env vars to enable distributed rate limiting.

const memStore = new Map<string, { count: number; windowStart: number }>();

function checkMemory(ip: string): { limited: boolean } {
  const now = Date.now();
  const entry = memStore.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_SECS * 1000) {
    memStore.set(ip, { count: 1, windowStart: now });
    return { limited: false };
  }
  entry.count += 1;
  return { limited: entry.count > MAX_ATTEMPTS };
}

// --- Public API ---

// checkRateLimit both checks AND records the attempt atomically.
// The separate recordLoginAttempt export is kept for API compatibility but is a no-op.

export async function checkRateLimit(ip: string): Promise<{ limited: boolean }> {
  const r = getRedis();
  if (r) {
    try {
      const key = `ratelimit:login:${ip}`;
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, WINDOW_SECS);
      return { limited: count > MAX_ATTEMPTS };
    } catch {
      // Redis unavailable — fall through to in-memory
    }
  }
  return checkMemory(ip);
}

// no-op: attempt counting is now handled atomically inside checkRateLimit
export async function recordLoginAttempt(_ip: string): Promise<void> {}
