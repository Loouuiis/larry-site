import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const ChatSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1).max(8000),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof ChatSchema>;
  try {
    payload = ChatSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid chat payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(
    session,
    "/v1/larry/chat",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { timeoutMs: 60_000 }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
