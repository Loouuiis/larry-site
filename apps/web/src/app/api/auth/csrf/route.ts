import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Returns the current session's CSRF token. Clients can call this to
// hydrate the token when the `larry_csrf` cookie is not readable (e.g.,
// server components, first paint before middleware has run). All
// mutating /api/** requests must echo this value in `X-CSRF-Token`.
export async function GET() {
  const session = await getSession();
  if (!session?.csrfToken) {
    return NextResponse.json(
      { error: "No active session." },
      { status: 401 },
    );
  }
  return NextResponse.json({ csrfToken: session.csrfToken });
}
