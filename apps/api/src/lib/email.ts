import { Resend } from "resend";
import {
  checkEmailQuota,
  isSuppressed,
  type EmailQuotaContext,
  type EmailKind,
} from "./email-quota.js";

const FROM_NOREPLY = process.env.RESEND_FROM_NOREPLY ?? "Larry <noreply@larry-pm.com>";
const FROM_LARRY   = process.env.RESEND_FROM_LARRY   ?? "Larry <larry@larry-pm.com>";

let resendInstance: Resend | null = null;

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResend(): Resend {
  if (resendInstance) return resendInstance;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  resendInstance = new Resend(key);
  return resendInstance;
}

/**
 * Returns the frontend base URL (no trailing slash).
 * Prefers FRONTEND_URL, falls back to first CORS_ORIGINS value.
 */
function getFrontendUrl(): string {
  const explicit = process.env.FRONTEND_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cors = process.env.CORS_ORIGINS;
  if (cors) return cors.split(",")[0].trim().replace(/\/+$/, "");
  return "http://localhost:3000";
}

// ---------------------------------------------------------------------------
// Abuse guard — suppression + per-kind quotas.
// Every send path goes through this. Keeps the rate-limit contract in one
// place so a new email function can't silently bypass the caps.
// ---------------------------------------------------------------------------

export interface EmailSendContext {
  userId?: string;
  tenantId?: string;
}

/**
 * Returns true if the caller should proceed with the send.
 * Returns false on suppression (silent no-op by design).
 * Throws EmailQuotaError on quota exhaustion — callers decide whether to
 * propagate (auth flows typically swallow to preserve enumeration-safe UX).
 */
async function guard(kind: EmailKind, to: string, ctx?: EmailSendContext): Promise<boolean> {
  if (await isSuppressed(to)) return false;
  const quotaCtx: EmailQuotaContext = { kind, recipient: to };
  if (ctx?.userId) quotaCtx.userId = ctx.userId;
  if (ctx?.tenantId) quotaCtx.tenantId = ctx.tenantId;
  await checkEmailQuota(quotaCtx);
  return true;
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper
// ---------------------------------------------------------------------------

function wrapHtml(bodyContent: string): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
      <div style="margin-bottom: 32px;">
        <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
      </div>
      ${bodyContent}
      <p style="margin-top: 40px; font-size: 12px; color: #aaa;">
        You received this email because your account is registered with Larry.
      </p>
    </div>
  `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block; background:#6c44f6; color:#fff; font-size:15px; font-weight:500; padding:12px 28px; border-radius:8px; text-decoration:none;">${label}</a>`;
}

// ---------------------------------------------------------------------------
// Email functions
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Password reset URL for %s:\n  %s", to, resetUrl);
    return;
  }
  if (!(await guard("password_reset", to, ctx))) return;
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Reset your password",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Reset your password</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        We received a request to reset the password for your Larry account. Click the button below to choose a new password. This link expires in 1 hour.
      </p>
      ${ctaButton(resetUrl, "Reset password")}
      <p style="margin-top: 28px; font-size: 13px; color: #888; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendPasswordResetEmail failed:", error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Verification URL for %s:\n  %s", to, verifyUrl);
    return;
  }
  if (!(await guard("verification", to, ctx))) return;
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Verify your email address",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Verify your email</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        Thanks for signing up for Larry! Please verify your email address by clicking the button below.
      </p>
      ${ctaButton(verifyUrl, "Verify your email")}
      <p style="margin-top: 28px; font-size: 13px; color: #888; line-height: 1.5;">
        If you didn't create a Larry account, you can safely ignore this email.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendVerificationEmail failed:", error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

export async function sendEmailChangeConfirmation(
  to: string,
  confirmUrl: string,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Email change confirm URL for %s:\n  %s", to, confirmUrl);
    return;
  }
  if (!(await guard("email_change_confirm", to, ctx))) return;
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Confirm your new email address",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Confirm your new email</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        You requested to change your Larry account email to this address. Click below to confirm.
      </p>
      ${ctaButton(confirmUrl, "Confirm new email")}
      <p style="margin-top: 28px; font-size: 13px; color: #888; line-height: 1.5;">
        If you didn't request this change, you can safely ignore this email.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendEmailChangeConfirmation failed:", error);
    throw new Error(`Failed to send email change confirmation: ${error.message}`);
  }
}

export async function sendEmailChangeNotification(
  to: string,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Skipping email change notification for %s", to);
    return;
  }
  if (!(await guard("email_change_notify", to, ctx))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Your email address is being changed",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Email change requested</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        A request was made to change the email address associated with your Larry account. If this was you, no action is needed — a confirmation email has been sent to your new address.
      </p>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        If you did not request this change, please secure your account immediately by resetting your password.
      </p>
      ${ctaButton(`${frontendUrl}/forgot-password`, "Reset your password")}
    `),
  });
  if (error) {
    console.error("[email] sendEmailChangeNotification failed:", error);
    throw new Error(`Failed to send email change notification: ${error.message}`);
  }
}

export interface DeviceInfo {
  browser?: string;
  os?: string;
  ip?: string;
  location?: string;
}

export async function sendNewDeviceAlert(
  to: string,
  deviceInfo: DeviceInfo,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Skipping new device alert for %s", to);
    return;
  }
  if (!(await guard("new_device_alert", to, ctx))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const details = [
    deviceInfo.browser && `<li><strong>Browser:</strong> ${deviceInfo.browser}</li>`,
    deviceInfo.os && `<li><strong>OS:</strong> ${deviceInfo.os}</li>`,
    deviceInfo.ip && `<li><strong>IP:</strong> ${deviceInfo.ip}</li>`,
    deviceInfo.location && `<li><strong>Location:</strong> ${deviceInfo.location}</li>`,
  ]
    .filter(Boolean)
    .join("");

  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "New sign-in to your Larry account",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">New sign-in detected</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 16px;">
        Your Larry account was just signed in to from a new device.
      </p>
      ${details ? `<ul style="font-size: 14px; color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 28px;">${details}</ul>` : ""}
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        If this was you, no action is needed. If you don't recognise this sign-in, reset your password immediately.
      </p>
      ${ctaButton(`${frontendUrl}/forgot-password`, "Reset your password")}
    `),
  });
  if (error) {
    console.error("[email] sendNewDeviceAlert failed:", error);
    throw new Error(`Failed to send new device alert: ${error.message}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendMemberInviteEmail(
  to: string,
  displayName: string,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Invite email for %s skipped.", to);
    return;
  }
  if (!(await guard("member_invite", to, ctx))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const safeName = escapeHtml(displayName);
  const { error } = await resend.emails.send({
    from: FROM_LARRY,
    to,
    subject: "You've been invited to Larry",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">You're invited!</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        Hi ${safeName}, you've been invited to join a workspace on Larry — the AI-powered project management tool. Sign in to get started.
      </p>
      ${ctaButton(`${frontendUrl}/login`, "Sign in to Larry")}
      <p style="margin-top: 28px; font-size: 13px; color: #888; line-height: 1.5;">
        If you don't have a password yet, use the "Forgot password" link on the sign-in page to set one up.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendMemberInviteEmail failed:", error);
    throw new Error(`Failed to send member invite email: ${error.message}`);
  }
}

// Re-export the quota error so callers can detect it for enumeration-safe flows.
export { EmailQuotaError } from "./email-quota.js";
