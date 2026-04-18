import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

// POST /api/invitations — create a pending invitation for the current tenant.
// Used by Step 2 of the 3-step signup wizard (#86) when the user seeds
// teammate emails. Also usable by the regular in-app invite modal.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const role = typeof body?.role === "string" ? body.role : "member";

  const result = await proxyApiRequest(session, "/v1/orgs/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });

  if (result.session) {
    await persistSession(result.session);
  }
  return NextResponse.json(result.body, { status: result.status });
}
