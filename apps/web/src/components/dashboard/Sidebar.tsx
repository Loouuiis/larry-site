"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, MessageSquare, ClipboardList, Calendar,
  X, FolderOpen, Home, ListTodo, Settings,
  Search, LogOut, FolderKanban, CheckSquare, Bell,
  Plus, BarChart2, Sparkles, PanelLeftClose, PanelLeftOpen, Star, Mail,
  ChevronDown, Camera, GanttChartSquare,
} from "lucide-react";
import { WorkspaceProject } from "@/app/dashboard/types";
import { StartProjectFlow } from "./StartProjectFlow";
import { resizeImageToDataUrl } from "@/lib/image";

const DRAWER_EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ────────────────────────────────────────────────────────── */

export type NavSection = "projects" | "documents" | "chats" | "meetings" | "analytics";
export type WorkspaceSidebarNav = "home" | "my-work" | "timeline" | "actions" | "notifications" | "project" | "meetings" | "calendar" | "documents" | "email-drafts" | "chats" | "larry" | "settings";

const WORKSPACE_NAV: { id: WorkspaceSidebarNav; label: string; icon: React.ElementType; href: string }[] = [
  { id: "home",      label: "Home",       icon: Home,          href: "/workspace"           },
  { id: "my-work",   label: "My tasks",   icon: ListTodo,         href: "/workspace/my-work"   },
  { id: "timeline",  label: "Timeline",   icon: GanttChartSquare, href: "/workspace/timeline"  },
  { id: "actions",   label: "Actions",    icon: CheckSquare,      href: "/workspace/actions"   },
  { id: "notifications", label: "Notifications", icon: Bell, href: "/workspace/notifications" },
  { id: "meetings",  label: "Meetings",   icon: ClipboardList, href: "/workspace/meetings"  },
  { id: "calendar",  label: "Calendar",   icon: Calendar,      href: "/workspace/calendar"  },
  { id: "documents",    label: "Documents",    icon: FileText,      href: "/workspace/documents"    },
  { id: "email-drafts", label: "Mail",          icon: Mail,         href: "/workspace/email-drafts" },
  { id: "chats",        label: "Chats",        icon: MessageSquare, href: "/workspace/chats"        },
  { id: "larry",        label: "Larry",        icon: Sparkles,      href: "/workspace/larry"        },
  { id: "settings",  label: "Settings",   icon: Settings,      href: "/workspace/settings"  },
];

/* ─── WorkspaceSidebarInner ───────────────────────────────────────── */

function getUserInitials(displayName?: string | null, email?: string | null): string {
  if (displayName && displayName.trim()) {
    return displayName.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
  const username = email?.split("@")[0] ?? "?";
  const parts = username.split(".").filter(Boolean);
  if (parts.length >= 2) return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

interface WorkspaceSidebarInnerProps {
  projects: WorkspaceProject[];
  activeNav: WorkspaceSidebarNav;
  onClose?: () => void;
  userEmail?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  notifCount?: number;
  onToggleCollapsed?: () => void;
}

interface SearchTask { id: string; title: string; status: string; projectId?: string | null; }

function WorkspaceSidebarInner({ projects, activeNav, onClose, userEmail, avatarUrl, displayName, notifCount, onToggleCollapsed }: WorkspaceSidebarInnerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Avatar popover
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(avatarUrl ?? null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("larry:favorite-projects");
      if (stored) setFavorites(new Set(JSON.parse(stored) as string[]));
    } catch { /* ignore */ }
  }, []);

  // Re-read favorites when the window regains focus (settings tab may have changed them)
  useEffect(() => {
    function onFocus() {
      try {
        const stored = localStorage.getItem("larry:favorite-projects");
        setFavorites(new Set(stored ? (JSON.parse(stored) as string[]) : []));
      } catch { /* ignore */ }
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("larry:favorites-changed", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("larry:favorites-changed", onFocus);
    };
  }, []);

  const [projectFolderIds, setProjectFolderIds] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/workspace/folders", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { folders?: { id: string; projectId: string | null; folderType: string }[] }) => {
        const map: Record<string, string> = {};
        for (const f of data.folders ?? []) {
          if (f.projectId && f.folderType === "project") map[f.projectId] = f.id;
        }
        setProjectFolderIds(map);
      })
      .catch(() => {});
  }, []);

  const favoritedProjects = projects.filter((p) => favorites.has(p.id));

  const toggleFavorite = useCallback((projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      localStorage.setItem("larry:favorite-projects", JSON.stringify([...next]));
      window.dispatchEvent(new Event("larry:favorites-changed"));
      return next;
    });
  }, []);

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

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [popoverOpen]);

  const handleAvatarFile = async (file: File) => {
    setAvatarSaving(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (res.ok) {
        setLocalAvatarUrl(dataUrl);
        window.dispatchEvent(new CustomEvent("larry:avatar-updated", { detail: dataUrl }));
        setPopoverOpen(false);
      }
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarSaving(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (res.ok) {
        setLocalAvatarUrl(null);
        window.dispatchEvent(new CustomEvent("larry:avatar-updated", { detail: null }));
        setPopoverOpen(false);
      }
    } finally {
      setAvatarSaving(false);
    }
  };

  const isProjectActive = (id: string) => pathname?.startsWith(`/workspace/projects/${id}`) ?? false;

  return (
    <div className="flex h-full flex-col" style={{ background: "#ffffff" }}>

      {/* Logo */}
      <div className="shrink-0 pr-4 pt-3 pb-1.5 flex items-center justify-between">
        <Link href="/workspace" onClick={onClose} className="flex items-center gap-2 -ml-3">
          <Image src="/Larryfulllogo.png" alt="Larry" width={105} height={38} className="object-contain" />
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
      <div ref={searchContainerRef} className="shrink-0 px-3 pb-1.5">
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
            className="h-[30px] w-full pl-8 pr-3 text-[13px] outline-none transition-all"
            style={{
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--border)",
              background: "#fafaff",
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

      {/* Scrollable middle: search results OR nav + projects */}
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
        <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Primary nav */}
      <nav className="px-2 space-y-0.5" aria-label="Main navigation">
        {WORKSPACE_NAV.map(({ id, label, icon: Icon, href }) => {
          const isActive = activeNav === id;
          const showBadge = id === "notifications" && (notifCount ?? 0) > 0;
          return (
            <Link
              key={id}
              href={href}
              onClick={onClose}
              className={`pm-nav-item${isActive ? " active" : ""}`}
            >
              <Icon size={18} className="shrink-0 icon-md" style={{ color: isActive ? "var(--brand)" : "var(--text-disabled)" }} />
              <span className="flex-1" style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}>{label}</span>
              {showBadge && (
                <span
                  className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: "#6c44f6" }}
                >
                  {(notifCount ?? 0) > 99 ? "99+" : notifCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-3" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Projects section */}
      <div className="px-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <button
            type="button"
            className="flex items-center gap-1 text-caption hover:opacity-80 transition-opacity"
            onClick={() => setProjectsOpen((v) => !v)}
          >
            <ChevronDown
              size={12}
              className="transition-transform"
              style={{ transform: projectsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            PROJECTS
          </button>
          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            title="New project"
            className="flex h-5 w-5 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--text-disabled)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#6c44f6"; e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-disabled)"; e.currentTarget.style.background = ""; }}
          >
            <Plus size={13} />
          </button>
        </div>

        {projectsOpen && (
          <div className="space-y-0.5 pb-2">
            {/* Favourites group */}
            {favoritedProjects.length > 0 && (
              <>
                <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-disabled)" }}>
                  Favourites
                </p>
                {favoritedProjects.map((project) => {
                  const isActive = isProjectActive(project.id);
                  return (
                    <Link
                      key={`fav-${project.id}`}
                      href={`/workspace/projects/${project.id}`}
                      onClick={onClose}
                      className={`pm-board-item group${isActive ? " active" : ""}`}
                    >
                      <Star
                        size={12}
                        className="shrink-0"
                        style={{ color: "#6c44f6", fill: "#6c44f6" }}
                      />
                      <span className="flex-1 truncate text-[14px]" style={{ maxWidth: "150px", color: isActive ? "var(--text-1)" : "var(--text-2)" }}>
                        {project.name}
                      </span>
                      {projectFolderIds[project.id] && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/workspace/documents?folderId=${projectFolderIds[project.id]}`);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Open project files"
                          style={{ color: "var(--text-disabled)" }}
                        >
                          <FileText size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(project.id, e)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from favourites"
                        style={{ color: "#6c44f6" }}
                      >
                        <Star size={12} style={{ fill: "#6c44f6" }} />
                      </button>
                    </Link>
                  );
                })}
                <div className="mx-2 my-1.5" style={{ borderTop: "1px solid var(--border)" }} />
              </>
            )}

            {/* All projects */}
            {projects.map((project) => {
              const isActive = isProjectActive(project.id);
              const isStarred = favorites.has(project.id);
              return (
                <Link
                  key={project.id}
                  href={`/workspace/projects/${project.id}`}
                  onClick={onClose}
                  className={`pm-board-item group${isActive ? " active" : ""}`}
                >
                  <span
                    className="shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isActive ? "#6c44f6" : "#bdb7d0",
                    }}
                  />
                  <span className="flex-1 truncate text-[14px]" style={{ maxWidth: "150px", color: isActive ? "var(--text-1)" : "var(--text-2)" }}>
                    {project.name}
                  </span>
                  {projectFolderIds[project.id] && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/workspace/documents?folderId=${projectFolderIds[project.id]}`);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open project files"
                      style={{ color: "var(--text-disabled)" }}
                    >
                      <FileText size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(project.id, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={isStarred ? "Remove from favourites" : "Add to favourites"}
                    style={{ color: isStarred ? "#6c44f6" : "var(--text-disabled)" }}
                  >
                    <Star size={12} style={isStarred ? { fill: "#6c44f6" } : undefined} />
                  </button>
                </Link>
              );
            })}
            {projects.length === 0 && (
              <p className="px-3 py-2 text-[12px]" style={{ color: "var(--text-disabled)" }}>
                No projects yet. Create one to get started.
              </p>
            )}
            {/* + New inline */}
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="flex w-full items-center gap-1.5 px-6 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--cta)" }}
            >
              <Plus size={13} />
              New
            </button>
          </div>
        )}
      </div>
        </div>
      )}

      {/* Bottom bar — avatar button + email */}
      <div className="relative shrink-0 px-3 py-3" style={{ borderTop: "1px solid var(--border)" }} ref={popoverRef}>
        {/* Avatar popover */}
        {popoverOpen && (
          <div
            className="absolute bottom-full left-0 right-0 mx-3 mb-2 overflow-hidden rounded-xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              zIndex: 50,
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              {localAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={localAvatarUrl} alt="Profile" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold"
                  style={{ background: "#6c44f6", color: "#fff" }}
                >
                  {getUserInitials(displayName, userEmail)}
                </div>
              )}
              <div className="min-w-0">
                {displayName && <p className="truncate text-[13px] font-medium" style={{ color: "var(--text-1)" }}>{displayName}</p>}
                <p className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>{userEmail ?? "Account"}</p>
              </div>
            </div>

            {/* Photo actions */}
            <div className="py-1">
              <button
                type="button"
                disabled={avatarSaving}
                onClick={() => avatarFileRef.current?.click()}
                className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                style={{ color: "var(--text-1)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <Camera size={14} style={{ color: "var(--text-muted)" }} />
                {avatarSaving ? "Saving…" : "Change photo"}
              </button>
              {localAvatarUrl && (
                <button
                  type="button"
                  disabled={avatarSaving}
                  onClick={handleRemoveAvatar}
                  className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                  style={{ color: "var(--text-1)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <X size={14} style={{ color: "var(--text-muted)" }} />
                  Remove photo
                </button>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)" }} />

            {/* Account nav */}
            <div className="py-1">
              <Link
                href="/workspace/settings/account"
                onClick={() => setPopoverOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                style={{ color: "var(--text-1)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <Settings size={14} style={{ color: "var(--text-muted)" }} />
                Account settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                style={{ color: "var(--text-1)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <LogOut size={14} style={{ color: "var(--text-muted)" }} />
                Log out
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleAvatarFile(file);
            e.target.value = "";
          }}
        />

        {/* Bottom row */}
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg p-1 transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <span className="relative shrink-0">
            {localAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={localAvatarUrl} alt="Profile" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "#6c44f6", color: "#fff", fontSize: 11, fontWeight: 600 }}
              >
                {getUserInitials(displayName, userEmail)}
              </span>
            )}
            <span
              className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "rgba(0,0,0,0.4)" }}
              aria-hidden
            >
              <Camera size={11} color="#fff" />
            </span>
          </span>
          <span className="flex-1 truncate text-left text-[12px]" style={{ color: "var(--text-muted)" }}>
            {userEmail ?? "Account"}
          </span>
        </button>
      </div>

      {/* New project modal */}
      <AnimatePresence>
        {showNewProject && (
          <StartProjectFlow
            onClose={() => setShowNewProject(false)}
            onCreated={(projectId) => {
              setShowNewProject(false);
              onClose?.();
              router.push(`/workspace/projects/${projectId}`);
            }}
          />
        )}
      </AnimatePresence>
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
  avatarUrl?: string | null;
  displayName?: string | null;
  notifCount?: number;
  collapsed?: boolean;
  autoOpened?: boolean;
  onToggleCollapsed?: () => void;
  onAutoOpenStart?: () => void;
  onAutoOpenEnd?: () => void;
}

export function WorkspaceSidebar({
  projects,
  activeNav,
  mobileOpen,
  onMobileClose,
  userEmail,
  avatarUrl,
  displayName,
  notifCount,
  collapsed,
  autoOpened,
  onToggleCollapsed,
  onAutoOpenStart,
  onAutoOpenEnd,
}: WorkspaceSidebarProps) {
  return (
    <>
      {collapsed && (
        <div
          className="fixed inset-y-0 left-0 z-30 hidden md:block"
          style={{ width: 18 }}
          onMouseEnter={onAutoOpenStart}
          aria-hidden="true"
        />
      )}

      {/* Desktop */}
      <motion.aside
        className="hidden md:flex shrink-0 flex-col overflow-hidden"
        initial={false}
        animate={{ width: collapsed ? 56 : 240 }}
        transition={{ duration: 0.22, ease: DRAWER_EASE }}
        style={{ borderRight: "1px solid var(--border)", background: "#ffffff" }}
        onMouseLeave={() => {
          if (autoOpened) {
            onAutoOpenEnd?.();
          }
        }}
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
            <Link href="/workspace/settings/account" title={userEmail ?? "Account settings"}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "#6c44f6", color: "#fff", fontSize: 11, fontWeight: 600 }}
                >
                  {getUserInitials(displayName, userEmail)}
                </div>
              )}
            </Link>
          </div>
        ) : (
          <WorkspaceSidebarInner
            projects={projects}
            activeNav={activeNav}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
            displayName={displayName}
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
                borderRight: "1px solid #f0edfa",
                background: "#ffffff",
                boxShadow: "0 0 40px rgba(0,0,0,0.06)",
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
                avatarUrl={avatarUrl}
                displayName={displayName}
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
