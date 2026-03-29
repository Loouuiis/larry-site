import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Legacy workspace action routes have been retired. Use /api/workspace/larry/events instead." },
    { status: 410 },
  );
}
