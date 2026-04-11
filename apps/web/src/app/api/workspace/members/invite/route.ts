import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  displayName: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof InviteSchema>;
  try {
    payload = InviteSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid invite payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/auth/members/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
