"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Shield, ShieldCheck, Eye, UserPlus, X, RefreshCw, Trash2 } from "lucide-react";
import { SettingsSubnav } from "../SettingsSubnav";

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

type OrgRole = "admin" | "member" | "viewer";

const ROLE_OPTIONS: { value: OrgRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin", label: "Admin", description: "Full access, can manage members and settings", icon: ShieldCheck },
  { value: "member", label: "Member", description: "Can create and edit projects", icon: Shield },
  { value: "viewer", label: "Viewer", description: "Can view projects they're added to", icon: Eye },
];

function formatRole(role: string): string {
  return role.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRoleBadgeStyle(role: string): React.CSSProperties {
  switch (role) {
    case "admin":
      return { background: "#f5f3ff", color: "#6c44f6", borderColor: "#ddd6fe" };
    case "member":
      return { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
    case "viewer":
      return { background: "#f0fdf4", color: "#15803d", borderColor: "#bbf7d0" };
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

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const res = await fetch("/api/workspace/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          displayName: inviteName.trim() || undefined,
        }),
      });
      const data = await readJson<{ members?: OrgMember[]; error?: string }>(res);

      if (!res.ok) {
        setInviteError(data.error ?? "Failed to invite member.");
        return;
      }

      setMembers(Array.isArray(data.members) ? data.members : members);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("member");
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setTimeout(() => setInviteSuccess(""), 4000);
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInviting(false);
    }
  };

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
                onClick={() => setShowInvite(!showInvite)}
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6" }}
              >
                <UserPlus size={14} />
                Invite member
              </button>
            </div>
          </div>

          {/* Invite form */}
          {showInvite && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{ borderColor: "#ddd6fe", background: "#faf8ff" }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                  Invite a new member
                </p>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteError(""); }}
                  style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                      Email address *
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-disabled)" }} />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                        required
                        className="h-10 w-full rounded-lg border pl-9 pr-3 text-[13px]"
                        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                      />
                    </div>
                  </div>
                  <div style={{ width: 180 }}>
                    <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                      Name (optional)
                    </label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="John Smith"
                      className="h-10 w-full rounded-lg border px-3 text-[13px]"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    />
                  </div>
                </div>

                {/* Role selector */}
                <div>
                  <label className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                    Role
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLE_OPTIONS.map((opt) => {
                      const isSelected = inviteRole === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInviteRole(opt.value)}
                          className="rounded-lg border p-3 text-left transition-all"
                          style={{
                            borderColor: isSelected ? "#6c44f6" : "var(--border)",
                            background: isSelected ? "rgba(108,68,246,0.05)" : "var(--surface)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon size={14} style={{ color: isSelected ? "#6c44f6" : "var(--text-muted)" }} />
                            <span className="text-[13px] font-semibold" style={{ color: isSelected ? "#6c44f6" : "var(--text-1)" }}>
                              {opt.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {inviteError && (
                  <div className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "#bbf7d0", background: "#f0fdf4", color: "#15803d" }}>
                    {inviteSuccess}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowInvite(false); setInviteError(""); }}
                    className="h-9 rounded-full border px-4 text-[12px] font-semibold"
                    style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting || !inviteEmail.trim()}
                    className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                    style={{ background: "#6c44f6", opacity: inviting ? 0.6 : 1 }}
                  >
                    {inviting ? "Sending invite..." : "Send invite"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

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
                      disabled={isLastAdmin || busyAction === `role:${member.id}` || busyAction === `remove:${member.id}`}
                      className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                      style={{
                        ...getRoleBadgeStyle(currentRole as string),
                        border: `1px solid ${getRoleBadgeStyle(currentRole as string).borderColor}`,
                        cursor: isLastAdmin ? "not-allowed" : "pointer",
                        outline: "none",
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
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
                    {!isLastAdmin && (
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
    </div>
  );
}
