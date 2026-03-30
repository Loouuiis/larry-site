"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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
            Collaborators
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Project-scoped members and roles for shared chat and action visibility.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[12px] font-semibold"
          style={{ color: "var(--cta)" }}
        >
          Refresh
        </button>
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
            Your role: {membersPayload.currentUserRole ? formatRole(membersPayload.currentUserRole) : "None"}
            {canManage ? " (can manage collaborators)" : " (read-only)"}
          </p>

          {canManage && (
            <form onSubmit={addMember} className="space-y-3 rounded-[16px] border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Member
                  <select
                    value={addUserId}
                    onChange={(event) => setAddUserId(event.target.value)}
                    disabled={busyAction === "add" || availableTenantMembers.length === 0}
                    className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
                    style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
                  >
                    {availableTenantMembers.length === 0 && <option value="">All tenant members already added</option>}
                    {availableTenantMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Role
                  <select
                    value={addRole}
                    onChange={(event) => setAddRole(event.target.value as ProjectMembershipRole)}
                    disabled={busyAction === "add"}
                    className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
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
                  className="h-[40px] self-end rounded-full px-4 text-[12px] font-semibold text-white"
                  style={{ background: "var(--cta)" }}
                >
                  {busyAction === "add" ? "Adding..." : "Add member"}
                </button>
              </div>
            </form>
          )}

          {inlineError && (
            <div
              className="rounded-[16px] border px-4 py-3 text-[13px]"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
            >
              {inlineError}
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
