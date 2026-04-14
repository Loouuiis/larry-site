import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const Schema = z.object({
  email: z.string().email().max(320).toLowerCase().trim(),
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 * 10 });
    return false;
  }
  if (entry.count >= 5) return true;
  entry.count++;
  return false;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isRateLimited(session.userId)) {
    return NextResponse.json({ error: "Too many referrals. Please wait a bit." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });
  }

  const friendEmail = result.data.email;
  const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://larry-site.vercel.app"}/signup`;

  // Look up referrer's email for the email copy
  let referrerEmail = "A friend";
  try {
    const db = getDb();
    const rows = await db.execute({
      sql: "SELECT email FROM users WHERE id = ?",
      args: [session.userId],
    });
    if (rows.rows[0]) referrerEmail = String(rows.rows[0].email);
  } catch { /* non-fatal */ }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Email service not configured." }, { status: 503 });
  }

  const resend = new Resend(resendKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_LARRY ?? "Larry <larry@larry-pm.com>",
    to: friendEmail,
    subject: `${referrerEmail} invited you to join Larry`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#8b5cf6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">You've been invited to Larry</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          <strong>${referrerEmail}</strong> thinks you'd find Larry useful — it's an AI project manager that handles follow-ups, updates, and coordination so your team can focus on delivering.
        </p>
        <a href="${signupUrl}" style="display:inline-block; background:#111; color:#fff; font-size:15px; font-weight:500; padding:12px 28px; border-radius:9999px; text-decoration:none;">
          Create your account →
        </a>
        <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
          If you weren't expecting this, you can ignore it.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[referral] Resend error:", error);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
