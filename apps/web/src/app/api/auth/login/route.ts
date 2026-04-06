import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

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

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "Login service is not configured." },
        { status: 503 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Missing tenant ID for API login. Set LARRY_API_TENANT_ID in web env." },
        { status: 400 }
      );
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          email,
          password: String(password),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return NextResponse.json(
        { error: "Login service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    if (!apiResponse.ok) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const payload = (await apiResponse.json()) as ApiLoginResponse;
    if (!payload?.user?.id || !payload?.accessToken) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
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
