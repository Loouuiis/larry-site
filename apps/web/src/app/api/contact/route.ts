import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { checkNamedRateLimit } from "@/lib/rate-limit";

/**
 * /api/contact — single endpoint for all four public-site forms, mirroring
 * Anna's design handoff. Forms POST { type, ...payload }; we validate per
 * type, then forward via Resend to anna.wigrena@gmail.com (note the trailing
 * "a" in "wigrena" — that is the correct address per the handoff).
 *
 * Wiring intentionally matches /api/intro so the same env vars and Resend
 * sender work without extra setup.
 */

const RECIPIENT = "anna.wigrena@gmail.com";

const WaitlistSchema = z.object({
  type: z.literal("waitlist"),
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(320).trim().toLowerCase(),
  company: z.string().max(200).trim().optional().default(""),
});

const DemoSchema = z.object({
  type: z.literal("demo"),
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(320).trim().toLowerCase(),
  phone: z.string().max(60).trim().optional().default(""),
  company: z.string().min(1).max(200).trim(),
  role: z.string().max(200).trim().optional().default(""),
  referral: z.string().min(1).max(80).trim(),
  message: z.string().max(4000).trim().optional().default(""),
});

const ReachOutSchema = z.object({
  type: z.literal("reach-out"),
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(320).trim().toLowerCase(),
  message: z.string().min(1).max(4000).trim(),
});

const ContactBarSchema = z.object({
  type: z.literal("contact-bar"),
  message: z.string().min(1).max(4000).trim(),
});

const PayloadSchema = z.discriminatedUnion("type", [
  WaitlistSchema,
  DemoSchema,
  ReachOutSchema,
  ContactBarSchema,
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripNewlines(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}

function row(label: string, value: string) {
  return `<tr style="border-bottom:1px solid #eee;">
    <td style="color:#555;white-space:nowrap;padding-right:24px;"><b>${escapeHtml(label)}</b></td>
    <td>${escapeHtml(value)}</td>
  </tr>`;
}

type Payload = z.infer<typeof PayloadSchema>;

function buildEmail(data: Payload): { subject: string; html: string } {
  const at = new Date().toISOString();
  if (data.type === "waitlist") {
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:40px 24px;color:#111;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 24px;">New waitlist signup</h2>
        <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:15px;">
          ${row("Name", data.name)}
          ${row("Email", data.email)}
          ${data.company ? row("Company", data.company) : ""}
        </table>
        <p style="margin-top:32px;font-size:12px;color:#aaa;">Sent from larry-pm.com waitlist · ${at}</p>
      </div>`.trim();
    return {
      subject: `Waitlist · ${stripNewlines(data.name)}${data.company ? ` (${stripNewlines(data.company)})` : ""}`,
      html,
    };
  }
  if (data.type === "demo") {
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:40px 24px;color:#111;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 24px;">New demo request</h2>
        <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:15px;">
          ${row("Name", data.name)}
          ${row("Email", data.email)}
          ${data.phone ? row("Phone", data.phone) : ""}
          ${row("Company", data.company)}
          ${data.role ? row("Role", data.role) : ""}
          ${row("Referral", data.referral)}
          ${data.message ? row("Message", data.message) : ""}
        </table>
        <p style="margin-top:32px;font-size:12px;color:#aaa;">Sent from larry-pm.com /book-a-demo · ${at}</p>
      </div>`.trim();
    return {
      subject: `Demo request · ${stripNewlines(data.name)} (${stripNewlines(data.company)})`,
      html,
    };
  }
  if (data.type === "reach-out") {
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:40px 24px;color:#111;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 24px;">New careers / reach-out message</h2>
        <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:15px;">
          ${row("Name", data.name)}
          ${row("Email", data.email)}
          ${row("Message", data.message)}
        </table>
        <p style="margin-top:32px;font-size:12px;color:#aaa;">Sent from larry-pm.com /careers · ${at}</p>
      </div>`.trim();
    return {
      subject: `Reach out · ${stripNewlines(data.name)}`,
      html,
    };
  }
  // contact-bar
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:40px 24px;color:#111;">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 24px;">Landing contact-bar message</h2>
      <p style="font-size:15px;">${escapeHtml(data.message)}</p>
      <p style="margin-top:32px;font-size:12px;color:#aaa;">Sent from larry-pm.com landing contact bar · ${at}</p>
    </div>`.trim();
  return {
    subject: `Contact bar · ${stripNewlines(data.message.slice(0, 60))}`,
    html,
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const { limited } = await checkNamedRateLimit({
    namespace: "contact",
    identifier: ip,
    max: 5,
    windowSecs: 60,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const data = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No email backend in dev — succeed so the design demo still works.
    // eslint-disable-next-line no-console
    console.warn("[contact] RESEND_API_KEY not set — submission accepted but not emailed", {
      type: data.type,
    });
    return NextResponse.json({ success: true, delivered: false });
  }

  const { subject, html } = buildEmail(data);
  const replyTo = "email" in data ? data.email : undefined;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_LARRY ?? "Larry <larry@larry-pm.com>",
    to: [RECIPIENT],
    replyTo,
    subject,
    html,
  });

  if (error) {
    console.error("[contact] Resend error:", error);
    return NextResponse.json(
      { error: "Failed to send. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, delivered: true });
}
