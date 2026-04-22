"use client";
import { useEffect, useRef, useState } from "react";
import type { ContextMenuAction, ContextMenuItem } from "./gantt-types";

export interface CategoryOption {
  id: string | null;     // null = Uncategorised
  name: string;
  colour: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  colour?: string;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  categories: CategoryOption[];
  projects?: ProjectOption[];
  onSelect: (action: ContextMenuAction, payload?: { categoryId?: string | null; projectId?: string }) => void;
  onClose: () => void;
}

export function GanttContextMenu({ x, y, items, categories, projects = [], onSelect, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [submenuOpenId, setSubmenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        minWidth: 200,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        padding: 4,
        zIndex: 1000,
        fontSize: 13,
      }}
    >
      {items.map((item) => {
        const isSubmenu = item.hasSubmenu && !item.disabled;
        const submenuThisOpen = isSubmenu && submenuOpenId === item.id;
        return (
          <div
            key={item.id}
            role="menuitem"
            onMouseEnter={() => setSubmenuOpenId(isSubmenu ? item.id : null)}
            onClick={() => {
              if (item.disabled) return;
              if (item.hasSubmenu) return;
              onSelect(item.id);
            }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
              padding: "0 12px",
              borderRadius: 4,
              color: item.disabled
                ? "var(--text-muted)"
                : item.destructive
                  ? "var(--pm-red)"
                  : "var(--text-1)",
              cursor: item.disabled ? "default" : "pointer",
              background: "transparent",
              userSelect: "none",
            }}
            onMouseOver={(e) => { if (!item.disabled) { e.currentTarget.style.background = "var(--surface-2)"; } }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span>{item.label}</span>
            {isSubmenu && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▸</span>}

            {submenuThisOpen && item.id === "moveToCategory" && (
              <Submenu onClick={(e) => e.stopPropagation()}>
                {categories.length === 0 && (
                  <EmptySubmenu>No categories available</EmptySubmenu>
                )}
                {categories.map((cat) => (
                  <SubmenuItem
                    key={cat.id ?? "uncat"}
                    onClick={() => onSelect("moveToCategory", { categoryId: cat.id })}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: cat.id === null ? "var(--text-muted)" : cat.colour,
                      flexShrink: 0,
                      display: "inline-block",
                    }} />
                    <span style={{ fontStyle: cat.id === null ? "italic" : "normal" }}>
                      {cat.name}
                    </span>
                  </SubmenuItem>
                ))}
              </Submenu>
            )}

            {submenuThisOpen && item.id === "moveToProject" && (
              <Submenu onClick={(e) => e.stopPropagation()}>
                {projects.length === 0 && (
                  <EmptySubmenu>No projects available</EmptySubmenu>
                )}
                {projects.map((proj) => (
                  <SubmenuItem
                    key={proj.id}
                    onClick={() => onSelect("moveToProject", { projectId: proj.id })}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: proj.colour ?? "var(--text-muted)",
                      flexShrink: 0,
                      display: "inline-block",
                    }} />
                    <span>{proj.name}</span>
                  </SubmenuItem>
                ))}
              </Submenu>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Submenu({ children, onClick }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        left: "100%",
        top: 0,
        minWidth: 180,
        maxHeight: 320,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        padding: 4,
        marginLeft: 4,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function EmptySubmenu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
      {children}
    </div>
  );
}

function SubmenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 30,
        padding: "0 10px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 13,
        color: "var(--text-1)",
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </div>
  );
}
