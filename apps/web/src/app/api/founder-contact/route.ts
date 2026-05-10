import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { checkNamedRateLimit } from "@/lib/rate-limit";

const FounderContactSchema = z.object({
  email:   z.string().email().max(320).toLowerCase().trim(),
  message: z.string().max(4000).trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { limited } = await checkNamedRateLimit({
    namespace: "founder-contact",
    identifier: ip,
    max: 3,
    windowSecs: 60,
  });
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const result = FounderContactSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const db = getDb();
    await db.execute({
      sql: "INSERT INTO FounderContactEntry (email, message, createdAt) VALUES (?, ?, ?)",
      args: [result.data.email, result.data.message ?? null, new Date().toISOString()],
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[founder-contact] DB error:", err);
    return NextResponse.json({ error: "Failed to save submission. Please try again." }, { status: 500 });
  }
}
