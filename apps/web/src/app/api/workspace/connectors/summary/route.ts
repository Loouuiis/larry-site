import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

function extractError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("error" in value && typeof value.error === "string") return value.error;
  if ("message" in value && typeof value.message === "string") return value.message;
  return undefined;
}

async function loadInstallUrl(
  path: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
): Promise<{ installUrl?: string; error?: string }> {
  const result = await proxyApiRequest(session, path);
  if (result.session) {
    await persistSession(result.session);
  }
  if (result.status >= 400) {
    return { error: extractError(result.body) ?? "Install URL unavailable." };
  }
  if (
    result.body &&
    typeof result.body === "object" &&
    "installUrl" in result.body &&
    typeof result.body.installUrl === "string"
  ) {
    return { installUrl: result.body.installUrl };
  }
  return {};
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [slack, calendar, outlookCalendar, email] = await Promise.all([
    proxyApiRequest(session, "/v1/connectors/slack/status"),
    proxyApiRequest(session, "/v1/connectors/google-calendar/status"),
    proxyApiRequest(session, "/v1/connectors/outlook-calendar/status"),
    proxyApiRequest(session, "/v1/connectors/email/status"),
  ]);

  const updatedSession =
    slack.session ?? calendar.session ?? outlookCalendar.session ?? email.session ?? session;
  if (updatedSession) {
    await persistSession(updatedSession);
  }

  const [slackInstall, calendarInstall, outlookInstall, emailInstall] = await Promise.all([
    loadInstallUrl("/v1/connectors/slack/install-url", updatedSession),
    loadInstallUrl("/v1/connectors/google-calendar/install-url", updatedSession),
    loadInstallUrl("/v1/connectors/outlook-calendar/install-url", updatedSession),
    loadInstallUrl("/v1/connectors/email/install-url", updatedSession),
  ]);

  return NextResponse.json({
    connectors: {
      slack: {
        ...(typeof slack.body === "object" && slack.body ? slack.body : { connected: false }),
        installUrl: slackInstall.installUrl,
        installError: slackInstall.error,
      },
      calendar: {
        ...(typeof calendar.body === "object" && calendar.body ? calendar.body : { connected: false }),
        installUrl: calendarInstall.installUrl,
        installError: calendarInstall.error,
      },
      outlookCalendar: {
        ...(typeof outlookCalendar.body === "object" && outlookCalendar.body
          ? outlookCalendar.body
          : { connected: false }),
        installUrl: outlookInstall.installUrl,
        installError: outlookInstall.error,
      },
      email: {
        ...(typeof email.body === "object" && email.body ? email.body : { connected: false }),
        installUrl: emailInstall.installUrl,
        installError: emailInstall.error,
      },
    },
  });
}

