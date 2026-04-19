import { createHash } from "node:crypto";

// NIST SP 800-63B recommends rejecting passwords that appear in breach
// corpora. HaveIBeenPwned's Pwned Passwords range API exposes this
// privacy-preservingly: SHA-1 the password, send only the first 5 hex
// chars, get back the list of full hashes matching that prefix. The
// full password (or full hash) never leaves our process.
//
// Docs: https://haveibeenpwned.com/API/v3#PwnedPasswords
//
// P2-2, login audit 2026-04-19.

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

// In-memory prefix cache (per-instance). HIBP already serves Cache-Control,
// but reaching it adds ~100ms and the prefix space (16^5 ≈ 1M buckets)
// means the realistic working set for one Fastify instance is tiny.
const cache = new Map<string, { body: string; expiresAt: number }>();

export class PasswordBreachedError extends Error {
  readonly count: number;
  constructor(count: number) {
    super(
      "This password has appeared in a known data breach. Please choose a different one.",
    );
    this.name = "PasswordBreachedError";
    this.count = count;
  }
}

export interface CheckOptions {
  /**
   * Minimum occurrence count to treat as "breached". Passwords that
   * appear exactly once in HIBP could plausibly be a user who got
   * their own account breached elsewhere — rejecting those adds
   * friction without much value. Threshold of 1 = reject anything
   * in HIBP at all; default is 1 (strictest).
   */
  minCount?: number;
  /** Override fetch for testing. */
  fetcher?: typeof fetch;
  /** Override the current time for cache tests. */
  now?: () => number;
}

function sha1Hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex").toUpperCase();
}

async function fetchPrefix(
  prefix: string,
  fetcher: typeof fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetcher(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HIBP responded ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function getBreachCount(
  password: string,
  opts: CheckOptions = {},
): Promise<number> {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;

  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const cached = cache.get(prefix);
  let body: string;
  if (cached && cached.expiresAt > now()) {
    body = cached.body;
  } else {
    body = await fetchPrefix(prefix, fetcher);
    cache.set(prefix, { body, expiresAt: now() + CACHE_TTL_MS });
  }

  // Response format: one "SUFFIX:count" per line, CRLF-separated.
  // Suffixes are uppercase. Lines with count=0 are HIBP padding entries
  // (Add-Padding: true); we only care about rows whose suffix matches.
  for (const line of body.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    if (line.slice(0, idx) === suffix) {
      const count = Number.parseInt(line.slice(idx + 1), 10);
      return Number.isFinite(count) ? count : 0;
    }
  }
  return 0;
}

/**
 * Throws PasswordBreachedError if the password is in HIBP.
 *
 * Non-fatal on transport / HIBP-side failures — better to let a user
 * set a password than brick signup because HIBP is down. Failures are
 * logged by the caller.
 */
export async function assertPasswordNotBreached(
  password: string,
  opts: CheckOptions = {},
): Promise<void> {
  const min = opts.minCount ?? 1;
  try {
    const count = await getBreachCount(password, opts);
    if (count >= min) {
      throw new PasswordBreachedError(count);
    }
  } catch (err) {
    if (err instanceof PasswordBreachedError) throw err;
    // Transport / timeout / non-2xx — swallow. Signup shouldn't fail
    // because an external service is flaky.
    return;
  }
}

/** Test-only. Clears the prefix cache between runs. */
export function __resetBreachCacheForTests(): void {
  cache.clear();
}
