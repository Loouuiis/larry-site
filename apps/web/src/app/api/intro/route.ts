import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";

const IntroSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(320),
  company: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  comment: z.string().max(1000).optional(),
  marketingConsent: z.boolean(),
});

// In-memory rate limiter — mirrors the pattern used in founder-contact and referral routes.
// 3 submissions per IP per hour (sufficient for a legitimate intro form; abuse is rare).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 * 60 });
    return false;
  }
  if (entry.count >= 3) return true;
  entry.count++;
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RECIPIENT = "anna.wigrena@gmail.com";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = IntroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email service not configured." }, { status: 503 });
  }

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:40px 24px;color:#111;">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 24px;">New Larry intro request</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:15px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="color:#555;white-space:nowrap;padding-right:24px;"><b>Name</b></td>
          <td>${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="color:#555;"><b>Email</b></td>
          <td><a href="mailto:${escapeHtml(data.email)}" style="color:#6c44f6;">${escapeHtml(data.email)}</a></td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="color:#555;"><b>Company</b></td>
          <td>${escapeHtml(data.company)}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="color:#555;"><b>Job title</b></td>
          <td>${escapeHtml(data.jobTitle)}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="color:#555;"><b>Marketing consent</b></td>
          <td>${data.marketingConsent ? "Yes" : "No"}</td>
        </tr>
        ${
          data.comment
            ? `<tr><td style="color:#555;vertical-align:top;"><b>Comment</b></td><td>${escapeHtml(data.comment)}</td></tr>`
            : ""
        }
      </table>
      <p style="margin-top:32px;font-size:12px;color:#aaa;">
        Sent from larry-pm.com /api/intro &middot; ${new Date().toISOString()}
      </p>
    </div>
  `.trim();

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_LARRY ?? "Larry <larry@larry-pm.com>",
    to: [RECIPIENT],
    replyTo: data.email,
    subject: `Larry intro request — ${data.firstName} ${data.lastName} (${data.company})`,
    html,
  });

  if (error) {
    console.error("[intro] Resend error:", error);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
