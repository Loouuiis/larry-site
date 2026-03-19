import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const SendDraftSchema = z.object({
  projectId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  to: z.string().min(1),
  subject: z.string().min(1).max(400),
  body: z.string().min(1).max(20_000),
  sendNow: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof SendDraftSchema>;
  try {
    payload = SendDraftSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid email draft payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/connectors/email/draft/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

