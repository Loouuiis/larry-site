import { describe, expect, it } from "vitest";
import {
  canInviteMembers,
  canManageMembers,
  canChangeOrgSettings,
  canViewAllProjects,
  canManageAllProjects,
  canTransferOrgOwnership,
  canInviteRoleAs,
  INVITABLE_TENANT_ROLES,
} from "./permissions.js";
import type { Role } from "@larry/shared";

const ROLES: Role[] = ["owner", "admin", "pm", "member", "executive"];

describe("permissions", () => {
  it("canInviteMembers — owner + admin only", () => {
    expect(ROLES.filter(canInviteMembers)).toEqual(["owner", "admin"]);
  });
  it("canManageMembers — owner + admin only", () => {
    expect(ROLES.filter(canManageMembers)).toEqual(["owner", "admin"]);
  });
  it("canChangeOrgSettings — owner + admin only", () => {
    expect(ROLES.filter(canChangeOrgSettings)).toEqual(["owner", "admin"]);
  });
  it("canViewAllProjects — owner + admin only", () => {
    expect(ROLES.filter(canViewAllProjects)).toEqual(["owner", "admin"]);
  });
  it("canManageAllProjects — owner + admin only", () => {
    expect(ROLES.filter(canManageAllProjects)).toEqual(["owner", "admin"]);
  });
  it("canTransferOrgOwnership — owner only", () => {
    expect(ROLES.filter(canTransferOrgOwnership)).toEqual(["owner"]);
  });
  it("executive collapses to member-equivalent permissions", () => {
    expect(canViewAllProjects("executive")).toBe(false);
    expect(canInviteMembers("executive")).toBe(false);
  });
  it("canInviteRoleAs — admin/owner can invite admin/pm/member; not owner or executive", () => {
    for (const actor of ["owner", "admin"] as Role[]) {
      for (const target of INVITABLE_TENANT_ROLES) {
        expect(canInviteRoleAs(actor, target)).toBe(true);
      }
      expect(canInviteRoleAs(actor, "owner")).toBe(false);
      expect(canInviteRoleAs(actor, "executive")).toBe(false);
    }
  });
  it("canInviteRoleAs — member/pm/executive cannot invite anyone", () => {
    for (const actor of ["pm", "member", "executive"] as Role[]) {
      for (const target of INVITABLE_TENANT_ROLES) {
        expect(canInviteRoleAs(actor, target)).toBe(false);
      }
    }
  });
});
