# Dashboard Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire workspace dashboard to match the minimalist design language defined in `larry-dashboard-redesign.jsx` — softer borders, refined typography, toned-down AI branding, cleaner spacing — without removing or altering any existing features.

**Architecture:** This is a pure visual pass. No routes, API calls, state management, or component props change. We update design tokens in `globals.css`, then propagate the new aesthetic through each component file. The redesign JSX uses Plus Jakarta Sans, border colour `#f0edfa`, background `#fafaff`, and a generally lighter touch throughout.

**Tech Stack:** Next.js 16 / React 19 / Tailwind CSS 4 / Framer Motion / Lucide React

**Reference file:** `C:\Users\oreil\Downloads\larry-dashboard-redesign.jsx` (628 lines, contains all target styles as a `S` object and `GLOBAL_CSS` string)

---

## Key Design Differences (Current → Redesign)

| Property | Current | Redesign |
|---|---|---|
| Font family | Inter | Plus Jakarta Sans |
| Border colour | `#e2d6fc` | `#f0edfa` |
| Row separator | `var(--border)` | `#faf8ff` |
| Soft background | `var(--surface-2)` / `#f6f2fc` | `#fafaff` (new token) |
| Sidebar expanded width | 252px | 240px |
| Sidebar collapsed width | 52px | 56px |
| Nav item radius | 8px | 7px |
| Nav active indicator | 3px left purple bar + bg | Background only (`#f6f2fc`) |
| Logo | Image (`Larry_logos.png`) | Icon mark (26px purple square) + "Larry" text |
| Project list icons | FolderOpen | 8px coloured dots |
| User avatar shape | Circle | Rounded square (radius 8) |
| Search | Plain | Add `/` keyboard shortcut badge |
| Top bar | Auto-hides after 2.5s | Always visible |
| Task row height | 38-40px | 42px |
| Progress bar | 4px solid | 3px gradient |
| Status pills | Text only | Dot + text |
| Chat subtitle | "AI Project Manager · always on" | "Project assistant · {name}" |
| Chat icon | Sparkles | Layers icon |
| FAB icon | Sparkles | Layers icon |
| Panel overlay | `bg-black/10 backdrop-blur-[2px]` | `rgba(0,0,0,0.06) blur(1px)` |
| Action "Reject" label | "Reject" | "Dismiss" |

---

### Task 1: Update Design Tokens (globals.css)

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Update border token**

Change `--border` from `#e2d6fc` to `#f0edfa`:

```css
--border:             #f0edfa;
```

- [ ] **Step 2: Add new soft-background tokens**

Add two new tokens after the existing surface tokens:

```css
--bg-soft:            #fafaff;
--border-subtle:      #faf8ff;
```

- [ ] **Step 3: Update nav item radius**

```css
--radius-nav-item:    7px;
```

- [ ] **Step 4: Remove the active nav accent bar**

Delete the entire `.pm-nav-item.active::before` rule (the 3px left purple bar). Also delete `.pm-board-item.active::before`. The active state will rely on background colour alone.

- [ ] **Step 5: Update `.pm-nav-item` spacing**

```css
.pm-nav-item {
  gap: 10px;
  padding: 0 10px;
  height: 34px;
  font-size: 13px;
}
```

- [ ] **Step 6: Update table row borders**

```css
.pm-table-row {
  min-height: 42px;
  border-bottom: 1px solid var(--border-subtle);
}
```

- [ ] **Step 7: Update `.pm-pill` to include dot space**

Add gap for the status dot that components will now render inline:

```css
.pm-pill {
  gap: 5px;
}
```

- [ ] **Step 8: Update search input default**

```css
.pm-search-input {
  background: var(--bg-soft);
  border-color: var(--border);
}
```

- [ ] **Step 9: Update scrollbar thumb**

Change `.dashboard-root ::-webkit-scrollbar-thumb` background from `var(--border-2)` to `#e2d6fc`, and hover to `#bdb7d0` (keeps them soft).

- [ ] **Step 10: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`
Expected: Build succeeds. All changes are CSS-only.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: update design tokens — softer borders, new bg-soft token, remove nav accent bars"
```

---

### Task 2: Add Plus Jakarta Sans Font

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add Plus Jakarta Sans import in layout.tsx**

Import from `next/font/google` alongside the existing fonts:

```tsx
import { Geist, Inter } from "next/font/google";
// becomes:
import { Geist, Inter, Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
```

Add the variable to the `<body>` className:

```tsx
<body suppressHydrationWarning className={`${geistSans.variable} ${inter.variable} ${plusJakarta.variable} antialiased`}>
```

- [ ] **Step 2: Update font-family in globals.css**

In the `body` rule, change:

```css
font-family: var(--font-plus-jakarta), var(--font-inter), system-ui, sans-serif;
```

In `.dashboard-root, .workspace-root`, change:

```css
font-family: var(--font-plus-jakarta), var(--font-inter), system-ui, sans-serif;
```

In the `@theme inline` block, update:

```css
--font-sans: var(--font-plus-jakarta);
```

- [ ] **Step 3: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "style: add Plus Jakarta Sans as primary font"
```

---

### Task 3: Redesign Sidebar

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Update desktop sidebar widths**

In `WorkspaceSidebar`, change the `animate` prop:

```tsx
animate={{ width: collapsed ? 56 : 240 }}
```

- [ ] **Step 2: Update collapsed sidebar width**

In the collapsed state div, adjust from `52` references to `56`:
The collapsed view already uses the `animate` width, so just ensure internal padding looks correct at 56px. Change the expand button to use `PanelLeftOpen` at size 16 (already correct).

- [ ] **Step 3: Replace logo image with icon mark + text**

In `WorkspaceSidebarInner`, replace the logo section:

```tsx
{/* Logo */}
<div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
  <Link href="/workspace" onClick={onClose} className="flex items-center gap-2">
    <div
      className="flex items-center justify-center rounded-[7px] text-white"
      style={{ width: 26, height: 26, background: "#6c44f6" }}
    >
      <Layers size={15} />
    </div>
    <span className="text-[16px] font-bold" style={{ color: "#1e1e2e", letterSpacing: "-0.02em" }}>
      Larry
    </span>
  </Link>
  {/* collapse button stays the same */}
```

Add `Layers` to the lucide-react imports.

- [ ] **Step 4: Add keyboard shortcut badge to search**

After the search input's closing `/>`, before the `{isSearching && ...}` block, add:

```tsx
{!isSearching && (
  <kbd
    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 select-none"
    style={{
      fontSize: 10,
      color: "#bdb7d0",
      background: "#f2f3ff",
      padding: "1px 5px",
      borderRadius: 4,
      fontWeight: 500,
    }}
  >
    /
  </kbd>
)}
```

Update the search input background to `#fafaff` and border to `var(--border)` (which is now `#f0edfa`).

- [ ] **Step 5: Replace project FolderOpen icons with coloured dots**

In the projects list `.map`, replace:

```tsx
<FolderOpen size={16} className="shrink-0" style={{ color: isActive ? "var(--brand)" : isStarred ? "var(--brand-muted, var(--brand))" : "var(--text-disabled)" }} />
```

With:

```tsx
<span
  className="shrink-0"
  style={{
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: isActive ? "#6c44f6" : "#bdb7d0",
  }}
/>
```

- [ ] **Step 6: Update user avatar to rounded square**

Change the user avatar div from `rounded-full` to `rounded-lg` (8px):

```tsx
<div
  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
  style={{ background: "#6c44f6", color: "#fff", fontSize: 11, fontWeight: 600 }}
>
```

Show user initials instead of the User icon. Derive initials from `userEmail` (first two chars of the local part, uppercased):

```tsx
{(userEmail?.split("@")[0] ?? "?").slice(0, 2).toUpperCase()}
```

- [ ] **Step 7: Replace "Ask Larry" Sparkles icon with Layers**

In the nav item for `id === "larry"`, change `<Sparkles>` to `<Layers>` (already imported in Step 3).

- [ ] **Step 8: Update mobile drawer border**

Change the mobile drawer's `borderRight` and `boxShadow` to use the new softer border:

```tsx
style={{
  width: "252px", // mobile drawer keeps 252 for comfort
  borderRight: "1px solid #f0edfa",
  background: "#ffffff",
  boxShadow: "0 0 40px rgba(0,0,0,0.06)",
}}
```

- [ ] **Step 9: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "style: redesign sidebar — icon mark logo, coloured dots, rounded avatar, softer borders"
```

---

### Task 4: Simplify Top Bar (Remove Auto-Hide)

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceTopBar.tsx`

- [ ] **Step 1: Remove auto-hide state and effects**

Remove these lines:
- `const [visible, setVisible] = useState(true);`
- `const idleTimer = useRef<...>(null);`
- `const barRef = useRef<...>(null);`
- The `resetIdle` callback
- The entire `useEffect` with `onMove` / `onScroll` listeners
- The `IDLE_MS` and `REVEAL_ZONE_PX` constants
- Remove unused imports: `useCallback`, `useEffect`, `useRef` (if nothing else uses them — keep `useRef` only if `barRef` is still needed, but it won't be)

- [ ] **Step 2: Simplify the header element**

Remove the dynamic `style` object (transform/opacity/pointerEvents) and the `ref`:

```tsx
return (
  <header
    className="flex h-12 shrink-0 items-center justify-between px-6 gap-4"
    style={{ height: 48 }}
  >
```

- [ ] **Step 3: Update breadcrumb separator styling**

In the `Breadcrumb` component, update the separator span:

```tsx
<span className="text-[13px] select-none" style={{ color: "#e2d6fc" }}>
  /
</span>
```

- [ ] **Step 4: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceTopBar.tsx
git commit -m "style: make top bar always visible, remove auto-hide behaviour"
```

---

### Task 5: Restyle Task Table & TaskCenter

**Files:**
- Modify: `apps/web/src/components/dashboard/TaskTable.tsx`
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx`

- [ ] **Step 1: Update TaskTable row borders and height**

In `TaskTable.tsx`, the row styling comes from the `.pm-table-row` class which was already updated in Task 1. Verify the grid rows render at 42px with `#faf8ff` borders. No code change needed if CSS tokens propagated correctly.

- [ ] **Step 2: Add status dot inside status pills in TaskTable**

In the status pill button, add a 6px coloured dot before the label. Find the `statusPillClass` usage and wrap the pill content:

```tsx
<button
  type="button"
  className={statusPillClass(task.status)}
  onClick={...}
  style={{ cursor: "pointer" }}
>
  <span
    style={{
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: task.status === "completed" ? "#34d399"
        : task.status === "on_track" ? "#6c44f6"
        : task.status === "overdue" ? "#ef4444"
        : task.status === "at_risk" ? "#f59e0b"
        : "#94a3b8",
      flexShrink: 0,
    }}
  />
  {statusLabel(task.status)}
</button>
```

- [ ] **Step 3: Update TaskCenter row borders**

In `TaskCenter.tsx`, update all `borderBottom: "1px solid var(--border)"` on task rows to `borderBottom: "1px solid var(--border-subtle, #faf8ff)"` for the individual task rows. Keep group headers using `var(--border)`.

- [ ] **Step 4: Update TaskCenter group left border**

The 3px left border stays (it's a nice visual cue). No change needed.

- [ ] **Step 5: Update progress bars throughout**

Search for progress bar elements (4px height, solid fill) and update to:

```tsx
style={{
  height: 3,
  background: "linear-gradient(90deg, #6c44f6, #b29cf8)",
  borderRadius: 2,
}}
```

The track becomes:

```tsx
style={{
  height: 3,
  background: "#ece8fa",
  borderRadius: 2,
}}
```

- [ ] **Step 6: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/dashboard/TaskTable.tsx apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx
git commit -m "style: restyle task rows — lighter borders, status dots, gradient progress bars"
```

---

### Task 6: Restyle Floating Panels (Action, Notification, TaskDetail)

**Files:**
- Modify: `apps/web/src/components/dashboard/ActionPanel.tsx`
- Modify: `apps/web/src/components/dashboard/NotificationPanel.tsx`
- Modify: `apps/web/src/components/dashboard/TaskDetailPanel.tsx`

- [ ] **Step 1: Update ActionPanel borders and labels**

In `ActionPanel.tsx`:
- Change all border colours from `var(--border)` or `var(--color-border)` to `#f0edfa`
- Change the "Reject" button label text from "Reject" to "Dismiss"
- Update the overlay/backdrop: change `bg-black/10 backdrop-blur-[2px]` to `background: "rgba(0,0,0,0.06)"` and `backdropFilter: "blur(1px)"`
- Update panel shadow to `boxShadow: "0 0 40px rgba(0,0,0,0.06)"`

- [ ] **Step 2: Update NotificationPanel borders and simplify**

In `NotificationPanel.tsx`:
- Change all border colours to `#f0edfa`
- For read notifications, remove the severity-based background tint. Read items should have `background: "#fff"` uniformly
- Unread items keep their subtle tint but switch to `#fafaff` instead of the current severity colours
- Keep the unread dot indicator (change to `#6c44f6` brand purple for all types)
- Update overlay/backdrop same as Step 1

- [ ] **Step 3: Update TaskDetailPanel borders**

In `TaskDetailPanel.tsx`:
- Change all `border` references to use `#f0edfa`
- Detail row separators: change to `borderBottom: "1px solid #faf8ff"`
- Section dividers (description, activity): change to `borderTop: "1px solid #f0edfa"`
- Update overlay/backdrop same as Step 1

- [ ] **Step 4: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/ActionPanel.tsx apps/web/src/components/dashboard/NotificationPanel.tsx apps/web/src/components/dashboard/TaskDetailPanel.tsx
git commit -m "style: restyle floating panels — softer borders, lighter overlays, Dismiss label"
```

---

### Task 7: Tone Down Chat AI Branding

**Files:**
- Modify: `apps/web/src/app/workspace/LarryChat.tsx`
- Modify: `apps/web/src/components/dashboard/LarryChat.tsx`

Note: There are TWO LarryChat files. The one in `app/workspace/` is the real one used in production (connected to API). The one in `components/dashboard/` is a standalone mock version. Apply changes to both.

- [ ] **Step 1: Update workspace LarryChat header branding**

Find the chat header where it shows "AI Project Manager" or similar subtitle. Change to:

```tsx
<div style={{ fontSize: 10, color: "#bdb7d0" }}>
  Project assistant{projectName ? ` · ${projectName}` : ""}
</div>
```

Remove any green status dot (`bg-emerald-400`) from the header.

- [ ] **Step 2: Replace Sparkles icon with Layers**

In both LarryChat files, replace all `<Sparkles>` imports and usages with `<Layers>` from lucide-react. This affects:
- The chat header icon
- The empty state icon
- The chat avatar

- [ ] **Step 3: Simplify the mock LarryChat prompt cards**

In `components/dashboard/LarryChat.tsx`, update `EXAMPLE_PROMPTS` to remove emojis:

```tsx
const EXAMPLE_PROMPTS: { label: string; sub: string }[] = [
  { label: "What's at risk this week?", sub: "Check project health and deadlines" },
  { label: "Who's blocked right now?", sub: "Find team members waiting on dependencies" },
  { label: "Summarise today's progress", sub: "Get a quick status across all projects" },
];
```

Update the prompt card rendering to not render `p.emoji` (remove the emoji span).

- [ ] **Step 4: Update chat panel styling**

For both LarryChat files:
- Panel border radius: change `rounded-2xl` to `rounded-[14px]`
- Panel border: change to `border-[#f0edfa]`
- Message bubble (Larry): background `#fafaff`
- Chat input background: `#fafaff`
- Chat input border: `#f0edfa`
- Panel shadow: `0 20px 60px rgba(0,0,0,0.1), 0 4px 14px rgba(0,0,0,0.04)`

- [ ] **Step 5: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/workspace/LarryChat.tsx apps/web/src/components/dashboard/LarryChat.tsx
git commit -m "style: tone down chat AI branding — Layers icon, 'Project assistant' subtitle, simpler prompts"
```

---

### Task 8: Update FAB and WorkspaceShell

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Replace FAB Sparkles icon with Layers**

Change the import and the icon in the floating button:

```tsx
import { Layers } from "lucide-react";
// ...
<Layers size={20} />
```

- [ ] **Step 2: Update FAB styling**

```tsx
style={{
  position: "fixed",
  bottom: "24px",
  right: "24px",
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  background: "#6c44f6",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 20px rgba(108,68,246,0.3)",
  zIndex: 60,
  border: "none",
  cursor: "pointer",
}}
```

- [ ] **Step 3: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceShell.tsx
git commit -m "style: update FAB — Layers icon, softer shadow, 14px radius"
```

---

### Task 9: Restyle Workspace Home

**Files:**
- Modify: `apps/web/src/app/workspace/WorkspaceHome.tsx`

- [ ] **Step 1: Update project card borders**

Change all card `border` from `var(--border)` to `#f0edfa`:

```tsx
border: "1px solid #f0edfa",
```

- [ ] **Step 2: Update progress bars to gradient**

In the project card progress bar:

```tsx
<div
  style={{
    width: `${Math.max(project.progress, 2)}%`,
    height: "100%",
    borderRadius: "9999px",
    background: "linear-gradient(90deg, #6c44f6, #b29cf8)",
  }}
/>
```

Track height: change from 4px to 3px.

- [ ] **Step 3: Update briefing panel borders**

Change briefing card borders to `#f0edfa`.

- [ ] **Step 4: Update connector nudge borders**

Change the nudge banner border to `#f0edfa`.

- [ ] **Step 5: Update "New Project" button**

Keep the `#e2d6fc` background / `#6c44f6` text but make sure border-radius matches redesign (8px).

- [ ] **Step 6: Verify build**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/workspace/WorkspaceHome.tsx
git commit -m "style: restyle workspace home — softer borders, gradient progress bars"
```

---

### Task 10: Sweep Remaining Components

**Files:**
- Modify: `apps/web/src/components/dashboard/StatusChip.tsx`
- Modify: `apps/web/src/components/ui/SourceBadge.tsx`
- Modify: `apps/web/src/app/workspace/NotificationBell.tsx`
- Modify: `apps/web/src/app/workspace/ProjectCreateSheet.tsx`
- Modify: `apps/web/src/app/workspace/MeetingTranscriptModal.tsx`
- Modify: `apps/web/src/components/dashboard/pages/ProjectHub.tsx`
- Modify: `apps/web/src/components/dashboard/pages/AnalyticsPage.tsx`
- Modify: `apps/web/src/components/dashboard/pages/GanttPage.tsx`
- Modify: `apps/web/src/components/dashboard/pages/ChatsPage.tsx`
- Modify: `apps/web/src/components/dashboard/pages/DocumentsPage.tsx`
- Modify: `apps/web/src/components/dashboard/pages/MeetingNotesPage.tsx`

- [ ] **Step 1: Update all hardcoded border colours**

In every file listed above, search for `#e2d6fc`, `var(--border)`, and `var(--color-border)` references that render visible borders. Replace hardcoded `#e2d6fc` with `#f0edfa`. CSS variable references will already pick up the new token from Task 1.

- [ ] **Step 2: Update SourceBadge styling**

Make it match the redesign's source tag:

```tsx
style={{
  fontSize: 11,
  color: "#8b8fa8",
  background: "#fafaff",
  padding: "2px 7px",
  borderRadius: 4,
}}
```

- [ ] **Step 3: Update NotificationBell badge dot**

Change the badge dot to use `#6c44f6` consistently (instead of varying colours).

- [ ] **Step 4: Update ProjectCreateSheet and MeetingTranscriptModal borders**

Change modal borders and overlays to match Task 6 panel styling.

- [ ] **Step 5: Update dashboard pages**

For ProjectHub, AnalyticsPage, GanttPage, ChatsPage, DocumentsPage, MeetingNotesPage:
- Replace any hardcoded `#e2d6fc` borders with `#f0edfa`
- Update progress bars to 3px gradient style
- Update any `Sparkles` icon usage to `Layers`
- These pages mostly inherit from CSS tokens, so changes should be minimal

- [ ] **Step 6: Full build verification**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run build --workspace=apps/web 2>&1 | tail -20`
Expected: Clean build, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/
git commit -m "style: sweep remaining components — consistent borders, source tags, notification badges"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Build passes cleanly
- [ ] Sidebar renders at 240px with icon mark logo, coloured project dots, rounded avatar
- [ ] Sidebar collapses to 56px
- [ ] Top bar is always visible (no auto-hide)
- [ ] Task rows have subtle `#faf8ff` borders and 42px height
- [ ] Status pills show coloured dots
- [ ] Progress bars are 3px with gradient
- [ ] All panel overlays use subtle `rgba(0,0,0,0.06)` backdrop
- [ ] Chat says "Project assistant" not "AI Project Manager"
- [ ] No Sparkles icons remain in dashboard (all replaced with Layers)
- [ ] FAB uses Layers icon with 14px radius
- [ ] Font is Plus Jakarta Sans throughout
- [ ] All borders use `#f0edfa` (not `#e2d6fc`)
- [ ] No features were removed — all buttons, dropdowns, search, favourites, voice input, quick replies still work
