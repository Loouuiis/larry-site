import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "larry_session";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
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
  matcher: ["/dashboard/:path*"],
};
