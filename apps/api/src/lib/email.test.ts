import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

// Stub the email-quota guard so these tests don't need Redis. Quota behavior
// is tested in email-quota.test.ts. Behaviour in email.ts we care about here:
//   (a) suppressed recipients short-circuit before any send;
//   (b) quota errors surface to the caller (they decide to swallow or not);
//   (c) FROM mapping is correct per kind.
const isSuppressedMock = vi.fn().mockResolvedValue(false);
const checkEmailQuotaMock = vi.fn().mockResolvedValue(undefined);
class FakeEmailQuotaError extends Error {
  readonly detail: unknown;
  constructor(detail: unknown) {
    super("fake quota");
    this.name = "EmailQuotaError";
    this.detail = detail;
  }
}

vi.mock("./email-quota.js", () => ({
  isSuppressed: isSuppressedMock,
  checkEmailQuota: checkEmailQuotaMock,
  EmailQuotaError: FakeEmailQuotaError,
}));

const NOREPLY = "Larry <noreply@larry-pm.com>";
const LARRY = "Larry <larry@larry-pm.com>";

describe("email.ts FROM mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
    isSuppressedMock.mockReset();
    isSuppressedMock.mockResolvedValue(false);
    checkEmailQuotaMock.mockReset();
    checkEmailQuotaMock.mockResolvedValue(undefined);
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_NOREPLY = NOREPLY;
    process.env.RESEND_FROM_LARRY = LARRY;
    process.env.FRONTEND_URL = "https://app.example.com";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_NOREPLY;
    delete process.env.RESEND_FROM_LARRY;
    delete process.env.FRONTEND_URL;
  });

  it("sendPasswordResetEmail uses noreply sender", async () => {
    const mod = await import("./email.js");
    await mod.sendPasswordResetEmail("u@example.com", "https://x/reset");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendVerificationEmail uses noreply sender", async () => {
    const mod = await import("./email.js");
    await mod.sendVerificationEmail("u@example.com", "https://x/verify");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendEmailChangeConfirmation uses noreply sender", async () => {
    const mod = await import("./email.js");
    await mod.sendEmailChangeConfirmation("u@example.com", "https://x/confirm");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendEmailChangeNotification uses noreply sender", async () => {
    const mod = await import("./email.js");
    await mod.sendEmailChangeNotification("u@example.com");
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendNewDeviceAlert uses noreply sender", async () => {
    const mod = await import("./email.js");
    await mod.sendNewDeviceAlert("u@example.com", { browser: "Chrome", os: "macOS" });
    expect(sendMock.mock.calls[0][0].from).toBe(NOREPLY);
  });

  it("sendMemberInviteEmail uses larry sender", async () => {
    const mod = await import("./email.js");
    await mod.sendMemberInviteEmail("u@example.com", "Anna");
    expect(sendMock.mock.calls[0][0].from).toBe(LARRY);
  });
});

describe("email.ts suppression and quota", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
    isSuppressedMock.mockReset();
    isSuppressedMock.mockResolvedValue(false);
    checkEmailQuotaMock.mockReset();
    checkEmailQuotaMock.mockResolvedValue(undefined);
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_NOREPLY = NOREPLY;
    process.env.RESEND_FROM_LARRY = LARRY;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_NOREPLY;
    delete process.env.RESEND_FROM_LARRY;
  });

  it("suppressed recipient results in silent no-op — Resend is not called", async () => {
    isSuppressedMock.mockResolvedValue(true);
    const mod = await import("./email.js");
    await mod.sendPasswordResetEmail("bounced@example.com", "https://x/reset");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("quota exceeded propagates as EmailQuotaError — Resend is not called", async () => {
    checkEmailQuotaMock.mockRejectedValue(
      new FakeEmailQuotaError({ scope: "password_reset/hour/recipient", limit: 3, window: "1h" }),
    );
    const mod = await import("./email.js");
    await expect(
      mod.sendPasswordResetEmail("u@example.com", "https://x/reset"),
    ).rejects.toBeInstanceOf(FakeEmailQuotaError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("quota guard receives user/tenant context when provided", async () => {
    const mod = await import("./email.js");
    await mod.sendVerificationEmail("u@example.com", "https://x/v", {
      userId: "user-1",
      tenantId: "tenant-1",
    });
    expect(checkEmailQuotaMock).toHaveBeenCalledWith({
      kind: "verification",
      recipient: "u@example.com",
      userId: "user-1",
      tenantId: "tenant-1",
    });
  });

  it("member invite quota is scoped by tenant", async () => {
    const mod = await import("./email.js");
    await mod.sendMemberInviteEmail("invitee@example.com", "Anna", { tenantId: "tenant-1" });
    expect(checkEmailQuotaMock).toHaveBeenCalledWith({
      kind: "member_invite",
      recipient: "invitee@example.com",
      tenantId: "tenant-1",
    });
  });
});
