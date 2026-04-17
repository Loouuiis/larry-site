import { describe, expect, it } from "vitest";
import { hashInvitationToken, generateInvitationToken, isInvitationConsumable } from "./invitations.js";

describe("invitations token helpers", () => {
  it("generateInvitationToken returns a URL-safe base64url string of ≥43 chars", () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("hashInvitationToken returns deterministic SHA-256 hex (64 chars)", () => {
    const h1 = hashInvitationToken("abc");
    const h2 = hashInvitationToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]+$/);
  });

  it("different tokens hash differently", () => {
    expect(hashInvitationToken("a")).not.toBe(hashInvitationToken("b"));
  });

  it("two freshly generated tokens are distinct", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
  });

  it("isInvitationConsumable — pending + future expiry", () => {
    const inv = {
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(isInvitationConsumable(inv as never)).toBe(true);
  });

  it("isInvitationConsumable — expired", () => {
    const inv = {
      status: "pending" as const,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(isInvitationConsumable(inv as never)).toBe(false);
  });

  it("isInvitationConsumable — revoked", () => {
    const inv = {
      status: "revoked" as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(isInvitationConsumable(inv as never)).toBe(false);
  });
});
