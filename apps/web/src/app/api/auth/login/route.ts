import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit, recordLoginAttempt } from "@/lib/rate-limit";

const GENERIC_ERROR = "Invalid email or password.";

interface ApiLoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    role: string;
  };
}

function hasTursoConfig(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

async function tryApiLogin(input: {
  apiBaseUrl: string;
  tenantId: string;
  email: string;
  password: string;
}): Promise<{
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  accessToken: string;
  refreshToken?: string;
} | null> {
  try {
    const response = await fetch(`${input.apiBaseUrl.replace(/\/+$/, "")}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: input.tenantId,
        email: input.email,
        password: input.password,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as ApiLoginResponse;
    if (!payload?.user?.id || !payload?.accessToken) return null;

    return {
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

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
    const tenantId =
      typeof body?.tenantId === "string" && body.tenantId.length > 0
        ? body.tenantId
        : process.env.LARRY_API_TENANT_ID;

    if (!rawEmail || !password) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const email = normalizeEmail(String(rawEmail));
    await recordLoginAttempt(ip);

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (apiBaseUrl) {
      if (!tenantId) {
        return NextResponse.json(
          { error: "Missing tenant ID for API login. Set LARRY_API_TENANT_ID in web env." },
          { status: 400 }
        );
      }

      const apiAuth = await tryApiLogin({
        apiBaseUrl,
        tenantId,
        email,
        password: String(password),
      });

      if (!apiAuth) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
      }

      const token = await createSessionToken({
        userId: apiAuth.userId,
        email: apiAuth.email,
        tenantId: apiAuth.tenantId,
        role: apiAuth.role,
        apiAccessToken: apiAuth.accessToken,
        apiRefreshToken: apiAuth.refreshToken,
        authMode: "api",
      });
      const res = NextResponse.json({ success: true });
      res.cookies.set(sessionCookieOptions(token));
      return res;
    }

    if (!hasTursoConfig()) {
      return NextResponse.json(
        {
          error:
            "Login is not configured. Set LARRY_API_BASE_URL/LARRY_API_TENANT_ID for API auth, or TURSO_DATABASE_URL/TURSO_AUTH_TOKEN for legacy auth.",
        },
        { status: 503 }
      );
    }

    const db = getDb();
    const result = await db.execute({
      sql: "SELECT id, password_hash FROM users WHERE email = ?",
      args: [email],
    });

    if (result.rows.length === 0) {
      await verifyPassword(
        String(password),
        "$2b$12$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      );
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = result.rows[0];
    const valid = await verifyPassword(String(password), String(user.password_hash));

    if (!valid) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: String(user.id),
      email,
      authMode: "legacy",
    });
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
