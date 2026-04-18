import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateSchema = z.object({
  defaultRole: z.enum(["admin", "pm", "member"]).default("member"),
  defaultProjectId: z.string().uuid().optional(),
  defaultProjectRole: z.enum(["owner", "editor", "viewer"]).optional(),
  maxUses: z.number().int().positive().max(10_000).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, "/v1/orgs/invite-links", { method: "GET" });
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
    return NextResponse.json({ error: "Invalid invite-link payload." }, { status: 400 });
  }
  const result = await proxyApiRequest(session, "/v1/orgs/invite-links", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
