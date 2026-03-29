import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy action rejection routes have been retired. Use the Larry event routes instead." },
    { status: 410 },
  );
}
