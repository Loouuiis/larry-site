import type { Role } from "@larry/shared";

export const ACTIVE_TENANT_ROLES = ["owner", "admin", "pm", "member"] as const;
export const INVITABLE_TENANT_ROLES = ["admin", "pm", "member"] as const;
export type InvitableTenantRole = (typeof INVITABLE_TENANT_ROLES)[number];

function effective(r: Role): Exclude<Role, "executive"> {
  return r === "executive" ? "member" : r;
}

export function canInviteMembers(r: Role): boolean {
  const e = effective(r);
  return e === "owner" || e === "admin";
}

export function canManageMembers(r: Role): boolean {
  return canInviteMembers(r);
}

export function canChangeOrgSettings(r: Role): boolean {
  return canInviteMembers(r);
}

export function canViewAllProjects(r: Role): boolean {
  return canInviteMembers(r);
}

export function canManageAllProjects(r: Role): boolean {
  return canInviteMembers(r);
}

export function canTransferOrgOwnership(r: Role): boolean {
  return effective(r) === "owner";
}

export function canInviteRoleAs(actor: Role, target: Role): boolean {
  if (!canInviteMembers(actor)) return false;
  return (INVITABLE_TENANT_ROLES as readonly string[]).includes(target);
}
