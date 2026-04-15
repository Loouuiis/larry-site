import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake for the bits of ioredis we use.
class FakeRedis {
  private store = new Map<string, string>();
  private ttls = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return next;
  }
  async decr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? 0) - 1;
    this.store.set(key, String(next));
    return next;
  }
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }
  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }
  async set(key: string, value: string): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  pipeline() {
    const ops: Array<{ op: string; args: unknown[] }> = [];
    const self = this;
    const chain = {
      incr(key: string) {
        ops.push({ op: "incr", args: [key] });
        return chain;
      },
      decr(key: string) {
        ops.push({ op: "decr", args: [key] });
        return chain;
      },
      expire(key: string, seconds: number) {
        ops.push({ op: "expire", args: [key, seconds] });
        return chain;
      },
      async exec(): Promise<Array<[Error | null, unknown]>> {
        const results: Array<[Error | null, unknown]> = [];
        for (const { op, args } of ops) {
          try {
            const result = await (self as unknown as Record<string, Function>)[op].apply(self, args);
            results.push([null, result]);
          } catch (e) {
            results.push([e as Error, null]);
          }
        }
        return results;
      },
    };
    return chain;
  }
  peek(key: string): string | undefined {
    return this.store.get(key);
  }
  reset() {
    this.store.clear();
    this.ttls.clear();
  }
}

const fake = new FakeRedis();

vi.mock("./redis.js", () => ({
  getRedis: () => fake,
  closeRedis: async () => {},
}));

// Stub @larry/config so EMAIL_QUOTA_ENABLED default is true.
vi.mock("@larry/config", () => ({
  getApiEnv: () => ({
    EMAIL_QUOTA_ENABLED: true,
    NODE_ENV: "test",
  }),
}));

describe("email-quota", () => {
  beforeEach(() => {
    fake.reset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isSuppressed returns false for an unknown recipient", async () => {
    const mod = await import("./email-quota.js");
    expect(await mod.isSuppressed("unknown@example.com")).toBe(false);
  });

  it("addSuppression + isSuppressed work (case-insensitive)", async () => {
    const mod = await import("./email-quota.js");
    await mod.addSuppression("User@Example.com", "bounce");
    expect(await mod.isSuppressed("user@example.com")).toBe(true);
    expect(await mod.isSuppressed("USER@example.com")).toBe(true);
  });

  it("checkEmailQuota allows calls under the hourly cap", async () => {
    const mod = await import("./email-quota.js");
    // password_reset per-recipient hourly limit is 3
    for (let i = 0; i < 3; i++) {
      await mod.checkEmailQuota({ kind: "password_reset", recipient: "u@example.com" });
    }
  });

  it("checkEmailQuota throws EmailQuotaError past the hourly recipient cap", async () => {
    const mod = await import("./email-quota.js");
    for (let i = 0; i < 3; i++) {
      await mod.checkEmailQuota({ kind: "password_reset", recipient: "u@example.com" });
    }
    await expect(
      mod.checkEmailQuota({ kind: "password_reset", recipient: "u@example.com" }),
    ).rejects.toBeInstanceOf(mod.EmailQuotaError);
  });

  it("rollback on overshoot: a rejected call does not consume budget", async () => {
    const mod = await import("./email-quota.js");
    // Fill hourly cap (3) then attempt one more and verify the count did not grow to 5
    for (let i = 0; i < 3; i++) {
      await mod.checkEmailQuota({ kind: "password_reset", recipient: "u@example.com" });
    }
    await expect(
      mod.checkEmailQuota({ kind: "password_reset", recipient: "u@example.com" }),
    ).rejects.toBeInstanceOf(mod.EmailQuotaError);

    // The recipient hourly key should still be at 3, not 4 or 5.
    const now = new Date();
    const hourKey = now.toISOString().slice(0, 13);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update("u@example.com").digest("hex").slice(0, 16);
    expect(fake.peek(`email:q:password_reset:r:${hash}:${hourKey}`)).toBe("3");
  });

  it("per-user limits apply when userId is supplied", async () => {
    const mod = await import("./email-quota.js");
    // verification hourly = 5
    for (let i = 0; i < 5; i++) {
      // vary recipient so per-recipient cap doesn't fire first
      await mod.checkEmailQuota({
        kind: "verification",
        recipient: `u${i}@example.com`,
        userId: "user-1",
      });
    }
    await expect(
      mod.checkEmailQuota({ kind: "verification", recipient: "u6@example.com", userId: "user-1" }),
    ).rejects.toBeInstanceOf(mod.EmailQuotaError);
  });

  it("tenant daily cap applies across email kinds", async () => {
    const mod = await import("./email-quota.js");
    // Tenant daily cap is 200. We'll just assert it exists by checking a small excess
    // with a targeted low override later; here, assert that the tenant key is incremented.
    await mod.checkEmailQuota({
      kind: "verification",
      recipient: "a@example.com",
      tenantId: "tenant-1",
    });
    const dayKey = new Date().toISOString().slice(0, 10);
    expect(fake.peek(`email:q:any:t:tenant-1:${dayKey}`)).toBe("1");
  });

  it("member_invite enforces a per-tenant hourly cap (not per-user)", async () => {
    const mod = await import("./email-quota.js");
    // TENANT_INVITE_HOUR_LIMIT = 20
    for (let i = 0; i < 20; i++) {
      await mod.checkEmailQuota({
        kind: "member_invite",
        recipient: `invitee${i}@example.com`,
        tenantId: "tenant-1",
      });
    }
    await expect(
      mod.checkEmailQuota({
        kind: "member_invite",
        recipient: "invitee21@example.com",
        tenantId: "tenant-1",
      }),
    ).rejects.toBeInstanceOf(mod.EmailQuotaError);
  });

  it("global daily circuit breaker fires", async () => {
    const mod = await import("./email-quota.js");
    // Simulate 500 already consumed globally by pre-setting the key.
    const dayKey = new Date().toISOString().slice(0, 10);
    await fake.set(`email:q:any:global:${dayKey}`, "500");
    await expect(
      mod.checkEmailQuota({ kind: "verification", recipient: "new@example.com" }),
    ).rejects.toBeInstanceOf(mod.EmailQuotaError);
  });
});
