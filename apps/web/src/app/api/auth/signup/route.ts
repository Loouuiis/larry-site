import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  hashPassword,
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasTursoConfig(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email: rawEmail, password, confirmPassword } = body ?? {};

    if (!rawEmail || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 }
      );
    }

    const email = normalizeEmail(String(rawEmail));
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    if (!hasTursoConfig()) {
      return NextResponse.json(
        {
          error:
            "Signup is temporarily disabled in workspace mode. Use the existing dev login or the dev bypass button.",
        },
        { status: 503 }
      );
    }

    const db = getDb();

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [email],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    await db.execute({
      sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      args: [id, email, passwordHash, new Date().toISOString()],
    });

    const token = await createSessionToken({
      userId: id,
      email,
      authMode: "legacy",
    });
    const res = NextResponse.json({ success: true }, { status: 201 });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
