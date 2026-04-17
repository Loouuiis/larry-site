import { describe, expect, it, vi } from "vitest";
import type { Db } from "@larry/db";
import { assertMfaIfRequired, MfaEnrollmentRequiredError } from "./mfa-gate.js";

function mockDb(mfaRequired: boolean, mfaEnrolledAt: string | null) {
  return {
    query: vi.fn().mockResolvedValue([
      { mfa_required_for_admins: mfaRequired, mfa_enrolled_at: mfaEnrolledAt },
    ]),
  } as unknown as Db;
}

describe("mfa-gate", () => {
  it("non-admin passes regardless", async () => {
    await expect(
      assertMfaIfRequired(mockDb(true, null), "t", "u", "member"),
    ).resolves.toBeUndefined();
    await expect(
      assertMfaIfRequired(mockDb(true, null), "t", "u", "pm"),
    ).resolves.toBeUndefined();
  });

  it("admin passes when tenant doesn't require MFA", async () => {
    await expect(
      assertMfaIfRequired(mockDb(false, null), "t", "u", "admin"),
    ).resolves.toBeUndefined();
  });

  it("admin without MFA fails when required", async () => {
    await expect(
      assertMfaIfRequired(mockDb(true, null), "t", "u", "admin"),
    ).rejects.toBeInstanceOf(MfaEnrollmentRequiredError);
  });

  it("owner without MFA fails when required", async () => {
    await expect(
      assertMfaIfRequired(mockDb(true, null), "t", "u", "owner"),
    ).rejects.toBeInstanceOf(MfaEnrollmentRequiredError);
  });

  it("admin with MFA enrolled passes", async () => {
    await expect(
      assertMfaIfRequired(mockDb(true, "2026-01-01T00:00:00Z"), "t", "u", "admin"),
    ).resolves.toBeUndefined();
  });
});
