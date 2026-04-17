import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "pm", "member"]).default("member"),
  displayName: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const result = await proxyApiRequest(
    session,
    `/v1/orgs/invitations?status=${encodeURIComponent(status)}`,
    { method: "GET" },
  );
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let payload: z.infer<typeof CreateSchema>;
  try {
    payload = CreateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid invite payload." }, { status: 400 });
  }
  const result = await proxyApiRequest(session, "/v1/orgs/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
