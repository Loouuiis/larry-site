import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const db = getDb();
    const result = await db.execute({
      sql: "SELECT id, email, created_at FROM users WHERE id = ?",
      args: [session.userId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const row = result.rows[0];
    // Never return password_hash — only safe fields
    return NextResponse.json({
      user: { id: row.id, email: row.email, createdAt: row.created_at },
    });
  } catch (err) {
    console.error("[me]", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
