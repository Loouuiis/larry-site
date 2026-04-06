import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ApiSignupResponse {
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

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "Signup service is not configured." },
        { status: 503 }
      );
    }

    const tenantId =
      typeof body?.tenantId === "string" && body.tenantId.length > 0
        ? body.tenantId
        : process.env.LARRY_API_TENANT_ID;

    let apiResponse: Response;
    try {
      apiResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/signup`, {
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
        { error: "Signup service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    if (!apiResponse.ok) {
      // Try to extract error message from API response
      try {
        const errorBody = await apiResponse.json();
        if (errorBody?.error) {
          return NextResponse.json(
            { error: errorBody.error },
            { status: apiResponse.status }
          );
        }
      } catch {
        // ignore JSON parse errors
      }
      return NextResponse.json(
        { error: "Signup failed. Please try again." },
        { status: apiResponse.status }
      );
    }

    const payload = (await apiResponse.json()) as ApiSignupResponse;
    if (!payload?.user?.id || !payload?.accessToken) {
      return NextResponse.json(
        { error: "Signup failed. Please try again." },
        { status: 500 }
      );
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
