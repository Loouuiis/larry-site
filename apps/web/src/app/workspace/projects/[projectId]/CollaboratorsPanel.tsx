"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type {
  ProjectMembershipRole,
  WorkspaceProjectMembers,
} from "@/app/dashboard/types";

interface TenantMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

const ROLE_OPTIONS: ProjectMembershipRole[] = ["owner", "editor", "viewer"];

function formatRole(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

export function CollaboratorsPanel({ projectId }: { projectId: string }) {
  const [membersPayload, setMembersPayload] = useState<WorkspaceProjectMembers | null>(null);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, ProjectMembershipRole>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectMembershipRole>("viewer");
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");

  const canManage = membersPayload?.canManage ?? false;

  const availableTenantMembers = useMemo(() => {
    if (!membersPayload) return [];
    const existing = new Set(membersPayload.members.map((member) => member.userId));
    return tenantMembers.filter((member) => !existing.has(member.id));
  }, [membersPayload, tenantMembers]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInlineError(null);

    try {
      const [membersResponse, tenantMembersResponse] = await Promise.all([
        fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, {
          cache: "no-store",
        }),
        fetch("/api/workspace/members", { cache: "no-store" }),
      ]);

      const membersData = await readJson<WorkspaceProjectMembers & { error?: string }>(
        membersResponse
      );
      const tenantMembersData = await readJson<{ members?: TenantMember[]; error?: string }>(
        tenantMembersResponse
      );

      if (!membersResponse.ok) {
        throw new Error(membersData.error ?? "Failed to load collaborators.");
      }

      setMembersPayload({
        projectId: membersData.projectId,
        currentUserRole: membersData.currentUserRole ?? null,
        canManage: Boolean(membersData.canManage),
        members: Array.isArray(membersData.members) ? membersData.members : [],
      });

      setTenantMembers(
        tenantMembersResponse.ok && Array.isArray(tenantMembersData.members)
          ? tenantMembersData.members
          : []
      );
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load collaborators."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!membersPayload) return;
    setRoleDrafts(
      Object.fromEntries(
        membersPayload.members.map((member) => [member.userId, member.projectRole])
      ) as Record<string, ProjectMembershipRole>
    );
  }, [membersPayload]);

  useEffect(() => {
    if (availableTenantMembers.length === 0) {
      setAddUserId("");
      return;
    }
    if (!availableTenantMembers.some((member) => member.id === addUserId)) {
      setAddUserId(availableTenantMembers[0].id);
    }
  }, [addUserId, availableTenantMembers]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !addUserId) return;

    setBusyAction("add");
    setInlineError(null);

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: addUserId, role: addRole }),
        }
      );
      const data = await readJson<WorkspaceProjectMembers & { error?: string }>(response);
      if (!response.ok) {
        setInlineError(data.error ?? "Could not add collaborator.");
        return;
      }
      setMembersPayload(data);
      setShowAddForm(false);
      setAddRole("viewer");
    } catch (mutationError) {
      setInlineError(
        mutationError instanceof Error ? mutationError.message : "Could not add collaborator."
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function updateRole(userId: string) {
    if (!canManage) return;
    const role = roleDrafts[userId];
    if (!role) return;

    setBusyAction(`update:${userId}`);
    setInlineError(null);

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      const data = await readJson<WorkspaceProjectMembers & { error?: string }>(response);
      if (!response.ok) {
        setInlineError(data.error ?? "Could not update collaborator role.");
        return;
      }
      setMembersPayload(data);
    } catch (mutationError) {
      setInlineError(
        mutationError instanceof Error
          ? mutationError.message
          : "Could not update collaborator role."
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function removeMember(userId: string) {
    if (!canManage) return;

    setBusyAction(`remove:${userId}`);
    setInlineError(null);

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        }
      );
      const data = await readJson<WorkspaceProjectMembers & { error?: string }>(response);
      if (!response.ok) {
        setInlineError(data.error ?? "Could not remove collaborator.");
        return;
      }
      setMembersPayload(data);
    } catch (mutationError) {
      setInlineError(
        mutationError instanceof Error ? mutationError.message : "Could not remove collaborator."
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
            Team
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Team members and collaborators with shared access to the project.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5 self-start" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={{
              background: viewMode === "list" ? "var(--surface-2)" : "transparent",
              color: viewMode === "list" ? "var(--text-1)" : "var(--text-muted)",
            }}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("tree")}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={{
              background: viewMode === "tree" ? "var(--surface-2)" : "transparent",
              color: viewMode === "tree" ? "var(--text-1)" : "var(--text-muted)",
            }}
          >
            Tree
          </button>
        </div>
      </div>

      {loading && (
        <p className="mt-5 text-[14px]" style={{ color: "var(--text-muted)" }}>
          Loading collaborators...
        </p>
      )}

      {!loading && error && (
        <div
          className="mt-4 rounded-[16px] border px-4 py-3 text-[13px]"
          style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && membersPayload && (
        <div className="mt-5 space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {membersPayload.currentUserRole === "owner"
              ? "Your role: Owner (Full control and manages access)"
              : membersPayload.currentUserRole === "editor"
              ? "Your role: Editor (Can edit the project)"
              : membersPayload.currentUserRole === "viewer"
              ? "Your role: Viewer (Can view the project)"
              : "No role assigned"}
          </p>

          {canManage && (
            <div>
              {!showAddForm ? (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
                  style={{ color: "var(--cta)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <Plus size={14} />
                  Add member
                </button>
              ) : availableTenantMembers.length === 0 ? (
                <div className="flex items-center justify-between rounded-[16px] border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    All workspace members are already in this project.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex items-center justify-center"
                    style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void addMember(e)}
                  className="flex items-end gap-2 rounded-[16px] border px-4 py-3"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <label className="flex-1 text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    Member
                    <select
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
                    >
                      {availableTenantMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-[130px] shrink-0 text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    Role
                    <select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value as ProjectMembershipRole)}
                      className="mt-1 w-full rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {formatRole(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={busyAction === "add" || !addUserId}
                    className="h-[40px] shrink-0 rounded-full px-4 text-[12px] font-semibold text-white"
                    style={{ background: "var(--cta)" }}
                  >
                    {busyAction === "add" ? "Adding..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="h-[40px] shrink-0 flex items-center justify-center"
                    style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                </form>
              )}
            </div>
          )}

          {inlineError && (
            <div
              className="rounded-[16px] border px-4 py-3 text-[13px]"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
            >
              {inlineError}
            </div>
          )}

          {viewMode === "list" && (
            <div className="space-y-2">
              {membersPayload.members.length === 0 ? (
                <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                  No collaborators found.
                </p>
              ) : (
                membersPayload.members.map((member) => {
                  const updateKey = `update:${member.userId}`;
                  const removeKey = `remove:${member.userId}`;
                  return (
                    <div
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-3"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                          {member.name}
                        </p>
                        <p className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {member.email} - Tenant {formatRole(member.tenantRole)}
                        </p>
                      </div>

                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={roleDrafts[member.userId] ?? member.projectRole}
                            onChange={(event) =>
                              setRoleDrafts((current) => ({
                                ...current,
                                [member.userId]: event.target.value as ProjectMembershipRole,
                              }))
                            }
                            disabled={busyAction === updateKey || busyAction === removeKey}
                            className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {formatRole(role)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void updateRole(member.userId)}
                            disabled={busyAction === updateKey || busyAction === removeKey}
                            className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                          >
                            {busyAction === updateKey ? "Updating..." : "Update"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeMember(member.userId)}
                            disabled={busyAction === updateKey || busyAction === removeKey}
                            className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                            style={{ borderColor: "#fecaca", color: "#b91c1c", background: "#fff" }}
                          >
                            {busyAction === removeKey ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      ) : (
                        <span
                          className="rounded-full border px-3 py-1 text-[12px] font-semibold"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
                        >
                          {formatRole(member.projectRole)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "tree" && (
            <div className="space-y-1">
              {(["owner", "editor", "viewer"] as const).map((role) => {
                const roleMembers = membersPayload.members.filter((m) => m.projectRole === role);
                if (roleMembers.length === 0) return null;
                return (
                  <div key={role}>
                    <p
                      className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-disabled)" }}
                    >
                      {role === "owner" ? "Owners" : role === "editor" ? "Editors" : "Viewers"}
                    </p>
                    {roleMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
                        style={{ marginLeft: role === "editor" ? "16px" : role === "viewer" ? "32px" : "0" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                          style={{ background: "var(--brand-soft, #f0edfa)", color: "var(--brand)" }}
                        >
                          {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                            {member.name}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: "var(--text-disabled)" }}>
                            {member.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
