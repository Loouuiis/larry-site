/**
 * Per-tenant and per-provider LLM token budgets.
 *
 * Pure logic — the consuming app supplies a BudgetStore bound to whatever
 * Redis connection it already has. Keeps this package free of a Redis
 * dependency while still letting apps/api and apps/worker share the same
 * accounting rules (same keys, same TTLs, same reservation semantics).
 *
 * Flow (per LLM call):
 *   1. reserveTokens() atomically INCRs estimated tokens against both a
 *      per-tenant daily counter and a per-provider global daily counter.
 *      Over either limit → DECR rollback → throw LLMQuotaError.
 *   2. Caller runs the LLM request.
 *   3. reconcileTokens() INCRs by (actual - estimated); delta may be
 *      negative and Redis handles signed deltas.
 *
 * If a process crashes between (1) and (3) the estimate stays counted —
 * errs on the safe side (slight over-accounting > quota overshoot).
 */

export interface BudgetStore {
  /** Atomically increment the counter at `key` by `delta` (may be negative). Returns the new value. */
  incrBy(key: string, delta: number): Promise<number>;
  /** Set TTL on the key in whole seconds. Idempotent; safe to call every write. */
  expire(key: string, seconds: number): Promise<void>;
}

export interface TokenBudgetConfig {
  enabled: boolean;
  tenantDailyTokens: number;
  /** Global across all tenants, per provider (e.g. Groq free-tier 100k TPD). */
  globalDailyTokens: number;
}

export interface ReserveParams {
  tenantId: string;
  provider: string;
  estimatedTokens: number;
}

export interface TokenReservation {
  tenantKey: string;
  globalKey: string;
  reservedTokens: number;
  provider: string;
  tenantId: string;
  /** When false, reconcile is a no-op (budget was disabled at reserve time). */
  active: boolean;
}

export class LLMQuotaError extends Error {
  readonly scope: "tenant" | "global";
  readonly limit: number;
  constructor(scope: "tenant" | "global", limit: number) {
    super(`llm quota exceeded: ${scope} (limit=${limit})`);
    this.name = "LLMQuotaError";
    this.scope = scope;
    this.limit = limit;
  }
}

const KEY_TTL_SEC = 48 * 60 * 60; // 48h — a single day key lives through the next day for audit.

function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function tenantKey(tenantId: string, now: Date = new Date()): string {
  return `llm:tok:tenant:${tenantId}:${dayKey(now)}`;
}

export function globalKey(provider: string, now: Date = new Date()): string {
  return `llm:tok:global:${provider}:${dayKey(now)}`;
}

export async function reserveTokens(
  store: BudgetStore,
  config: TokenBudgetConfig,
  params: ReserveParams,
): Promise<TokenReservation> {
  if (!config.enabled) {
    return {
      tenantKey: "",
      globalKey: "",
      reservedTokens: 0,
      provider: params.provider,
      tenantId: params.tenantId,
      active: false,
    };
  }
  if (params.estimatedTokens <= 0) {
    throw new Error("reserveTokens: estimatedTokens must be positive");
  }

  const tKey = tenantKey(params.tenantId);
  const gKey = globalKey(params.provider);

  const tenantTotal = await store.incrBy(tKey, params.estimatedTokens);
  await store.expire(tKey, KEY_TTL_SEC);
  if (tenantTotal > config.tenantDailyTokens) {
    // Roll back our increment. Don't touch global — we haven't incremented it yet.
    await store.incrBy(tKey, -params.estimatedTokens);
    throw new LLMQuotaError("tenant", config.tenantDailyTokens);
  }

  const globalTotal = await store.incrBy(gKey, params.estimatedTokens);
  await store.expire(gKey, KEY_TTL_SEC);
  if (globalTotal > config.globalDailyTokens) {
    // Roll back BOTH keys.
    await store.incrBy(tKey, -params.estimatedTokens);
    await store.incrBy(gKey, -params.estimatedTokens);
    throw new LLMQuotaError("global", config.globalDailyTokens);
  }

  return {
    tenantKey: tKey,
    globalKey: gKey,
    reservedTokens: params.estimatedTokens,
    provider: params.provider,
    tenantId: params.tenantId,
    active: true,
  };
}

export async function reconcileTokens(
  store: BudgetStore,
  reservation: TokenReservation,
  actualTokens: number,
): Promise<void> {
  if (!reservation.active) return;
  const delta = Math.round(actualTokens) - reservation.reservedTokens;
  if (delta === 0) return;
  await store.incrBy(reservation.tenantKey, delta);
  await store.incrBy(reservation.globalKey, delta);
  // TTL was already set at reserve time — no need to re-expire.
}
