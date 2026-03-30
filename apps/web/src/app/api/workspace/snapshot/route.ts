import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "Legacy workspace snapshot route has been retired.",
      retiredEndpoint: "/api/workspace/snapshot",
      replacementEndpoints: [
        "/api/workspace/home",
        "/api/workspace/projects/:id/overview",
        "/api/workspace/larry/action-centre"
      ]
    },
    { status: 410 }
  );
}
