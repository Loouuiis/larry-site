import { describe, expect, it } from "vitest";
import {
  assessInviteLink,
  generateInviteLinkToken,
  hashInviteLinkToken,
  type InviteLinkRow,
} from "./invite-links.js";

function baseLink(overrides: Partial<InviteLinkRow> = {}): InviteLinkRow {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    tenantId: "11111111-1111-4111-8111-111111111111",
    createdByUserId: "22222222-2222-4222-8222-222222222222",
    defaultRole: "member",
    defaultProjectId: null,
    defaultProjectRole: null,
    maxUses: null,
    usesCount: 0,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateInviteLinkToken / hashInviteLinkToken", () => {
  it("produces a URL-safe base64 token", () => {
    const tok = generateInviteLinkToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tok.length).toBeGreaterThan(20);
  });

  it("hashes deterministically", () => {
    const tok = "abc123";
    expect(hashInviteLinkToken(tok)).toBe(hashInviteLinkToken(tok));
    expect(hashInviteLinkToken(tok)).not.toBe(hashInviteLinkToken("abc124"));
  });
});

describe("assessInviteLink", () => {
  it("marks a fresh link OK", () => {
    expect(assessInviteLink(baseLink())).toEqual({ ok: true });
  });

  it("marks a revoked link as revoked", () => {
    const r = assessInviteLink(baseLink({ revokedAt: new Date().toISOString() }));
    expect(r).toEqual({ ok: false, code: "revoked" });
  });

  it("marks an expired link as expired", () => {
    const r = assessInviteLink(
      baseLink({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    expect(r).toEqual({ ok: false, code: "expired" });
  });

  it("marks an exhausted link as exhausted", () => {
    const r = assessInviteLink(baseLink({ maxUses: 3, usesCount: 3 }));
    expect(r).toEqual({ ok: false, code: "exhausted" });
  });

  it("treats unlimited uses (maxUses=null) as never exhausted", () => {
    const r = assessInviteLink(baseLink({ maxUses: null, usesCount: 9999 }));
    expect(r).toEqual({ ok: true });
  });
});
