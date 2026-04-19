import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  assertPasswordNotBreached,
  getBreachCount,
  PasswordBreachedError,
  __resetBreachCacheForTests,
} from "./password-breach.js";

// SHA1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// Prefix "5BAA6", suffix "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
const PASSWORD_HASH_PREFIX = "5BAA6";
const PASSWORD_HASH_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

// SHA1("zX9#qW7!LpB3nM2F") — a reasonably unique passphrase, should
// return 0 in our mocked "prefix not found" response.
const UNIQUE_SUFFIX = "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD";

function makeFetcher(body: string, status = 200): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("getBreachCount", () => {
  beforeEach(() => {
    __resetBreachCacheForTests();
  });

  it("returns the breach count for a matching suffix", async () => {
    const body = [
      `${PASSWORD_HASH_SUFFIX}:9876543`,
      "OTHER_SUFFIX_000000000000000000000000000:42",
    ].join("\r\n");
    const count = await getBreachCount("password", { fetcher: makeFetcher(body) });
    expect(count).toBe(9876543);
  });

  it("returns 0 when no row matches the suffix", async () => {
    const body = "OTHER_SUFFIX_000000000000000000000000000:42";
    const count = await getBreachCount("password", { fetcher: makeFetcher(body) });
    expect(count).toBe(0);
  });

  it("caches responses by prefix", async () => {
    const body = `${PASSWORD_HASH_SUFFIX}:1`;
    const fetcher = makeFetcher(body);
    await getBreachCount("password", { fetcher });
    await getBreachCount("password", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after cache TTL expires", async () => {
    const body = `${PASSWORD_HASH_SUFFIX}:1`;
    const fetcher = makeFetcher(body);
    let now = 1_000_000;
    await getBreachCount("password", { fetcher, now: () => now });
    now += 61 * 60 * 1000; // > 1h
    await getBreachCount("password", { fetcher, now: () => now });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sends only the first 5 hex chars to HIBP", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${PASSWORD_HASH_PREFIX}`);
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    await getBreachCount("password", { fetcher });
  });
});

describe("assertPasswordNotBreached", () => {
  beforeEach(() => {
    __resetBreachCacheForTests();
  });

  it("throws PasswordBreachedError when password is in HIBP", async () => {
    const body = `${PASSWORD_HASH_SUFFIX}:9876543`;
    await expect(
      assertPasswordNotBreached("password", { fetcher: makeFetcher(body) }),
    ).rejects.toBeInstanceOf(PasswordBreachedError);
  });

  it("passes when password suffix not in range response", async () => {
    const body = `${UNIQUE_SUFFIX}:1`;
    await expect(
      assertPasswordNotBreached("password", { fetcher: makeFetcher(body) }),
    ).resolves.toBeUndefined();
  });

  it("swallows transport errors (fails open)", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(
      assertPasswordNotBreached("anything", { fetcher }),
    ).resolves.toBeUndefined();
  });

  it("swallows non-2xx responses (fails open)", async () => {
    const fetcher = makeFetcher("Bad Gateway", 502);
    await expect(
      assertPasswordNotBreached("anything", { fetcher }),
    ).resolves.toBeUndefined();
  });

  it("respects minCount to allow low-occurrence passwords through", async () => {
    const body = `${PASSWORD_HASH_SUFFIX}:3`;
    await expect(
      assertPasswordNotBreached("password", {
        fetcher: makeFetcher(body),
        minCount: 10,
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertPasswordNotBreached("password", {
        fetcher: makeFetcher(body),
        minCount: 1,
      }),
    ).rejects.toBeInstanceOf(PasswordBreachedError);
  });
});
