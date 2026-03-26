import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const LarryCommandSchema = z.object({
  intent: z
    .enum(["create_plan", "update_scope", "request_summary", "draft_follow_up", "create_project", "freeform"])
    .default("freeform"),
  input: z.string().min(3).max(8000),
  projectId: z.string().uuid().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["execute", "preview"]).default("execute"),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof LarryCommandSchema>;
  try {
    payload = LarryCommandSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid Larry command payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(
    session,
    "/v1/larry/commands",
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
