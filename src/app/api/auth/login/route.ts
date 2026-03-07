import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit, recordLoginAttempt } from "@/lib/rate-limit";

// Generic error prevents user enumeration — never reveal whether the
// email exists or the password is wrong.
const GENERIC_ERROR = "Invalid email or password.";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const { limited } = await checkRateLimit(ip);
    if (limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait 15 minutes and try again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email: rawEmail, password } = body ?? {};

    if (!rawEmail || !password) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const email = normalizeEmail(String(rawEmail));

    // Record the attempt before querying so rate-limit is enforced even on
    // invalid input — prevents probing with arbitrary emails for free.
    await recordLoginAttempt(ip);

    const db = getDb();
    const result = await db.execute({
      sql: "SELECT id, password_hash FROM users WHERE email = ?",
      args: [email],
    });

    if (result.rows.length === 0) {
      // bcrypt compare against a dummy hash equalises timing so response
      // time cannot reveal whether the email exists.
      await verifyPassword(String(password), "$2b$12$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = result.rows[0];
    const valid = await verifyPassword(
      String(password),
      String(user.password_hash)
    );

    if (!valid) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const token = await createSessionToken(String(user.id));
    const res = NextResponse.json({ success: true });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
