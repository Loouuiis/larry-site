import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const LarryRunSchema = z.object({
  prompt: z.string().min(3).max(4000),
  projectId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof LarryRunSchema>;
  try {
    payload = LarryRunSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid Larry prompt payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(
    session,
    "/v1/larry/commands",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "freeform",
        input: payload.prompt,
        projectId: payload.projectId,
        mode: "execute",
      }),
    },
    { timeoutMs: 60_000 }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
