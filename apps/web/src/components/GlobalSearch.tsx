"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Layers,
  CheckSquare,
  FileText,
  ArrowRight,
  Clock,
  Zap,
  Users,
  X,
  Calendar,
  MessageSquare,
  BookOpen,
  PlusSquare,
} from "lucide-react";

type ProjectResult = { id: string; title: string; status: string | null };
type TaskResult = { id: string; title: string; status: string; projectId: string | null; projectName: string | null };
type DocumentResult = { id: string; title: string; projectId: string | null; projectName: string | null };
type MemberResult = { id: string; email: string; displayName: string; role: string; avatarUrl: string | null };

type SearchResults = {
  projects: ProjectResult[];
  tasks: TaskResult[];
  documents: DocumentResult[];
};

type RecentItem = { kind: string; id: string; title: string; href: string };

type FlatResult =
  | { kind: "project"; id: string; title: string; data: ProjectResult }
  | { kind: "task"; id: string; title: string; data: TaskResult }
  | { kind: "document"; id: string; title: string; data: DocumentResult }
  | { kind: "member"; id: string; title: string; data: MemberResult };

type QuickAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
};

type ListItem =
  | { type: "result"; item: FlatResult; globalIdx: number }
  | { type: "quick-action"; item: QuickAction; globalIdx: number }
  | { type: "recent"; item: RecentItem; globalIdx: number };

const RECENTS_KEY = "larry:cmd-k-recents";
const MAX_RECENTS = 5;

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  try {
    const existing = loadRecents().filter((r) => r.href !== item.href);
    const next = [item, ...existing].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function removeRecent(href: string) {
  try {
    const next = loadRecents().filter((r) => r.href !== href);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function hrefFor(r: FlatResult): string {
  if (r.kind === "project") return `/workspace/projects/${r.data.id}`;
  if (r.kind === "task") return r.data.projectId ? `/workspace/projects/${r.data.projectId}` : "/workspace/my-work";
  if (r.kind === "member") return `/workspace/settings/members`;
  return `/workspace/documents/${r.data.id}`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  in_progress: "#6c44f6",
  blocked: "#ef4444",
  waiting: "#e5a100",
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [members, setMembers] = useState<MemberResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("larry:search-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("larry:search-open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 30);
      if (!members) {
        fetch("/api/workspace/members")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.members) setMembers(data.members as MemberResult[]);
          })
          .catch(() => {});
      }
    }
  }, [open]);

  const quickActions: QuickAction[] = [
    {
      id: "create-task",
      label: "Create task",
      icon: <PlusSquare size={14} />,
      action: () => {
        setOpen(false);
        window.dispatchEvent(new Event("larry:create-task"));
      },
    },
    {
      id: "go-calendar",
      label: "Go to calendar",
      icon: <Calendar size={14} />,
      action: () => {
        setOpen(false);
        router.push("/workspace/calendar");
      },
    },
    {
      id: "open-briefing",
      label: "Open briefing",
      icon: <BookOpen size={14} />,
      action: () => {
        setOpen(false);
        router.push("/workspace/larry");
      },
    },
    {
      id: "larry-chat",
      label: "Start a Larry chat",
      icon: <MessageSquare size={14} />,
      action: () => {
        setOpen(false);
        window.dispatchEvent(new Event("larry:open"));
      },
    },
  ];

  const trimmed = query.trim();
  const isQuerying = trimmed.length >= 2;

  const memberResults: FlatResult[] =
    isQuerying && members
      ? members
          .filter(
            (m) =>
              m.displayName.toLowerCase().includes(trimmed.toLowerCase()) ||
              m.email.toLowerCase().includes(trimmed.toLowerCase())
          )
          .map((m): FlatResult => ({ kind: "member", id: m.id, title: m.displayName, data: m }))
      : [];

  const flat: FlatResult[] = results
    ? [
        ...results.projects.map((d): FlatResult => ({ kind: "project", id: d.id, title: d.title, data: d })),
        ...results.tasks.map((d): FlatResult => ({ kind: "task", id: d.id, title: d.title, data: d })),
        ...results.documents.map((d): FlatResult => ({ kind: "document", id: d.id, title: d.title, data: d })),
        ...memberResults,
      ]
    : memberResults;

  const navigateResult = useCallback(
    (r: FlatResult) => {
      const href = hrefFor(r);
      saveRecent({ kind: r.kind, id: r.id, title: r.title, href });
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const navigateRecent = useCallback(
    (r: RecentItem) => {
      saveRecent(r);
      setOpen(false);
      router.push(r.href);
    },
    [router]
  );

  const allListItems: ListItem[] = (() => {
    let idx = 0;
    const items: ListItem[] = [];
    if (!trimmed) {
      for (const r of recents) {
        items.push({ type: "recent", item: r, globalIdx: idx++ });
      }
      for (const qa of quickActions) {
        items.push({ type: "quick-action", item: qa, globalIdx: idx++ });
      }
    } else {
      for (const r of flat) {
        items.push({ type: "result", item: r, globalIdx: idx++ });
      }
    }
    return items;
  })();

  function onKeyDownInModal(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allListItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const sel = allListItems[selectedIndex];
      if (!sel) return;
      if (sel.type === "result") navigateResult(sel.item);
      else if (sel.type === "quick-action") sel.item.action();
      else if (sel.type === "recent") navigateRecent(sel.item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/workspace/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 280);
  }

  if (!open) return null;

  const hasResults = flat.length > 0;
  const showEmpty = trimmed.length >= 2 && !loading && !hasResults;

  const projectItems = flat.filter((r) => r.kind === "project");
  const taskItems = flat.filter((r) => r.kind === "task");
  const docItems = flat.filter((r) => r.kind === "document");
  const memberItems = flat.filter((r) => r.kind === "member");

  let sectionGlobalIdx = 0;

  function ResultItem({ result, idx }: { result: FlatResult; idx: number }) {
    const isSelected = idx === selectedIndex;
    const icon =
      result.kind === "project" ? <Layers size={14} /> :
      result.kind === "task" ? <CheckSquare size={14} /> :
      result.kind === "member" ? <Users size={14} /> :
      <FileText size={14} />;

    const title = result.kind === "member" ? result.data.displayName : result.data.title;
    const subtitle =
      result.kind === "task" ? result.data.projectName :
      result.kind === "document" ? result.data.projectName :
      result.kind === "member" ? result.data.email :
      null;
    const statusColor =
      result.kind === "task" ? (STATUS_COLORS[result.data.status] ?? "var(--text-muted)") : undefined;

    return (
      <button
        type="button"
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => navigateResult(result)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
        style={{
          background: isSelected ? "var(--surface-2)" : "transparent",
          color: "var(--text-1)",
        }}
      >
        <span style={{ color: statusColor ?? "#6c44f6", flexShrink: 0 }}>{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[13px] font-medium">{title}</span>
          {subtitle && (
            <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </span>
          )}
        </span>
        {isSelected && <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
      </button>
    );
  }

  function Section({ label, items }: { label: string; items: FlatResult[] }) {
    if (items.length === 0) return null;
    return (
      <div>
        <div
          className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </div>
        {items.map((r) => {
          const idx = sectionGlobalIdx++;
          return <ResultItem key={r.id} result={r} idx={idx} />;
        })}
      </div>
    );
  }

  const modalStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 201,
        borderRadius: "16px 16px 0 0",
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.28)",
        overflow: "hidden",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "20vh",
        transform: "translateX(-50%)",
        zIndex: 201,
        width: "100%",
        maxWidth: "576px",
        borderRadius: "12px",
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      };

  return (
    <>
      <div
        className="fixed inset-0 z-[200]"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setOpen(false)}
      />

      <div style={modalStyle} onKeyDown={onKeyDownInModal}>
        <div
          className="flex items-center gap-3 px-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", height: 52 }}
        >
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search projects, tasks, people..."
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-disabled)]"
            style={{ color: "var(--text-1)" }}
          />
          {loading && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Searching…
            </span>
          )}
          <kbd
            className="hidden sm:flex items-center rounded px-1.5 py-0.5 text-[11px]"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            esc
          </kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1">
          {hasResults && (
            <div className="py-1.5">
              <Section label="Projects" items={projectItems} />
              <Section label="Tasks" items={taskItems} />
              <Section label="Documents" items={docItems} />
              <Section label="People" items={memberItems} />
            </div>
          )}

          {showEmpty && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!trimmed && (
            <div className="py-1.5">
              {recents.length > 0 && (
                <div>
                  <div
                    className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Recent
                  </div>
                  {recents.map((r) => {
                    const idx = allListItems.findIndex((li) => li.type === "recent" && li.item.href === r.href);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={r.href}
                        className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors"
                        style={{
                          background: isSelected ? "var(--surface-2)" : "transparent",
                          color: "var(--text-1)",
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-3 text-left min-w-0"
                          onClick={() => navigateRecent(r)}
                        >
                          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                            <Clock size={14} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-[13px] font-medium">{r.title}</span>
                            <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                              {r.kind}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label="Remove from recents"
                          className="flex items-center justify-center rounded p-0.5 transition-colors hover:opacity-70"
                          style={{ color: "var(--text-muted)", flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecent(r.href);
                            setRecents(loadRecents());
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <div
                  className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Quick actions
                </div>
                {quickActions.map((qa) => {
                  const idx = allListItems.findIndex((li) => li.type === "quick-action" && li.item.id === qa.id);
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={qa.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => qa.action()}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        background: isSelected ? "var(--surface-2)" : "transparent",
                        color: "var(--text-1)",
                      }}
                    >
                      <span style={{ color: "#6c44f6", flexShrink: 0 }}>
                        <Zap size={14} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-[13px] font-medium">{qa.label}</span>
                      </span>
                      {isSelected && <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-3 px-4 py-2 text-[11px] shrink-0"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-disabled)" }}
        >
          <span><kbd style={{ fontFamily: "inherit" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: "inherit" }}>↵</kbd> open</span>
          <span><kbd style={{ fontFamily: "inherit" }}>esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}
