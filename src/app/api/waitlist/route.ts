import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const WaitlistSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName:  z.string().min(1).max(100).trim(),
  company:   z.string().min(1).max(200).trim(),
  email:     z.string().email().max(320).toLowerCase().trim(),
  phone:     z.string().trim().regex(/^[+\d][\d\s\-().]{6,20}$/, "Invalid phone number"),
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 5) return true;
  entry.count++;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const result = WaitlistSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id FROM WaitlistEntry WHERE email = ?",
    args: [result.data.email],
  });
  if (existing.rows.length > 0) return NextResponse.json({ success: true });

  await db.execute({
    sql: "INSERT INTO WaitlistEntry (firstName, lastName, company, email, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      result.data.firstName,
      result.data.lastName,
      result.data.company,
      result.data.email,
      result.data.phone,
      new Date().toISOString(),
    ],
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
