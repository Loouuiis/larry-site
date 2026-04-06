import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

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
