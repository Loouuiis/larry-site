import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const OrgRequestSchema = z.object({
  companyName: z.string().min(2).max(200),
  requesterName: z.string().min(2).max(120),
  requesterEmail: z.string().email(),
  teamSize: z.string().min(1).max(40).optional(),
  launchContext: z.string().max(2_000).optional(),
});

function getApiBaseUrl(): string {
  return (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

async function parseApiBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? { message: text } : {};
}

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof OrgRequestSchema>;
  try {
    payload = OrgRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/v1/orgs/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const body = await parseApiBody(response);
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send the org request right now.",
      },
      { status: 504 }
    );
  }
}
