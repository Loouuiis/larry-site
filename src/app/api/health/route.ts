import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const url = process.env.TURSO_DATABASE_URL ?? "(not set)";
  const hasToken = !!process.env.TURSO_AUTH_TOKEN;

  try {
    const db = getDb();
    await db.execute("SELECT 1");
    return NextResponse.json({ ok: true, url, hasToken });
  } catch (err) {
    return NextResponse.json(
      { ok: false, url, hasToken, error: String(err) },
      { status: 500 }
    );
  }
}
