import { getSession } from "@/lib/auth";
import Image from "next/image";
import { MailX, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { AcceptForm } from "./AcceptForm";

export const dynamic = "force-dynamic";

interface Preview {
  email: string;
  role: string;
  expiresAt: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  projectId: string | null;
  projectRole: "owner" | "editor" | "viewer" | null;
  projectName: string | null;
}

type PreviewResult =
  | { kind: "ok"; data: Preview }
  | { kind: "notFound" }
  | { kind: "gone"; code: string }
  | { kind: "error" };

async function fetchPreview(token: string): Promise<PreviewResult> {
  const base = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(
      `${base}/v1/orgs/invitations/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return { kind: "notFound" };
    if (res.status === 410) {
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      return { kind: "gone", code: data.code ?? "invite_unavailable" };
    }
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as Preview;
    return { kind: "ok", data };
  } catch {
    return { kind: "error" };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center p-6"
      style={{ background: "var(--page-bg)" }}
    >
      {children}
    </main>
  );
}

function StateCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border p-8 text-center space-y-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex justify-center">{icon}</div>
      <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>
        {title}
      </h1>
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        {body}
      </p>
      {cta && (
        <a
          href={cta.href}
          className="inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold text-white"
          style={{ background: "#6c44f6" }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}

async function fetchCurrentTenantName(
  accessToken: string,
): Promise<string | null> {
  const base = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/v1/auth/tenants`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tenants?: Array<{ name: string; current: boolean }>;
    };
    return data.tenants?.find((t) => t.current)?.name ?? null;
  } catch {
    return null;
  }
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await getSession();
  const currentUserEmail = session?.email ?? null;
  const currentTenantId = session?.tenantId ?? null;
  const currentTenantName =
    session?.apiAccessToken
      ? await fetchCurrentTenantName(session.apiAccessToken)
      : null;

  if (!token) {
    return (
      <Shell>
        <StateCard
          icon={<AlertCircle size={40} color="#b45309" />}
          title="No invitation token"
          body="The link you followed is missing its token. Ask the person who invited you to resend it."
          cta={{ href: "/", label: "Go to larry-pm.com" }}
        />
      </Shell>
    );
  }

  const result = await fetchPreview(token);

  if (result.kind === "notFound") {
    return (
      <Shell>
        <StateCard
          icon={<MailX size={40} color="#b91c1c" />}
          title="Invitation not found"
          body="This link doesn't match any invitation. Double-check the URL or ask for a new one."
          cta={{ href: "/", label: "Go to larry-pm.com" }}
        />
      </Shell>
    );
  }

  if (result.kind === "gone") {
    const msg =
      result.code === "invite_accepted"
        ? {
            icon: <CheckCircle2 size={40} color="#15803d" />,
            title: "This invitation was already accepted",
            body: "You should already have access. Try signing in.",
            cta: { href: "/login", label: "Sign in" },
          }
        : result.code === "invite_revoked"
          ? {
              icon: <MailX size={40} color="#b91c1c" />,
              title: "This invitation was revoked",
              body: "The admin cancelled this invitation. Ask them to send a new one.",
              cta: { href: "/", label: "Go to larry-pm.com" },
            }
          : {
              icon: <Clock size={40} color="#b45309" />,
              title: "This invitation has expired",
              body: "Invitations are valid for 7 days. Ask the admin to resend it.",
              cta: { href: "/", label: "Go to larry-pm.com" },
            };
    return (
      <Shell>
        <StateCard {...msg} />
      </Shell>
    );
  }

  if (result.kind === "error") {
    return (
      <Shell>
        <StateCard
          icon={<AlertCircle size={40} color="#b91c1c" />}
          title="Couldn't load your invitation"
          body="Something went wrong on our side. Please try again in a minute."
        />
      </Shell>
    );
  }

  const { email, role, tenantId, tenantName, expiresAt, projectName, projectRole } = result.data;

  // Signed-in as the same email but in a different tenant: accepting replaces
  // the session. We don't *lose* the current membership — the row stays — but
  // the user will need the workspace switcher to get back. Surface that.
  const willSwitchTenant =
    currentUserEmail !== null &&
    currentUserEmail.toLowerCase() === email.toLowerCase() &&
    currentTenantId !== null &&
    currentTenantId !== tenantId;

  return (
    <Shell>
      <div
        className="w-full max-w-[440px] rounded-2xl border p-8 space-y-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Image src="/Larryfulllogo.png" alt="Larry" width={105} height={38} className="object-contain" />
          </div>
          <h1
            className="text-[20px] font-semibold"
            style={{ color: "var(--text-1)" }}
          >
            You&apos;re invited to join {tenantName ?? "a Larry workspace"}
          </h1>
          {projectName && (
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Project: <strong>{projectName}</strong>
              {projectRole ? ` · ${projectRole}` : ""}
            </p>
          )}
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            Joining as <strong>{email}</strong>
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            Role: <strong>{role}</strong>
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Invitation expires {new Date(expiresAt).toLocaleString()}
          </p>
        </div>

        {willSwitchTenant && (
          <div
            className="rounded-lg border px-3 py-2 text-[12px]"
            style={{
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
            }}
          >
            You'll keep your {currentTenantName ? <strong>{currentTenantName}</strong> : "current workspace"} membership.
            Accepting adds <strong>{tenantName ?? "this workspace"}</strong> as a second one — your active session will switch to it, and you can flip back anytime from the topbar.
          </div>
        )}

        <AcceptForm
          token={token}
          email={email}
          currentUserEmail={currentUserEmail}
          willSwitchTenant={willSwitchTenant}
          targetTenantName={tenantName}
        />
      </div>
    </Shell>
  );
}
