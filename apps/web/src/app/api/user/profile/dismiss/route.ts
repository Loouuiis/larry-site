import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await proxyApiRequest(session, "/v1/user/profile/dismiss", {
    method: "POST",
  });
  if (result.session) {
    await persistSession(result.session);
  }
  return NextResponse.json(result.body, { status: result.status });
}
