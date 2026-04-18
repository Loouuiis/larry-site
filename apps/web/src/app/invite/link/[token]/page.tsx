import { MailX, Clock, AlertCircle } from "lucide-react";
import { RedeemForm } from "./RedeemForm";

export const dynamic = "force-dynamic";

interface Preview {
  tenantName: string | null;
  tenantSlug: string | null;
  defaultRole: string;
  defaultProjectId: string | null;
  defaultProjectRole: "owner" | "editor" | "viewer" | null;
  projectName: string | null;
  expiresAt: string | null;
  usesRemaining: number | null;
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
      `${base}/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return { kind: "notFound" };
    if (res.status === 410) {
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      return { kind: "gone", code: data.code ?? "invite_link_unavailable" };
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

export default async function InviteLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchPreview(token);

  if (result.kind === "notFound") {
    return (
      <Shell>
        <StateCard
          icon={<MailX size={40} color="#b91c1c" />}
          title="Invite link not found"
          body="This link doesn't match any invite. Double-check the URL or ask the sender for a new one."
          cta={{ href: "/", label: "Go to larry-pm.com" }}
        />
      </Shell>
    );
  }

  if (result.kind === "gone") {
    const msg =
      result.code === "invite_link_revoked"
        ? {
            icon: <MailX size={40} color="#b91c1c" />,
            title: "This link was revoked",
            body: "The admin cancelled this link. Ask them to send a new one.",
            cta: { href: "/", label: "Go to larry-pm.com" },
          }
        : result.code === "invite_link_exhausted"
          ? {
              icon: <AlertCircle size={40} color="#b45309" />,
              title: "This link is fully used",
              body: "It reached its maximum number of uses. Ask the admin for a new link.",
              cta: { href: "/", label: "Go to larry-pm.com" },
            }
          : {
              icon: <Clock size={40} color="#b45309" />,
              title: "This link has expired",
              body: "Ask the admin to issue a new one.",
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
          title="Couldn't load this invite"
          body="Something went wrong on our side. Please try again in a minute."
        />
      </Shell>
    );
  }

  const { tenantName, defaultRole, projectName, defaultProjectRole, expiresAt, usesRemaining } =
    result.data;

  return (
    <Shell>
      <div
        className="w-full max-w-[440px] rounded-2xl border p-8 space-y-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="text-center space-y-2">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "#f5f3ff", color: "#6c44f6", fontWeight: 700, fontSize: 20 }}
          >
            L
          </div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>
            Join {tenantName ?? "a Larry workspace"}
          </h1>
          {projectName && (
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Project: <strong>{projectName}</strong>
              {defaultProjectRole ? ` · ${defaultProjectRole}` : ""}
            </p>
          )}
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            You'll join as <strong>{defaultRole}</strong>
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {usesRemaining !== null ? `${usesRemaining} use${usesRemaining === 1 ? "" : "s"} remaining` : "Unlimited uses"}
            {expiresAt ? ` · Expires ${new Date(expiresAt).toLocaleString()}` : ""}
          </p>
        </div>

        <RedeemForm token={token} />
      </div>
    </Shell>
  );
}
