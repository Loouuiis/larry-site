"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FolderOpen, FileText, MessageSquare, ClipboardList, X, Bot, BarChart2 } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

export type NavSection = "projects" | "documents" | "chats" | "meetings" | "analytics";

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ElementType }[] = [
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
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-neutral-100">
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main navigation">
        <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Workspace
        </p>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
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
                isActive
                  ? "text-[var(--color-brand)] font-medium"
                  : "text-[var(--color-muted)]",
              ].join(" ")}
            >
              {/* Hover background */}
              {!isActive && (
                <motion.div
                  className="absolute inset-0 rounded-xl bg-[var(--color-surface)]"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                />
              )}
              {/* Active background */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-bg"
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
                  layoutId="sidebar-active-bar"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--color-brand)]"
                  transition={{ duration: 0.22, ease: EASE }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom — Larry badge */}
      <div className="px-4 py-4 border-t border-neutral-100">
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-brand)]/5 border border-[var(--color-brand)]/12 px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white">
            <Bot size={13} />
          </span>
          <div>
            <p className="text-xs font-medium text-neutral-800">Larry is active</p>
            <p className="text-[10px] text-neutral-400">Monitoring 4 projects</p>
          </div>
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ active, setActive, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-neutral-100 bg-white">
        <SidebarInner active={active} setActive={setActive} />
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
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-neutral-100 bg-white shadow-2xl md:hidden"
            >
              <SidebarInner active={active} setActive={setActive} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
