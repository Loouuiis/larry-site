"use client";

import Link from "next/link";

type SettingsTab = "general" | "connectors" | "reliability" | "larry" | "members" | "account";

interface SettingsSubnavProps {
  active: SettingsTab;
}

const tabs: Array<{ id: SettingsTab; label: string; href: string }> = [
  { id: "general", label: "General", href: "/workspace/settings/general" },
  { id: "connectors", label: "Connectors", href: "/workspace/settings/connectors" },
  { id: "members", label: "Members", href: "/workspace/settings/members" },
  { id: "reliability", label: "Reliability", href: "/workspace/settings/reliability" },
  { id: "larry", label: "Larry", href: "/workspace/settings/larry" },
  { id: "account", label: "Account", href: "/workspace/settings/account" },
];

export function SettingsSubnav({ active }: SettingsSubnavProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{
              borderColor: isActive ? "var(--cta)" : "var(--border)",
              color: isActive ? "var(--cta)" : "var(--text-2)",
              background: isActive ? "var(--surface-2)" : "var(--surface)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
