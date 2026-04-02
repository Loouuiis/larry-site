"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, MessageSquare, ClipboardList, Calendar,
  X, FolderOpen, Home, ListTodo, Settings,
  Search, LogOut, User, FolderKanban, CheckSquare,
  Plus, BarChart2, Sparkles, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { WorkspaceProject } from "@/app/dashboard/types";

const DRAWER_EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ────────────────────────────────────────────────────────── */

export type NavSection = "projects" | "documents" | "chats" | "meetings" | "analytics";
export type WorkspaceSidebarNav = "home" | "my-work" | "actions" | "project" | "meetings" | "calendar" | "documents" | "chats" | "larry" | "settings";

const WORKSPACE_NAV: { id: WorkspaceSidebarNav; label: string; icon: React.ElementType; href: string }[] = [
  { id: "home",      label: "Home",       icon: Home,          href: "/workspace"           },
  { id: "my-work",   label: "My tasks",   icon: ListTodo,      href: "/workspace/my-work"   },
  { id: "actions",   label: "Actions",    icon: CheckSquare,   href: "/workspace/actions"   },
  { id: "meetings",  label: "Meetings",   icon: ClipboardList, href: "/workspace/meetings"  },
  { id: "calendar",  label: "Calendar",   icon: Calendar,      href: "/workspace/calendar"  },
  { id: "documents", label: "Documents",  icon: FileText,      href: "/workspace/documents" },
  { id: "chats",     label: "Chats",      icon: MessageSquare, href: "/workspace/chats"     },
  { id: "larry",     label: "Ask Larry",  icon: Sparkles,      href: "/workspace/chats"     },
  { id: "settings",  label: "Settings",   icon: Settings,      href: "/workspace/settings"  },
];

/* ─── WorkspaceSidebarInner ───────────────────────────────────────── */

interface WorkspaceSidebarInnerProps {
  projects: WorkspaceProject[];
  activeNav: WorkspaceSidebarNav;
  onClose?: () => void;
  userEmail?: string | null;
  notifCount?: number;
  onToggleCollapsed?: () => void;
}

interface SearchTask { id: string; title: string; status: string; projectId?: string | null; }

function WorkspaceSidebarInner({ projects, activeNav, onClose, userEmail, onToggleCollapsed }: WorkspaceSidebarInnerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(async () => {
    if (tasksLoaded) return;
    try {
      const res = await fetch("/api/workspace/tasks", { cache: "no-store" });
      const data = await res.json() as { items?: SearchTask[] };
      setTasks(data.items ?? []);
      setTasksLoaded(true);
    } catch {
      setTasksLoaded(true);
    }
  }, [tasksLoaded]);

  const dismiss = useCallback(() => { setSearch(""); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (val.trim().length >= 1) void loadTasks();
  };

  const q = search.trim().toLowerCase();
  const isSearching = q.length >= 1;
  const matchedProjects = isSearching ? projects.filter((p) => (p.name ?? "").toLowerCase().includes(q)).slice(0, 5) : [];
  const matchedTasks = isSearching ? tasks.filter((t) => (t.title ?? "").toLowerCase().includes(q)).slice(0, 5) : [];
  const hasResults = matchedProjects.length > 0 || matchedTasks.length > 0;

  const goTo = (href: string) => {
    dismiss();
    onClose?.();
    router.push(href);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const isProjectActive = (id: string) => pathname?.startsWith(`/workspace/projects/${id}`) ?? false;

  return (
    <div className="flex h-full flex-col" style={{ background: "#ffffff" }}>

      {/* Logo */}
      <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
        <Link href="/workspace" onClick={onClose} className="flex items-center gap-2">
          <Image src="/Larry_logos.png" alt="Larry" width={56} height={18} className="object-contain" />
        </Link>
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title="Collapse sidebar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{ color: "#6c44f6" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Search */}
      <div ref={searchContainerRef} className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-disabled)" }}
          />
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search…"
            className="h-9 w-full pl-8 pr-3 text-[13px] outline-none transition-all"
            style={{
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-2)",
            }}
          />
          {isSearching && (
            <button
              onClick={dismiss}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-disabled)" }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Inline search results — replaces nav + projects when searching */}
      {isSearching ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {!hasResults ? (
            <p className="px-3 py-4 text-[13px]" style={{ color: "var(--text-disabled)" }}>
              No results for &ldquo;{search}&rdquo;
            </p>
          ) : (
            <>
              {matchedProjects.length > 0 && (
                <div className="mb-2">
                  <p className="text-caption px-3 py-1.5">Projects</p>
                  {matchedProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => goTo(`/workspace/projects/${p.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
                      style={{ transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <FolderKanban size={14} className="shrink-0" style={{ color: "var(--brand)" }} />
                      <span className="text-[13px] truncate" style={{ color: "var(--text-1)" }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {matchedTasks.length > 0 && (
                <div>
                  <p className="text-caption px-3 py-1.5">Tasks</p>
                  {matchedTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => goTo(t.projectId ? `/workspace/projects/${t.projectId}` : "/workspace")}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
                      style={{ transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <CheckSquare size={14} className="shrink-0" style={{ color: "var(--text-disabled)" }} />
                      <span className="flex-1 text-[13px] truncate" style={{ color: "var(--text-2)" }}>{t.title}</span>
                      <span className="shrink-0 text-[11px] capitalize" style={{ color: "var(--text-disabled)" }}>
                        {t.status?.replace(/_/g, " ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
      {/* Primary nav */}
      <nav className="shrink-0 px-2 space-y-0.5" aria-label="Main navigation">
        {WORKSPACE_NAV.map(({ id, label, icon: Icon, href }) => {
          const isActive = activeNav === id;
          // "Ask Larry" opens the chat panel instead of navigating
          if (id === "larry") {
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onClose?.();
                  window.dispatchEvent(new CustomEvent("larry:open"));
                }}
                className={`pm-nav-item w-full text-left${isActive ? " active" : ""}`}
              >
                <Icon size={18} className="shrink-0 icon-md" style={{ color: "var(--brand)" }} />
                <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{label}</span>
              </button>
            );
          }
          return (
            <Link
              key={id}
              href={href}
              onClick={onClose}
              className={`pm-nav-item${isActive ? " active" : ""}`}
            >
              <Icon size={18} className="shrink-0 icon-md" style={{ color: isActive ? "var(--brand)" : "var(--text-disabled)" }} />
              <span style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-3" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Projects section */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <button
            type="button"
            className="text-caption hover:opacity-80 transition-opacity"
            onClick={() => setProjectsOpen((v) => !v)}
          >
            PROJECTS
          </button>
        </div>

        {projectsOpen && (
          <div className="space-y-0.5 pb-2">
            {projects.map((project) => {
              const isActive = isProjectActive(project.id);
              return (
                <Link
                  key={project.id}
                  href={`/workspace/projects/${project.id}`}
                  onClick={onClose}
                  className={`pm-board-item${isActive ? " active" : ""}`}
                >
                  <FolderOpen size={16} className="shrink-0" style={{ color: isActive ? "var(--brand)" : "var(--text-disabled)" }} />
                  <span className="truncate text-[14px]" style={{ maxWidth: "180px", color: isActive ? "var(--text-1)" : "var(--text-2)" }}>
                    {project.name}
                  </span>
                </Link>
              );
            })}
            {projects.length === 0 && (
              <p className="px-6 py-2 text-[13px]" style={{ color: "var(--text-disabled)" }}>
                No projects yet.
              </p>
            )}
            {/* + New inline */}
            <Link
              href="/workspace/projects/new"
              onClick={onClose}
              className="flex w-full items-center gap-1.5 px-6 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--cta)" }}
            >
              <Plus size={13} />
              New
            </Link>
          </div>
        )}
      </div>
        </>
      )}

      {/* Bottom bar — single row: avatar + email + logout */}
      <div className="shrink-0 px-3 py-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 group">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <User size={16} style={{ color: "var(--text-disabled)" }} />
          </div>
          <span className="flex-1 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
            {userEmail ?? "Account"}
          </span>
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── WorkspaceSidebar — desktop + mobile drawer ─────────────────── */

interface WorkspaceSidebarProps {
  projects: WorkspaceProject[];
  activeNav: WorkspaceSidebarNav;
  mobileOpen: boolean;
  onMobileClose: () => void;
  userEmail?: string | null;
  notifCount?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function WorkspaceSidebar({ projects, activeNav, mobileOpen, onMobileClose, userEmail, notifCount, collapsed, onToggleCollapsed }: WorkspaceSidebarProps) {
  return (
    <>
      {/* Desktop */}
      <motion.aside
        className="hidden md:flex shrink-0 flex-col overflow-hidden"
        initial={false}
        animate={{ width: collapsed ? 52 : 252 }}
        transition={{ duration: 0.22, ease: DRAWER_EASE }}
        style={{ borderRight: "1px solid var(--border)", background: "#ffffff" }}
      >
        {collapsed ? (
          <div className="flex h-full flex-col items-center justify-between pt-4 pb-3">
            <button
              onClick={onToggleCollapsed}
              title="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              style={{ color: "#6c44f6" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <PanelLeftOpen size={16} />
            </button>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              title={userEmail ?? "Account"}
            >
              <User size={16} style={{ color: "var(--text-disabled)" }} />
            </div>
          </div>
        ) : (
          <WorkspaceSidebarInner
            projects={projects}
            activeNav={activeNav}
            userEmail={userEmail}
            notifCount={notifCount}
            onToggleCollapsed={onToggleCollapsed}
          />
        )}
      </motion.aside>

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
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.18, ease: DRAWER_EASE }}
              className="fixed inset-y-0 left-0 z-50 flex flex-col md:hidden"
              style={{
                width: "252px",
                borderRight: "1px solid var(--border)",
                background: "#ffffff",
                boxShadow: "var(--shadow-3)",
              }}
            >
              <div className="flex h-12 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Menu</span>
                <button
                  onClick={onMobileClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={16} />
                </button>
              </div>
              <WorkspaceSidebarInner
                projects={projects}
                activeNav={activeNav}
                onClose={onMobileClose}
                userEmail={userEmail}
                notifCount={notifCount}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Legacy state-based Sidebar (kept for Layout.tsx compatibility) */

const STATE_NAV_ITEMS: { id: NavSection; label: string; icon: React.ElementType }[] = [
  { id: "projects",  label: "Projects",      icon: FolderOpen   },
  { id: "documents", label: "Documents",     icon: FileText     },
  { id: "chats",     label: "Chats",         icon: MessageSquare },
  { id: "meetings",  label: "Meeting Notes", icon: ClipboardList },
  { id: "analytics", label: "Analytics",     icon: BarChart2    },
];

interface SidebarProps {
  active: NavSection;
  setActive: (s: NavSection) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarInner({ active, setActive, onClose }: { active: NavSection; setActive: (s: NavSection) => void; onClose?: () => void; }) {
  return (
    <div className="flex h-full flex-col" style={{ background: "#ffffff" }}>
      <div className="flex h-14 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ background: "var(--brand)" }}
          >
            <span className="text-sm font-bold select-none">L</span>
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Larry</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5" aria-label="Main navigation">
        {STATE_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => { setActive(id); onClose?.(); }}
              className={`pm-nav-item w-full text-left${isActive ? " active" : ""}`}
            >
              <Icon size={18} className="shrink-0" style={{ color: isActive ? "var(--brand)" : "var(--text-disabled)" }} />
              <span style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar({ active, setActive, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col"
        style={{ borderRight: "1px solid var(--border)", background: "var(--surface)" }}
      >
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
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.18, ease: DRAWER_EASE }}
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden"
              style={{ borderRight: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-3)" }}
            >
              <SidebarInner active={active} setActive={setActive} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
