import { NextResponse } from "next/server";

export async function GET() {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "Google sign-in is not configured." },
      { status: 503 }
    );
  }

  const url = `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/google`;
  return NextResponse.redirect(url);
}
