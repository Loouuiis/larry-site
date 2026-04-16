import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal ioredis mock — we only need to verify singleton wiring, not protocol.
const quitMock = vi.fn().mockResolvedValue("OK");
const onMock = vi.fn();
const RedisCtor = vi.fn().mockImplementation(() => ({
  quit: quitMock,
  on: onMock,
}));

vi.mock("ioredis", () => ({ default: RedisCtor, Redis: RedisCtor }));

describe("redis singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    RedisCtor.mockClear();
    quitMock.mockClear();
    onMock.mockClear();
    process.env.REDIS_URL = "redis://localhost:6379";
    // Full minimal ApiEnv — getApiEnv() validates strictly.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/x";
    process.env.JWT_ACCESS_SECRET = "x".repeat(40);
    process.env.JWT_REFRESH_SECRET = "y".repeat(40);
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    const mod = await import("./redis.js");
    await mod.closeRedis();
  });

  it("returns the same client on repeated calls", async () => {
    const mod = await import("./redis.js");
    const a = mod.getRedis();
    const b = mod.getRedis();
    expect(a).toBe(b);
    expect(RedisCtor).toHaveBeenCalledTimes(1);
  });

  it("constructs with REDIS_URL and sensible retry options", async () => {
    const mod = await import("./redis.js");
    mod.getRedis();
    expect(RedisCtor).toHaveBeenCalledTimes(1);
    const [url, opts] = RedisCtor.mock.calls[0];
    expect(url).toBe("redis://localhost:6379");
    expect(opts).toMatchObject({ maxRetriesPerRequest: expect.any(Number) });
  });

  it("registers an error handler so connection errors don't crash the process", async () => {
    const mod = await import("./redis.js");
    mod.getRedis();
    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("closeRedis releases the singleton so it can be re-created", async () => {
    const mod = await import("./redis.js");
    const first = mod.getRedis();
    await mod.closeRedis();
    expect(quitMock).toHaveBeenCalledTimes(1);
    const second = mod.getRedis();
    expect(second).not.toBe(first);
    expect(RedisCtor).toHaveBeenCalledTimes(2);
  });
});
