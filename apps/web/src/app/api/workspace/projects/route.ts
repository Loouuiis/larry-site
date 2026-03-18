import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof CreateProjectSchema>;
  try {
    payload = CreateProjectSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid project payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
