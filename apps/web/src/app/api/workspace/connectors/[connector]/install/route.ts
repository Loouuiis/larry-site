import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CONNECTOR_INSTALL_PATH: Record<string, string> = {
  slack: "/v1/connectors/slack/install-url",
  calendar: "/v1/connectors/google-calendar/install-url",
  outlookCalendar: "/v1/connectors/outlook-calendar/install-url",
  email: "/v1/connectors/email/install-url",
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ connector: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const path = CONNECTOR_INSTALL_PATH[params.connector];
  if (!path) {
    return NextResponse.json({ error: "Unsupported connector." }, { status: 404 });
  }

  const result = await proxyApiRequest(session, path, { method: "GET" });
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
