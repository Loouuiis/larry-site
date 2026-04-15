import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeRedis {
  private store = new Map<string, { value: string; expires: number }>();
  async set(
    key: string,
    value: string,
    _ex: "EX",
    seconds: number,
    _nx: "NX",
  ): Promise<"OK" | null> {
    const existing = this.store.get(key);
    if (existing && existing.expires > Date.now()) return null;
    this.store.set(key, { value, expires: Date.now() + seconds * 1000 });
    return "OK";
  }
  reset() {
    this.store.clear();
  }
}

const fake = new FakeRedis();

vi.mock("./redis.js", () => ({
  getRedis: () => fake,
  closeRedis: async () => {},
}));

let envFlag = true;
vi.mock("@larry/config", () => ({
  getApiEnv: () => ({ OAUTH_STATE_SINGLE_USE_ENABLED: envFlag }),
}));

describe("oauth-state.claimStateToken", () => {
  beforeEach(() => {
    fake.reset();
    envFlag = true;
    vi.resetModules();
  });

  afterEach(() => {});

  it("returns true on first claim, false on replay", async () => {
    const { claimStateToken } = await import("./oauth-state.js");
    expect(await claimStateToken("jti-1", 600)).toBe(true);
    expect(await claimStateToken("jti-1", 600)).toBe(false);
  });

  it("a different jti is independent", async () => {
    const { claimStateToken } = await import("./oauth-state.js");
    expect(await claimStateToken("jti-a", 600)).toBe(true);
    expect(await claimStateToken("jti-b", 600)).toBe(true);
  });

  it("missing jti is accepted (rollout safety — old tokens have no jti)", async () => {
    const { claimStateToken } = await import("./oauth-state.js");
    expect(await claimStateToken("", 600)).toBe(true);
  });

  it("flag-off short-circuits to true", async () => {
    envFlag = false;
    const { claimStateToken } = await import("./oauth-state.js");
    expect(await claimStateToken("jti-x", 600)).toBe(true);
    expect(await claimStateToken("jti-x", 600)).toBe(true);
  });

  it("clamps very small TTLs to a 60-second floor (defensive)", async () => {
    const setSpy = vi.spyOn(fake, "set");
    const { claimStateToken } = await import("./oauth-state.js");
    await claimStateToken("jti-tiny", 5);
    expect(setSpy).toHaveBeenCalledWith("oauth:state:jti-tiny", "1", "EX", 60, "NX");
  });
});
