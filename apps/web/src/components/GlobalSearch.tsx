"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Layers, CheckSquare, FileText, ArrowRight } from "lucide-react";

type ProjectResult = { id: string; title: string; status: string | null };
type TaskResult = { id: string; title: string; status: string; projectId: string | null; projectName: string | null };
type DocumentResult = { id: string; title: string; projectId: string | null; projectName: string | null };

type SearchResults = {
  projects: ProjectResult[];
  tasks: TaskResult[];
  documents: DocumentResult[];
};

type FlatResult =
  | { kind: "project"; data: ProjectResult }
  | { kind: "task"; data: TaskResult }
  | { kind: "document"; data: DocumentResult };

function hrefFor(r: FlatResult): string {
  if (r.kind === "project") return `/workspace/projects/${r.data.id}`;
  if (r.kind === "task") return r.data.projectId ? `/workspace/projects/${r.data.projectId}` : "/workspace/my-work";
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
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open via Cmd+K or custom event
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

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const flat: FlatResult[] = results
    ? [
        ...results.projects.map((d): FlatResult => ({ kind: "project", data: d })),
        ...results.tasks.map((d): FlatResult => ({ kind: "task", data: d })),
        ...results.documents.map((d): FlatResult => ({ kind: "document", data: d })),
      ]
    : [];

  const navigate = useCallback(
    (r: FlatResult) => {
      setOpen(false);
      router.push(hrefFor(r));
    },
    [router]
  );

  function onKeyDownInModal(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flat[selectedIndex]) {
      navigate(flat[selectedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 1) {
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
  const showEmpty = query.trim().length >= 1 && !loading && !hasResults;

  // Track global index per section for rendering
  let globalIdx = 0;

  function ResultItem({ result, idx }: { result: FlatResult; idx: number }) {
    const isSelected = idx === selectedIndex;
    const icon =
      result.kind === "project" ? <Layers size={14} /> :
      result.kind === "task" ? <CheckSquare size={14} /> :
      <FileText size={14} />;
    const title = result.data.title;
    const subtitle =
      result.kind === "task" ? result.data.projectName :
      result.kind === "document" ? result.data.projectName :
      null;
    const statusColor =
      result.kind === "task" ? (STATUS_COLORS[result.data.status] ?? "var(--text-muted)") : undefined;

    return (
      <button
        type="button"
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => navigate(result)}
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
          const idx = globalIdx++;
          return <ResultItem key={r.data.id} result={r} idx={idx} />;
        })}
      </div>
    );
  }

  const projectItems: FlatResult[] = results?.projects.map((d) => ({ kind: "project", data: d })) ?? [];
  const taskItems: FlatResult[] = results?.tasks.map((d) => ({ kind: "task", data: d })) ?? [];
  const docItems: FlatResult[] = results?.documents.map((d) => ({ kind: "document", data: d })) ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-[20vh] z-[201] w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        }}
        onKeyDown={onKeyDownInModal}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: "1px solid var(--border)", height: 52 }}
        >
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search projects, tasks, documents..."
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

        {/* Results */}
        {hasResults && (
          <div className="max-h-[380px] overflow-y-auto py-1.5">
            <Section label="Projects" items={projectItems} />
            <Section label="Tasks" items={taskItems} />
            <Section label="Documents" items={docItems} />
          </div>
        )}

        {showEmpty && (
          <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!query && (
          <div className="px-4 py-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            Type to search across your workspace
          </div>
        )}

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[11px]"
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
