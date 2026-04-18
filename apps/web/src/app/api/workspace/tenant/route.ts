import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

// PATCH /api/workspace/tenant — rename the current tenant.
// Used by Step 2 of the 3-step signup wizard (#86) when the user
// customises the prefilled workspace name.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2 || name.length > 200) {
    return NextResponse.json(
      { error: "Workspace name must be between 2 and 200 characters." },
      { status: 400 }
    );
  }

  const result = await proxyApiRequest(session, "/v1/orgs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (result.session) {
    await persistSession(result.session);
  }
  return NextResponse.json(result.body, { status: result.status });
}
