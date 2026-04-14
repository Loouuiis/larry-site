import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const NOREPLY = "Larry <noreply@larry-site.com>";
const LARRY = "Larry <larry@larry-site.com>";

describe("email.ts FROM mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
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
