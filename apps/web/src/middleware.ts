import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "larry_session";
const DEV_SESSION_SECRET = "larry-dev-session-secret-change-me-before-production-32+";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_SESSION_SECRET);
  }

  return new TextEncoder().encode("");
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    // Token expired or invalid — clear cookie and redirect
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
    return res;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*"],
};
