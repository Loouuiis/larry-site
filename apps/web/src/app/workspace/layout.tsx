import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { WorkspaceShell } from "./WorkspaceShell";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: {
    displayName: string | null;
    emailVerifiedAt: string | null;
    verificationGraceDeadline: string | null;
    avatarUrl?: string | null;
  };
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch email verification state + profile from the API
  let emailVerified = true; // default to true for safety (legacy/dev sessions)
  let avatarUrl: string | null = null;
  // U-2: seed displayName from the session cookie before we fetch
  // /v1/auth/me. The cookie value was stashed at login/refresh time
  // (apps/web/src/app/api/auth/login/route.ts + lib/auth.ts). When the
  // /auth/me fetch is slow or fails, the sidebar still renders the
  // correct initials instead of falling back to the email prefix.
  let displayName: string | null = session.displayName ?? null;
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;

  if (apiBaseUrl && session.apiAccessToken) {
    try {
      const res = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${session.apiAccessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });

      if (res.ok) {
        const data = (await res.json()) as MeResponse;
        emailVerified = !!data.user.emailVerifiedAt;
        avatarUrl = data.user.avatarUrl ?? null;
        // Fresh value wins when available; stale session value stays as a
        // fallback in case a later field goes missing.
        displayName = data.user.displayName ?? displayName;

        // If past grace deadline and not verified, redirect to locked screen
        if (
          !emailVerified &&
          data.user.verificationGraceDeadline &&
          new Date(data.user.verificationGraceDeadline) < new Date()
        ) {
          redirect("/verify-email-required");
        }
      }
    } catch {
      // If the API call fails, don't block — default to verified
    }
  }

  return (
    <WorkspaceShell userEmail={session.email} emailVerified={emailVerified} avatarUrl={avatarUrl} displayName={displayName}>
      {children}
    </WorkspaceShell>
  );
}
