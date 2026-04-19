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
  const frontendUrl = getFrontendUrl();
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
      <div style="margin-bottom: 32px;">
        <img src="${frontendUrl}/Larryfulllogo.png" alt="Larry" style="height:52px; width:auto; display:block;" />
      </div>
      ${bodyContent}
      <p style="margin-top: 40px; font-size: 12px; color: #aaa;">
        You received this email because your account is registered with Larry.
      </p>
    </div>
  `;
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
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

export interface RefreshReuseInfo {
  ip?: string;
  userAgent?: string;
}

// P2-1. Sent when a previously-revoked refresh token is replayed — either
// a racing legit client (rare) or a stolen-token replay. We've already
// nuked the whole session family at the call site; this email tells the
// human to rotate their password.
export async function sendRefreshReuseAlert(
  to: string,
  info: RefreshReuseInfo,
  ctx?: EmailSendContext,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Skipping refresh-reuse alert for %s", to);
    return;
  }
  if (!(await guard("refresh_reuse_alert", to, ctx))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const details = [
    info.userAgent && `<li><strong>Browser:</strong> ${escapeHtml(info.userAgent).slice(0, 120)}</li>`,
    info.ip && `<li><strong>IP:</strong> ${escapeHtml(info.ip)}</li>`,
  ]
    .filter(Boolean)
    .join("");

  const { error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Unusual sign-in activity on your Larry account",
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">We signed you out of every device</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 16px;">
        A previously-expired Larry session token was presented again just now. That usually means either a device has a stale session, or someone else got hold of it. Either way, every active Larry session for your account has been signed out as a precaution.
      </p>
      ${details ? `<ul style="font-size: 14px; color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 28px;">${details}</ul>` : ""}
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
        If you don't recognise this, reset your password immediately.
      </p>
      ${ctaButton(`${frontendUrl}/forgot-password`, "Reset your password")}
    `),
  });
  if (error) {
    console.error("[email] sendRefreshReuseAlert failed:", error);
    throw new Error(`Failed to send refresh-reuse alert: ${error.message}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface MemberInviteEmailOpts extends EmailSendContext {
  /** Raw (unhashed) invitation token — embedded in the accept link. */
  rawToken: string;
  /** Display name for the org, shown in the email body and subject. */
  orgName: string;
  /** Optional name of the admin who issued the invite. */
  inviterName?: string;
}

export async function sendMemberInviteEmail(
  to: string,
  displayName: string,
  opts: MemberInviteEmailOpts,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Invite email for %s skipped.", to);
    return;
  }
  if (!(await guard("member_invite", to, opts))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const safeName = escapeHtml(toTitleCase(displayName));
  const safeOrg = escapeHtml(opts.orgName);
  const safeInviter = escapeHtml(opts.inviterName ?? "");
  const acceptUrl = `${frontendUrl}/invite/accept?token=${encodeURIComponent(opts.rawToken)}`;
  const { error } = await resend.emails.send({
    from: FROM_LARRY,
    to,
    subject: `You've been invited to join ${opts.orgName} on Larry`,
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">You're invited to join ${safeOrg}</h1>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px;">
        Hi ${safeName || "there"}, ${safeInviter || "an admin"} has invited you to join <strong>${safeOrg}</strong> on Larry, the AI-powered project management tool.
      </p>
      ${ctaButton(acceptUrl, "Accept invitation")}
      <p style="margin-top: 28px; font-size: 13px; color: #888; line-height: 1.5;">
        This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendMemberInviteEmail failed:", error);
    throw new Error(`Failed to send member invite email: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Briefing digest email (#93)
// ---------------------------------------------------------------------------

export interface BriefingDigestProject {
  projectId: string;
  name: string;
  statusLabel: "At Risk" | "Needs Attention" | "On Track";
  summary: string;
  needsYou: boolean;
  suggestionCount: number;
}

export interface BriefingDigestOpts extends EmailSendContext {
  greeting: string;
  projects: BriefingDigestProject[];
  totalNeedsYou: number;
}

function statusPillHtml(label: BriefingDigestProject["statusLabel"]): string {
  const styles =
    label === "At Risk"
      ? "background:#fff6f7; color:#dc2626"
      : label === "Needs Attention"
        ? "background:#fff7ed; color:#d97706"
        : "background:#f3f4f6; color:#6b7280";
  return `<span style="${styles}; font-size:11px; font-weight:600; padding:3px 8px; border-radius:9999px; display:inline-block;">${escapeHtml(label)}</span>`;
}

export async function sendBriefingDigestEmail(
  to: string,
  opts: BriefingDigestOpts,
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Skipping briefing digest for %s", to);
    return;
  }
  if (!(await guard("briefing_digest", to, opts))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();

  const projectRows = opts.projects.length > 0
    ? opts.projects
        .map((p) => {
          const projectUrl = `${frontendUrl}/workspace/projects/${encodeURIComponent(p.projectId)}`;
          const needsBadge = p.needsYou
            ? `<span style="background:#6c44f6; color:#fff; font-size:11px; font-weight:600; padding:3px 8px; border-radius:9999px; margin-left:8px;">Needs you</span>`
            : "";
          return `
            <tr>
              <td style="padding:14px 0; border-bottom:1px solid #f0edfa; vertical-align:top;">
                <div style="margin-bottom:4px;">${statusPillHtml(p.statusLabel)}${needsBadge}</div>
                <div style="font-size:14px; font-weight:600; color:#111; margin-bottom:4px;">
                  <a href="${projectUrl}" style="color:#111; text-decoration:none;">${escapeHtml(p.name)}</a>
                </div>
                <div style="font-size:13px; color:#4b5563; line-height:1.55;">${escapeHtml(p.summary)}</div>
                <div style="margin-top:8px; font-size:12px;">
                  <a href="${projectUrl}" style="color:#6c44f6; text-decoration:none; font-weight:500;">Open project →</a>
                </div>
              </td>
            </tr>`;
        })
        .join("")
    : `<tr><td style="padding:14px 0; font-size:13px; color:#6b7280;">No active projects need your attention right now.</td></tr>`;

  const subject = opts.totalNeedsYou > 0
    ? `Your Larry briefing — ${opts.totalNeedsYou} ${opts.totalNeedsYou === 1 ? "project needs" : "projects need"} you`
    : "Your Larry briefing";

  const { error } = await resend.emails.send({
    from: FROM_LARRY,
    to,
    subject,
    html: wrapHtml(`
      <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">${escapeHtml(opts.greeting)}</h1>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 24px;">
        Here's your current Larry briefing across ${opts.projects.length} active ${opts.projects.length === 1 ? "project" : "projects"}${opts.totalNeedsYou > 0 ? ` — ${opts.totalNeedsYou} need your attention.` : "."}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom: 28px;">
        ${projectRows}
      </table>
      ${ctaButton(`${frontendUrl}/workspace`, "Open workspace")}
      <p style="margin-top: 28px; font-size: 12px; color: #9ca3af; line-height: 1.5;">
        This is a one-off digest you asked Larry to send. We won't email you again unless you request it.
      </p>
    `),
  });
  if (error) {
    console.error("[email] sendBriefingDigestEmail failed:", error);
    throw new Error(`Failed to send briefing digest: ${error.message}`);
  }
}

// Re-export the quota error so callers can detect it for enumeration-safe flows.
export { EmailQuotaError } from "./email-quota.js";
