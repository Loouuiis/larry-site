import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy action approval routes have been retired. Use the Larry event routes instead." },
    { status: 410 },
  );
}
