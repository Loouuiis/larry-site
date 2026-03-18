import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

function hasTursoConfig(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (session.authMode === "api" || session.authMode === "dev" || !hasTursoConfig()) {
    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email ?? null,
        tenantId: session.tenantId ?? null,
        role: session.role ?? null,
        authMode: session.authMode ?? "unknown",
      },
    });
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
    return NextResponse.json({
      user: {
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
        authMode: "legacy",
      },
    });
  } catch (err) {
    console.error("[me]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
