# Accept Toast Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a transient toast notification in the top-right when an action is accepted, telling the user what changed and where.

**Architecture:** A lightweight `ToastProvider` context wraps the workspace shell. `useLarryActionCentre.accept()` reads the response body (which contains the full event with `actionType`, `displayText`, `projectName`, `projectId`) and dispatches a toast. Toasts auto-dismiss after 4 seconds with a draining progress bar. Each toast has a color stripe from `ACTION_TYPE_MAP`, the action label, project name, display text, and a clickable "Open project" link.

**Tech Stack:** React context, Framer Motion (already installed), CSS variables from the existing theme, `getActionTypeTag()` from `@/lib/action-types`.

---

### Task 1: Create the Toast context and provider

**Files:**
- Create: `apps/web/src/components/toast/ToastContext.tsx`

- [ ] **Step 1: Create the toast context file**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface ToastItem {
  id: string;
  actionType: string;
  actionLabel: string;
  actionColor: string;
  displayText: string;
  projectName: string | null;
  projectId: string | null;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const value = useMemo(
    () => ({ toasts, pushToast, removeToast }),
    [toasts, pushToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/toast/ToastContext.tsx
git commit -m "feat(toast): add ToastProvider context and useToast hook"
```

---

### Task 2: Create the ToastContainer renderer

**Files:**
- Create: `apps/web/src/components/toast/ToastContainer.tsx`

- [ ] **Step 1: Create the toast container component**

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { useToast } from "./ToastContext";

const TOAST_DURATION_MS = 4000;

function Toast({
  id,
  actionLabel,
  actionColor,
  displayText,
  projectName,
  projectId,
  onRemove,
}: {
  id: string;
  actionLabel: string;
  actionColor: string;
  displayText: string;
  projectName: string | null;
  projectId: string | null;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [id, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        overflow: "hidden",
        borderRadius: "10px",
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e5e7eb)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        width: 340,
        position: "relative",
      }}
    >
      {/* Color stripe */}
      <div style={{ width: 4, flexShrink: 0, background: actionColor }} />

      <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: actionColor,
                whiteSpace: "nowrap",
              }}
            >
              {actionLabel}
            </span>
            {projectName && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-2, #6b7280)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                in {projectName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Dismiss notification"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "var(--text-2, #6b7280)",
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Display text */}
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            lineHeight: 1.4,
            color: "var(--text-1, #1f2937)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {displayText}
        </p>

        {/* Project link */}
        {projectId && (
          <Link
            href={`/workspace/projects/${projectId}`}
            onClick={() => onRemove(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "#6c44f6",
              textDecoration: "none",
            }}
          >
            Open project <ArrowRight size={12} />
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: TOAST_DURATION_MS / 1000, ease: "linear" }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: actionColor,
          transformOrigin: "left",
          opacity: 0.5,
        }}
      />
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: 56,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <Toast {...toast} onRemove={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/toast/ToastContainer.tsx
git commit -m "feat(toast): add ToastContainer with animated cards and progress bar"
```

---

### Task 3: Wire ToastProvider into WorkspaceShell

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file, after the existing imports:

```typescript
import { ToastProvider } from "@/components/toast/ToastContext";
import { ToastContainer } from "@/components/toast/ToastContainer";
```

- [ ] **Step 2: Wrap the shell content with ToastProvider and add ToastContainer**

Replace the return statement's outer `<WorkspaceChromeProvider>` wrapper. The `<ToastProvider>` wraps outside `<WorkspaceChromeProvider>` so both contexts are available. Add `<ToastContainer />` as the last child inside `<ToastProvider>`:

Change the return block from:

```tsx
    <WorkspaceChromeProvider
      value={{
```

to:

```tsx
    <ToastProvider>
    <WorkspaceChromeProvider
      value={{
```

And change the closing from:

```tsx
    </WorkspaceChromeProvider>
```

to:

```tsx
    </WorkspaceChromeProvider>
    <ToastContainer />
    </ToastProvider>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceShell.tsx
git commit -m "feat(toast): wire ToastProvider and ToastContainer into WorkspaceShell"
```

---

### Task 4: Fire toast on accept success

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`

- [ ] **Step 1: Add import for getActionTypeTag**

Add at the top, after existing imports:

```typescript
import { getActionTypeTag } from "@/lib/action-types";
```

- [ ] **Step 2: Add onAccepted callback parameter**

Extend the hook's parameter type. Change the function signature from:

```typescript
export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
} = {}) {
```

to:

```typescript
export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
  onAccepted,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
  onAccepted?: (event: { actionType: string; displayText: string; projectName: string | null; projectId: string }) => void;
} = {}) {
```

- [ ] **Step 3: Read the response body on accept success and fire callback**

Change the accept function's success branch from:

```typescript
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
        }
```

to:

```typescript
        if (response.ok) {
          const body = await readJson<{
            accepted: boolean;
            event?: { actionType: string; displayText: string; projectName: string | null; projectId: string };
          }>(response);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
          if (body.event && onAccepted) {
            onAccepted(body.event);
          }
        }
```

- [ ] **Step 4: Add onAccepted to the accept useCallback dependency array**

Change:

```typescript
    [load, onMutate]
  );

  const dismiss = useCallback(
```

to:

```typescript
    [load, onMutate, onAccepted]
  );

  const dismiss = useCallback(
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts
git commit -m "feat(toast): read accept response body and fire onAccepted callback"
```

---

### Task 5: Connect actions page to fire toasts

**Files:**
- Modify: `apps/web/src/app/workspace/actions/page.tsx`

- [ ] **Step 1: Add toast import**

Add after the existing imports at the top of the file:

```typescript
import { useToast } from "@/components/toast/ToastContext";
import { getActionTypeTag } from "@/lib/action-types";
```

Note: `getActionTypeTag` may already be imported. If so, skip that line.

- [ ] **Step 2: Call useToast in the page component**

Find the line where `useLarryActionCentre` is called and add `useToast` before it:

```typescript
  const { pushToast } = useToast();
```

- [ ] **Step 3: Pass onAccepted to useLarryActionCentre**

Update the `useLarryActionCentre` call to include the `onAccepted` callback. Change from:

```typescript
  const {
    ...
  } = useLarryActionCentre({
    onMutate: ...,
  });
```

Add the `onAccepted` property:

```typescript
    onAccepted: (event) => {
      const tag = getActionTypeTag(event.actionType);
      pushToast({
        actionType: event.actionType,
        actionLabel: tag.label,
        actionColor: tag.color,
        displayText: event.displayText,
        projectName: event.projectName,
        projectId: event.projectId,
      });
    },
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/actions/page.tsx
git commit -m "feat(toast): fire toast on accept success in actions page"
```

---

### Task 6: Verify build and test

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compile check**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -v node_modules | head -20`
Expected: No errors from the new/modified files.

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run apps/api/tests/governed-auto-execution.test.ts apps/api/tests/larry-action-centre.test.ts --reporter=verbose`
Expected: All tests pass (these confirm the backend contract hasn't changed).

- [ ] **Step 3: Final commit with all files**

If any files weren't committed in prior tasks:

```bash
git add apps/web/src/components/toast/ToastContext.tsx apps/web/src/components/toast/ToastContainer.tsx apps/web/src/app/workspace/WorkspaceShell.tsx apps/web/src/hooks/useLarryActionCentre.ts apps/web/src/app/workspace/actions/page.tsx
git commit -m "feat(toast): show success notification when action is accepted

Adds a toast notification system: ToastProvider context, animated
ToastContainer with Framer Motion, and integration with the accept
flow. Each toast shows the action type label with color stripe,
display text, project name, and a clickable project link. Auto-
dismisses after 4 seconds with a draining progress bar."
```
