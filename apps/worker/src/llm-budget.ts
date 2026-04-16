import { getWorkerEnv } from "@larry/config";
import {
  reserveTokens as reserveTokensCore,
  reconcileTokens as reconcileTokensCore,
  type BudgetStore,
  type ReserveParams,
  type TokenReservation,
} from "@larry/ai/budget";
import { getRedis } from "./redis.js";

export { LLMQuotaError, type TokenReservation } from "@larry/ai/budget";

function store(): BudgetStore {
  const redis = getRedis();
  return {
    incrBy: (key, delta) => redis.incrby(key, delta),
    expire: async (key, seconds) => {
      await redis.expire(key, seconds);
    },
  };
}

export async function reserveTokens(params: ReserveParams): Promise<TokenReservation> {
  const env = getWorkerEnv();
  return reserveTokensCore(store(), {
    enabled: env.LLM_BUDGET_ENABLED,
    tenantDailyTokens: env.LLM_TENANT_DAILY_TOKENS,
    globalDailyTokens: env.LLM_GLOBAL_DAILY_TOKENS,
  }, params);
}

export async function reconcileTokens(reservation: TokenReservation, actualTokens: number): Promise<void> {
  return reconcileTokensCore(store(), reservation, actualTokens);
}
