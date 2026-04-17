"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, RefreshCw, Trash2 } from "lucide-react";
import { SettingsSubnav } from "../SettingsSubnav";
import { InviteModal } from "@/components/members/InviteModal";
import { PendingInvitationsPanel } from "@/components/members/PendingInvitationsPanel";

export const dynamic = "force-dynamic";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

type OrgRole = "admin" | "pm" | "member";

function getRoleBadgeStyle(role: string): React.CSSProperties & { borderColor: string } {
  switch (role) {
    case "owner":
      return { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
    case "admin":
      return { background: "#f5f3ff", color: "#6c44f6", borderColor: "#ddd6fe" };
    case "pm":
      return { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
    case "member":
      return { background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" };
    default:
      return { background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" };
  }
}

function getUserInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export default function MembersSettingsPage() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite modal open/close + pending-panel refresh trigger.
  const [showInvite, setShowInvite] = useState(false);
  const [refreshPending, setRefreshPending] = useState(0);

  // Role editing
  const [editingRole, setEditingRole] = useState<Record<string, OrgRole>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/members", { cache: "no-store" });
      const data = await readJson<{ members?: OrgMember[] }>(res);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch {
      setError("Failed to load members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const updateRole = async (userId: string) => {
    const newRole = editingRole[userId];
    if (!newRole) return;

    setBusyAction(`role:${userId}`);
    setActionError("");

    try {
      const res = await fetch(`/api/workspace/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await readJson<{ members?: OrgMember[]; error?: string }>(res);

      if (!res.ok) {
        setActionError(data.error ?? "Failed to update role.");
        return;
      }

      setMembers(Array.isArray(data.members) ? data.members : members);
      setEditingRole((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch {
      setActionError("Network error.");
    } finally {
      setBusyAction(null);
    }
  };

  const removeMember = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the workspace? They will lose access to all projects.`)) return;

    setBusyAction(`remove:${userId}`);
    setActionError("");

    try {
      const res = await fetch(`/api/workspace/members/${userId}`, { method: "DELETE" });
      const data = await readJson<{ members?: OrgMember[]; error?: string }>(res);

      if (!res.ok) {
        setActionError(data.error ?? "Failed to remove member.");
        return;
      }

      setMembers(Array.isArray(data.members) ? data.members : members);
    } catch {
      setActionError("Network error.");
    } finally {
      setBusyAction(null);
    }
  };

  const adminCount = members.filter((m) => m.role === "admin").length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[860px] px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text-1)" }}>
            Settings
          </h1>
          <SettingsSubnav active="members" />
        </div>

        {/* Intro + Invite Button */}
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "24px",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
                Workspace Members
              </h2>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Manage who has access to your workspace. Members can be added to individual projects with specific roles.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadMembers()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6" }}
              >
                <UserPlus size={14} />
                Invite member
              </button>
            </div>
          </div>
        </section>

        <PendingInvitationsPanel refreshKey={refreshPending} />

        {/* Error */}
        {error && (
          <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
            {actionError}
          </div>
        )}

        {/* Members list */}
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            className="grid items-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: "1fr 160px 200px 80px",
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <span>Member</span>
            <span>Role</span>
            <span>Actions</span>
            <span />
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading members...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[14px] font-medium" style={{ color: "var(--text-1)" }}>No members found</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Invite team members to get started.
              </p>
            </div>
          ) : (
            members.map((member, i) => {
              const currentRole = editingRole[member.id] ?? member.role;
              const hasChanged = editingRole[member.id] && editingRole[member.id] !== member.role;
              const isLastAdmin = member.role === "admin" && adminCount <= 1;
              const isOwner = member.role === "owner";

              return (
                <div
                  key={member.id}
                  className="grid items-center px-5 py-3"
                  style={{
                    gridTemplateColumns: "1fr 160px 200px 80px",
                    borderBottom: i < members.length - 1 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  {/* Member info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                      style={{ background: "#6c44f6", color: "#fff" }}
                    >
                      {getUserInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-1)" }}>
                        {member.name}
                      </p>
                      <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
                        {member.email}
                      </p>
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <select
                      value={currentRole as string}
                      onChange={(e) => setEditingRole((prev) => ({ ...prev, [member.id]: e.target.value as OrgRole }))}
                      disabled={isOwner || isLastAdmin || busyAction === `role:${member.id}` || busyAction === `remove:${member.id}`}
                      className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                      style={{
                        ...getRoleBadgeStyle(currentRole as string),
                        border: `1px solid ${getRoleBadgeStyle(currentRole as string).borderColor}`,
                        cursor: isOwner || isLastAdmin ? "not-allowed" : "pointer",
                        outline: "none",
                      }}
                    >
                      {isOwner && <option value="owner">Owner</option>}
                      <option value="admin">Admin</option>
                      <option value="pm">PM</option>
                      <option value="member">Member</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {hasChanged && (
                      <button
                        type="button"
                        onClick={() => void updateRole(member.id)}
                        disabled={busyAction === `role:${member.id}`}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white"
                        style={{ background: "#6c44f6" }}
                      >
                        {busyAction === `role:${member.id}` ? "Saving..." : "Save"}
                      </button>
                    )}
                    {hasChanged && (
                      <button
                        type="button"
                        onClick={() => setEditingRole((prev) => { const next = { ...prev }; delete next[member.id]; return next; })}
                        className="text-[11px] font-medium"
                        style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Remove */}
                  <div className="flex justify-end">
                    {!isLastAdmin && !isOwner && (
                      <button
                        type="button"
                        onClick={() => void removeMember(member.id, member.name)}
                        disabled={busyAction === `remove:${member.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                        style={{ color: "var(--text-disabled)" }}
                        title="Remove member"
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#b91c1c"; e.currentTarget.style.background = "#fef2f2"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-disabled)"; e.currentTarget.style.background = ""; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onInvited={() => {
          void loadMembers();
          setRefreshPending((n) => n + 1);
        }}
      />
    </div>
  );
}
