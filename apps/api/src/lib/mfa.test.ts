import { describe, it, expect, vi } from "vitest";
import { TOTP, Secret } from "otpauth";
import {
  generateEnrolmentSecret,
  verifyTotpCode,
  generateScratchCodes,
  hashScratchCode,
  consumeScratchCode,
} from "./mfa.js";

describe("generateEnrolmentSecret", () => {
  it("returns a base32 secret and an otpauth:// url tagged Larry", () => {
    const { secret, otpauthUrl } = generateEnrolmentSecret("user@example.com");
    expect(secret).toMatch(/^[A-Z2-7]+=*$/); // base32 alphabet
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain("issuer=Larry");
  });
});

describe("verifyTotpCode", () => {
  it("accepts the code generated from the same secret", () => {
    const { secret } = generateEnrolmentSecret("user@example.com");
    const totp = new TOTP({
      issuer: "Larry",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const { secret } = generateEnrolmentSecret("user@example.com");
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("rejects non-6-digit input", () => {
    const { secret } = generateEnrolmentSecret("user@example.com");
    expect(verifyTotpCode(secret, "abc123")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "1234567")).toBe(false);
  });

  it("tolerates ±30s drift", () => {
    const { secret } = generateEnrolmentSecret("user@example.com");
    const totp = new TOTP({
      issuer: "Larry",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    // code for 30s in the past
    const past = totp.generate({ timestamp: Date.now() - 30_000 });
    expect(verifyTotpCode(secret, past)).toBe(true);
  });
});

describe("scratch codes", () => {
  it("generates 10 distinct codes by default", () => {
    const codes = generateScratchCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("produces codes in XXX-XXX-XXX format", () => {
    const codes = generateScratchCodes(3);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    }
  });

  it("hashScratchCode normalises case and dashes", () => {
    const raw = "AB2-CD3-EF4";
    expect(hashScratchCode(raw)).toBe(hashScratchCode("ab2cd3ef4"));
    expect(hashScratchCode(raw)).toBe(hashScratchCode("  AB2 CD3 EF4  "));
  });
});

describe("consumeScratchCode", () => {
  it("marks the row used and returns true on first use", async () => {
    const db = { query: vi.fn(async () => [{ id: "abc" }]) } as unknown as import("@larry/db").Db;
    const ok = await consumeScratchCode(db, "user-1", "AB2-CD3-EF4");
    expect(ok).toBe(true);
    expect((db as unknown as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledTimes(1);
  });

  it("returns false when no unused row matches", async () => {
    const db = { query: vi.fn(async () => []) } as unknown as import("@larry/db").Db;
    const ok = await consumeScratchCode(db, "user-1", "ZZZ-ZZZ-ZZZ");
    expect(ok).toBe(false);
  });
});
