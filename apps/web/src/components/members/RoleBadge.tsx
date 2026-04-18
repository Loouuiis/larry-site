import type { CSSProperties } from "react";

export type MemberRole = "owner" | "admin" | "pm" | "member";

interface RoleStyle extends CSSProperties {
  borderColor: string;
}

const STYLES: Record<MemberRole, RoleStyle & { label: string }> = {
  owner:  { label: "Owner",  background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" },
  admin:  { label: "Admin",  background: "#f5f3ff", color: "#6c44f6", borderColor: "#ddd6fe" },
  pm:     { label: "PM",     background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
  member: { label: "Member", background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" },
};

export function roleLabel(role: string): string {
  return (STYLES as Record<string, { label: string }>)[role]?.label ?? role;
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const s = STYLES[role as MemberRole] ?? STYLES.member;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className ?? ""}`}
      style={{ background: s.background, color: s.color, borderColor: s.borderColor }}
    >
      {s.label}
    </span>
  );
}
