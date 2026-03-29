import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "Legacy workspace event-list reads have been retired. Use /api/workspace/projects/:id/action-centre (project) or /api/workspace/larry/action-centre (global).",
    },
    { status: 410 }
  );
}
