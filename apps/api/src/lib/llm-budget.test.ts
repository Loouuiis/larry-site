import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserveTokens as reserveTokensCore,
  reconcileTokens as reconcileTokensCore,
  LLMQuotaError,
  tenantKey,
  globalKey,
  type BudgetStore,
} from "@larry/ai/budget";

// In-memory stand-in for the BudgetStore interface. Exercises the pure
// budget logic without needing Redis.
class FakeStore implements BudgetStore {
  counters = new Map<string, number>();
  ttls = new Map<string, number>();
  async incrBy(key: string, delta: number): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + delta;
    this.counters.set(key, next);
    return next;
  }
  async expire(key: string, seconds: number): Promise<void> {
    this.ttls.set(key, seconds);
  }
}

const cfg = {
  enabled: true,
  tenantDailyTokens: 1_000,
  globalDailyTokens: 2_000,
};

describe("llm-budget — reserve/reconcile", () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("under tenant and global caps: reservation succeeds and counters move", async () => {
    const r = await reserveTokensCore(store, cfg, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 100,
    });
    expect(r.active).toBe(true);
    expect(store.counters.get(r.tenantKey)).toBe(100);
    expect(store.counters.get(r.globalKey)).toBe(100);
  });

  it("over tenant cap: LLMQuotaError('tenant') and tenant counter rolled back", async () => {
    await reserveTokensCore(store, cfg, { tenantId: "t1", provider: "groq", estimatedTokens: 900 });
    await expect(
      reserveTokensCore(store, cfg, { tenantId: "t1", provider: "groq", estimatedTokens: 200 }),
    ).rejects.toBeInstanceOf(LLMQuotaError);
    // After rollback, tenant should still be at 900 — not 1100.
    expect(store.counters.get(tenantKey("t1"))).toBe(900);
    // Global must not have been touched on the failed reservation.
    expect(store.counters.get(globalKey("groq"))).toBe(900);
  });

  it("over global cap: both tenant and global counters rolled back", async () => {
    // Fill global to 1900 via two tenants.
    await reserveTokensCore(store, cfg, { tenantId: "t1", provider: "groq", estimatedTokens: 900 });
    await reserveTokensCore(store, cfg, { tenantId: "t2", provider: "groq", estimatedTokens: 900 });
    expect(store.counters.get(globalKey("groq"))).toBe(1_800);

    // t3 pushes global to 2100 — over the 2000 cap.
    await expect(
      reserveTokensCore(store, cfg, { tenantId: "t3", provider: "groq", estimatedTokens: 300 }),
    ).rejects.toBeInstanceOf(LLMQuotaError);

    // Both keys rolled back to pre-attempt state.
    expect(store.counters.get(tenantKey("t3"))).toBe(0);
    expect(store.counters.get(globalKey("groq"))).toBe(1_800);
  });

  it("disabled budget: reservation is inert and reconcile is a no-op", async () => {
    const r = await reserveTokensCore(store, { ...cfg, enabled: false }, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 500,
    });
    expect(r.active).toBe(false);
    expect(store.counters.size).toBe(0);
    await reconcileTokensCore(store, r, 1_000);
    expect(store.counters.size).toBe(0);
  });

  it("reconcile increments when actual > estimate", async () => {
    const r = await reserveTokensCore(store, cfg, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 100,
    });
    await reconcileTokensCore(store, r, 150);
    expect(store.counters.get(r.tenantKey)).toBe(150);
    expect(store.counters.get(r.globalKey)).toBe(150);
  });

  it("reconcile decrements when actual < estimate (negative delta)", async () => {
    const r = await reserveTokensCore(store, cfg, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 200,
    });
    await reconcileTokensCore(store, r, 50);
    expect(store.counters.get(r.tenantKey)).toBe(50);
    expect(store.counters.get(r.globalKey)).toBe(50);
  });

  it("reconcile exact match: no extra writes", async () => {
    const r = await reserveTokensCore(store, cfg, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 100,
    });
    const before = new Map(store.counters);
    await reconcileTokensCore(store, r, 100);
    expect(store.counters).toEqual(before);
  });

  it("key namespace is provider-scoped (gemini and groq do not share budget)", async () => {
    await reserveTokensCore(store, cfg, { tenantId: "t1", provider: "groq", estimatedTokens: 100 });
    await reserveTokensCore(store, cfg, { tenantId: "t1", provider: "gemini", estimatedTokens: 100 });
    expect(store.counters.get(globalKey("groq"))).toBe(100);
    expect(store.counters.get(globalKey("gemini"))).toBe(100);
    // Tenant is shared across providers — one tenant's budget is a single number.
    expect(store.counters.get(tenantKey("t1"))).toBe(200);
  });

  it("rejects non-positive estimated tokens", async () => {
    await expect(
      reserveTokensCore(store, cfg, { tenantId: "t1", provider: "groq", estimatedTokens: 0 }),
    ).rejects.toThrow(/positive/);
  });

  it("TTL is set on every write", async () => {
    const r = await reserveTokensCore(store, cfg, {
      tenantId: "t1",
      provider: "groq",
      estimatedTokens: 100,
    });
    expect(store.ttls.get(r.tenantKey)).toBeGreaterThan(60 * 60);
    expect(store.ttls.get(r.globalKey)).toBeGreaterThan(60 * 60);
  });
});
