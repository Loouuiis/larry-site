"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { ReferralModal } from "./ReferralModal";

const EASE = [0.22, 1, 0.36, 1] as const;

const NAV_ITEMS = [
  { id: "overview", label: "Overview"     },
  { id: "projects", label: "Projects"     },
  { id: "actions",  label: "Action Items" },
  { id: "reports",  label: "Reports"      },
  { id: "settings", label: "Settings"     },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

const QUICK_PROJECTS = [
  { id: "alpha",    name: "Alpha Launch",       health: "on-track" as const },
  { id: "q3",       name: "Q3 Programme",       health: "at-risk"  as const },
  { id: "vendor",   name: "Vendor Onboarding",  health: "on-track" as const },
  { id: "platform", name: "Platform Migration", health: "overdue"  as const },
];

const HEALTH_DOT: Record<string, string> = {
  "on-track": "bg-emerald-400",
  "at-risk":  "bg-amber-400",
  "overdue":  "bg-red-400",
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function NavIcon({ id, active }: { id: string; active: boolean }) {
  const cls = `h-4 w-4 shrink-0 transition-colors ${
    active ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
  }`;
  const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  switch (id) {
    case "overview":
      return (
        <svg {...base} className={cls}>
          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
          <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9"   y="9"   width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "projects":
      return (
        <svg {...base} className={cls}>
          <path
            d="M2 5.5C2 4.4 2.9 3.5 4 3.5h2l1.5 2H12c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5.5Z"
            stroke="currentColor" strokeWidth="1.3"
          />
        </svg>
      );
    case "actions":
      return (
        <svg {...base} className={cls}>
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "reports":
      return (
        <svg {...base} className={cls}>
          <path d="M2 13V9h2v4H2ZM7 13V5h2v8H7ZM12 13V7h2v6h-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg {...base} className={cls}>
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1 1M11.8 11.8l1 1M3.2 12.8l1-1M11.8 4.2l1-1"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="6"  r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.5" cy="2"  r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.25L8 3M4 6.75L8 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Sidebar content (extracted so it renders in both desktop aside + mobile drawer) ──

interface SidebarContentProps {
  active: NavId;
  setActive: (id: NavId) => void;
  onNavClick: () => void;
  onLogout: () => void;
}

function SidebarContent({ active, setActive, onNavClick, onLogout }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Branding */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-brand)] text-xs font-bold text-white select-none">
            L
          </span>
          Larry
        </Link>
      </div>

      {/* Nav + quick projects */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = active === id;
            return (
              <li key={id}>
                <button
                  onClick={() => { setActive(id); onNavClick(); }}
                  className={[
                    "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-left transition-colors duration-150",
                    isActive
                      ? "bg-[var(--color-brand)]/8 text-[var(--color-brand)] font-medium"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]",
                  ].join(" ")}
                >
                  <NavIcon id={id} active={isActive} />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/50">
            Projects
          </p>
          <ul className="space-y-0.5" role="list">
            {QUICK_PROJECTS.map(({ id, name, health }) => (
              <li key={id}>
                <button className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-left text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)] transition-colors duration-150">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`} />
                  <span className="truncate">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* User + logout */}
      <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[10px] font-bold text-[var(--color-brand)] select-none">
            U
          </span>
          <span className="flex-1 truncate text-xs text-[var(--color-muted)]">Your account</span>
          <button
            onClick={onLogout}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)] transition-colors duration-150"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [active, setActive]             = useState<NavId>("overview");
  const router                          = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const sidebarProps: SidebarContentProps = {
    active,
    setActive,
    onNavClick: () => setSidebarOpen(false),
    onLogout:   handleLogout,
  };

  return (
    <>
      <LiquidBackground />
      {showReferral && <ReferralModal onClose={() => setShowReferral(false)} />}

      <div className="relative flex h-screen overflow-hidden">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white/88 backdrop-blur-sm">
          <SidebarContent {...sidebarProps} />
        </aside>

        {/* ── Mobile drawer ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.28, ease: EASE }}
                className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-[var(--color-border)] bg-white shadow-xl md:hidden"
              >
                <SidebarContent {...sidebarProps} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Right: topbar + content ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white/88 backdrop-blur-sm px-4 sm:px-5">
            {/* Hamburger (mobile) */}
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)] transition-colors duration-150 md:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {/* Page title */}
            <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">
              {NAV_ITEMS.find((n) => n.id === active)?.label ?? "Overview"}
            </span>

            {/* Larry status pill */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] live-pulse" aria-hidden="true" />
              <span className="text-[11px] font-medium text-[var(--color-brand)]">Larry is active</span>
            </div>

            {/* Refer a friend */}
            <button
              onClick={() => setShowReferral(true)}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-transparent px-3 text-xs font-medium text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            >
              <ShareIcon />
              Refer a Friend
            </button>

            {/* Mobile logout */}
            <button
              onClick={handleLogout}
              className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)] transition-colors duration-150 md:hidden"
            >
              Log out
            </button>
          </header>

          {/* Scrollable main content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
