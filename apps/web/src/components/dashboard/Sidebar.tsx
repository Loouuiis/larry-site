"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  FolderOpen, FileText, MessageSquare, ClipboardList,
  X, Bot, BarChart2, Home, ListTodo, Settings,
} from "lucide-react";
import { WorkspaceProject } from "@/app/dashboard/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Legacy state-based types (kept for Layout.tsx compatibility) ─── */

export type NavSection = "projects" | "documents" | "chats" | "meetings" | "analytics";

/* ─── Link-based workspace nav (used in WorkspaceShell) ──────────── */

export type WorkspaceSidebarNav = "home" | "my-work" | "project" | "meetings" | "documents" | "chats" | "settings";

const WORKSPACE_NAV: { id: WorkspaceSidebarNav; label: string; icon: React.ElementType; href: string }[] = [
  { id: "home",      label: "Home",          icon: Home,         href: "/workspace"           },
  { id: "my-work",   label: "My work",       icon: ListTodo,     href: "/workspace/my-work"   },
  { id: "meetings",  label: "Meetings",      icon: ClipboardList, href: "/workspace/meetings" },
  { id: "documents", label: "Documents",     icon: FileText,     href: "/workspace/documents" },
  { id: "chats",     label: "Chats",         icon: MessageSquare, href: "/workspace/chats"    },
  { id: "settings",  label: "Settings",      icon: Settings,     href: "/workspace/settings"  },
];

/* ─── Link-based inner sidebar ────────────────────────────────────── */

interface WorkspaceSidebarInnerProps {
  projects: WorkspaceProject[];
  activeNav: WorkspaceSidebarNav;
  onClose?: () => void;
}

function WorkspaceSidebarInner({ projects, activeNav, onClose }: WorkspaceSidebarInnerProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-[var(--color-border)]">
        <Link href="/workspace" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-brand)] shadow-[0_2px_8px_rgba(139,92,246,0.35)]">
            <span className="text-sm font-bold text-white select-none">L</span>
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 leading-none">Larry</p>
            <p className="text-[10px] text-neutral-400 leading-none mt-0.5">PM</p>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Main navigation">
        <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Workspace
        </p>
        <LayoutGroup id="workspace-sidebar">
          {WORKSPACE_NAV.map(({ id, label, icon: Icon, href }) => {
            const isActive = activeNav === id;
            return (
              <motion.div
                key={id}
                whileHover={!isActive ? { x: 2 } : {}}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="relative"
              >
                <Link
                  href={href}
                  onClick={onClose}
                  className={[
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm w-full",
                    isActive
                      ? "text-[var(--color-brand)] font-medium"
                      : "text-[var(--color-muted)] hover:text-neutral-700",
                  ].join(" ")}
                >
                  {!isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-[var(--color-surface)]"
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="ws-sidebar-active-bg"
                      className="absolute inset-0 rounded-xl bg-[var(--color-brand)]/8"
                      transition={{ duration: 0.22, ease: EASE }}
                    />
                  )}
                  <Icon
                    size={16}
                    className={`relative z-10 shrink-0 ${
                      isActive ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
                    }`}
                  />
                  <span className="relative z-10">{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="ws-sidebar-active-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--color-brand)]"
                      transition={{ duration: 0.22, ease: EASE }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </LayoutGroup>

        {/* Projects section */}
        {projects.length > 0 && (
          <>
            <p className="mt-5 mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Projects
            </p>
            {projects.map((project) => {
              const isActive = pathname?.startsWith(`/workspace/projects/${project.id}`) ?? false;
              return (
                <motion.div
                  key={project.id}
                  whileHover={!isActive ? { x: 2 } : {}}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="relative"
                >
                  <Link
                    href={`/workspace/projects/${project.id}`}
                    onClick={onClose}
                    className={[
                      "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm w-full truncate",
                      isActive
                        ? "text-[var(--color-brand)] font-medium"
                        : "text-[var(--color-muted)] hover:text-neutral-700",
                    ].join(" ")}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={`proj-bg-${project.id}`}
                        className="absolute inset-0 rounded-xl bg-[var(--color-brand)]/8"
                        transition={{ duration: 0.22, ease: EASE }}
                      />
                    )}
                    <FolderOpen
                      size={15}
                      className={`relative z-10 shrink-0 ${
                        isActive ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
                      }`}
                    />
                    <span className="relative z-10 truncate">{project.name}</span>
                  </Link>
                </motion.div>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom — Larry badge */}
      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-brand)]/5 border border-[var(--color-brand)]/15 px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white">
            <Bot size={13} />
          </span>
          <div>
            <p className="text-xs font-medium text-neutral-800">Larry is active</p>
            <p className="text-[10px] text-neutral-400">Monitoring {projects.length || 0} projects</p>
          </div>
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/* ─── WorkspaceSidebar — link-based, for WorkspaceShell ──────────── */

interface WorkspaceSidebarProps {
  projects: WorkspaceProject[];
  activeNav: WorkspaceSidebarNav;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function WorkspaceSidebar({ projects, activeNav, mobileOpen, onMobileClose }: WorkspaceSidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white">
        <WorkspaceSidebarInner projects={projects} activeNav={activeNav} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.26, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-[var(--color-border)] bg-white shadow-2xl md:hidden"
            >
              <WorkspaceSidebarInner projects={projects} activeNav={activeNav} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Legacy state-based Sidebar (kept for Layout.tsx) ───────────── */

const STATE_NAV_ITEMS: { id: NavSection; label: string; icon: React.ElementType }[] = [
  { id: "projects",  label: "Projects",      icon: FolderOpen     },
  { id: "documents", label: "Documents",     icon: FileText       },
  { id: "chats",     label: "Chats",         icon: MessageSquare  },
  { id: "meetings",  label: "Meeting Notes", icon: ClipboardList  },
  { id: "analytics", label: "Analytics",     icon: BarChart2      },
];

interface SidebarProps {
  active: NavSection;
  setActive: (s: NavSection) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarInner({
  active,
  setActive,
  onClose,
}: {
  active: NavSection;
  setActive: (s: NavSection) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-brand)] shadow-[0_2px_8px_rgba(139,92,246,0.35)]">
            <span className="text-sm font-bold text-white select-none">L</span>
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 leading-none">Larry</p>
            <p className="text-[10px] text-neutral-400 leading-none mt-0.5">PM</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main navigation">
        <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Workspace
        </p>
        {STATE_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <motion.button
              key={id}
              onClick={() => { setActive(id); onClose?.(); }}
              whileHover={!isActive ? { x: 2 } : {}}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASE }}
              className={[
                "relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left",
                isActive ? "text-[var(--color-brand)] font-medium" : "text-[var(--color-muted)]",
              ].join(" ")}
            >
              {!isActive && (
                <motion.div
                  className="absolute inset-0 rounded-xl bg-[var(--color-surface)]"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                />
              )}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-bg"
                  className="absolute inset-0 rounded-xl bg-[var(--color-brand)]/8"
                  transition={{ duration: 0.22, ease: EASE }}
                />
              )}
              <Icon
                size={16}
                className={`relative z-10 shrink-0 ${isActive ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"}`}
              />
              <span className="relative z-10">{label}</span>
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-bar"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--color-brand)]"
                  transition={{ duration: 0.22, ease: EASE }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-brand)]/5 border border-[var(--color-brand)]/15 px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white">
            <Bot size={13} />
          </span>
          <div>
            <p className="text-xs font-medium text-neutral-800">Larry is active</p>
            <p className="text-[10px] text-neutral-400">Monitoring 4 projects</p>
          </div>
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ active, setActive, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white">
        <SidebarInner active={active} setActive={setActive} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.26, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-[var(--color-border)] bg-white shadow-2xl md:hidden"
            >
              <SidebarInner active={active} setActive={setActive} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
