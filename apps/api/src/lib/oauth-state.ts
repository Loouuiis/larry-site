import { getApiEnv } from "@larry/config";
import { getRedis } from "./redis.js";

const KEY_PREFIX = "oauth:state:";

/**
 * Atomically mark an OAuth state token's jti as consumed.
 * Returns true if this is the first redemption, false if it's a replay.
 *
 * Uses Redis SET NX with a TTL matching the state JWT's own lifetime so
 * expired state tokens don't linger in Redis forever.
 *
 * Signature + expiry checks already happen on the token itself; this
 * closes the last gap: a leaked-but-unexpired state token would otherwise
 * be replayable until the TTL ran out.
 */
export async function claimStateToken(jti: string, ttlSeconds: number): Promise<boolean> {
  const env = getApiEnv();
  if (!env.OAUTH_STATE_SINGLE_USE_ENABLED) return true; // flag-off → no enforcement
  if (!jti) return true; // tokens issued before this change won't have jti — accept once during rollout
  const redis = getRedis();
  const result = await redis.set(
    `${KEY_PREFIX}${jti}`,
    "1",
    "EX",
    Math.max(60, Math.floor(ttlSeconds)),
    "NX",
  );
  return result === "OK";
}
