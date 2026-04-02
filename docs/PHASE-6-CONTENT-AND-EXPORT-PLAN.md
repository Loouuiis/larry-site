# Phase 6: Content Import, Email Drafts, PDF Export & Team Tree

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four independent features: (A) external content import for project creation, (B) email draft approval UI, (C) PDF export from project dashboard, (D) team list/tree toggle. These are independent — work them in any order.

**Architecture:** Each feature is self-contained. Import adds a 4th intake mode. Email drafts surface existing API data in the action centre. PDF export captures dashboard HTML to a downloadable file. Team tree adds an alternate view to the existing collaborators panel.

**Tech Stack:** Next.js App Router, React client components, Lucide icons, Larry design tokens, html2canvas + jsPDF (for PDF export, install as dependencies)

---

## Context: What Already Exists

Read these files before starting:

- `apps/web/src/app/workspace/projects/new/WorkspaceProjectIntake.tsx` — Current 3-mode intake (manual, chat, meeting). ~80 lines of type definitions, then a long component.
- `apps/web/src/app/api/workspace/documents/route.ts` — Document list API
- `apps/web/src/app/api/workspace/documents/generate/route.ts` — Document generation API
- `apps/web/src/app/api/workspace/email/drafts/route.ts` — Email draft list API (GET returns drafts)
- `apps/web/src/app/api/workspace/email/drafts/send/route.ts` — Send draft API (POST)
- `apps/web/src/app/dashboard/types.ts` — `EmailDraft` type already defined
- `apps/web/src/app/workspace/projects/[projectId]/dashboard/ProjectDashboard.tsx` — Dashboard with donut chart, KPIs, assignee breakdown
- `apps/web/src/app/workspace/projects/[projectId]/CollaboratorsPanel.tsx` — Team list panel
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` — Project page with 9-tab bar

---

## Feature A: External Content Import (Project Creation Method 4)

### Task A1: Add "import" Intake Mode

**Files:**
- Modify: `apps/web/src/app/workspace/projects/new/WorkspaceProjectIntake.tsx`

- [ ] **Step 1: Read the full WorkspaceProjectIntake.tsx file**

Understand the existing mode types, the `CHAT_QUESTIONS` array, the `IntakeDraft` type, and how the mode selector works.

- [ ] **Step 2: Add the "import" mode type**

Find the `IntakeMode` type and add `"import"`:
```typescript
type IntakeMode = "manual" | "chat" | "meeting" | "import";
```

- [ ] **Step 3: Add the import mode card to the mode selector**

Find where the 3 mode cards are rendered (manual, chat, meeting). Add a 4th card:
```tsx
<button
  type="button"
  onClick={() => setMode("import")}
  className="..." // match existing card style
>
  <FileText size={24} style={{ color: "var(--brand)" }} />
  <span className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>
    Start from a document
  </span>
  <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
    Let Larry extract and structure your project from a PDF, Word document, or spreadsheet.
  </span>
</button>
```

Add `FileText` and `Upload` to the Lucide import if not already present.

- [ ] **Step 4: Build the import mode UI**

When `mode === "import"`, render:

1. A file upload zone (drag-and-drop or click) accepting `.pdf`, `.docx`, `.xlsx`
2. A file name display after selection
3. A "Process with Larry" button that:
   - Reads the file as a `FormData` upload
   - POSTs to `/api/workspace/documents/generate` (or a new `/api/workspace/projects/intake/drafts` endpoint with the file)
   - Shows a loading state "Larry is reading your document..."
   - On success, transitions to the same bootstrap review screen as the chat mode

```tsx
// Import mode UI skeleton:
{mode === "import" && (
  <div className="space-y-4">
    <h2 className="text-lg font-bold" style={{ color: "var(--text-1)" }}>
      Start from a document
    </h2>
    <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
      Upload a PDF, Word document, or Excel file. Larry will extract the project structure.
    </p>

    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors"
      style={{ borderColor: file ? "var(--brand)" : "var(--border)" }}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) setFile(droppedFile);
      }}
    >
      <Upload size={28} style={{ color: "var(--text-disabled)" }} />
      {file ? (
        <p className="text-[14px] font-medium" style={{ color: "var(--text-1)" }}>
          {file.name}
        </p>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--text-disabled)" }}>
          Drop a file here or click to browse
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
        Supports .pdf, .docx, .xlsx
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) setFile(selected);
        }}
      />
    </div>

    <button
      type="button"
      onClick={handleImportSubmit}
      disabled={!file || importBusy}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-white disabled:opacity-50"
      style={{ background: "var(--cta)" }}
    >
      {importBusy ? "Larry is reading your document..." : "Process with Larry"}
    </button>
  </div>
)}
```

You'll need to add state:
```typescript
const [file, setFile] = useState<File | null>(null);
const [importBusy, setImportBusy] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 5: Implement the submit handler**

```typescript
async function handleImportSubmit() {
  if (!file) return;
  setImportBusy(true);
  try {
    const formData = new FormData();
    formData.append("file", file);

    // Create a draft first, then bootstrap it with the file content
    const draftRes = await fetch("/api/workspace/projects/intake/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "import" }),
    });
    const draftData = await draftRes.json();
    if (!draftRes.ok) {
      setError(draftData.error ?? "Failed to start import.");
      return;
    }

    const draftId = draftData.draft?.id;
    if (!draftId) {
      setError("Failed to create intake draft.");
      return;
    }

    // Bootstrap the draft with the file
    const bootstrapRes = await fetch(
      `/api/workspace/projects/intake/drafts/${draftId}/bootstrap`,
      { method: "POST", body: formData }
    );
    const bootstrapData = await bootstrapRes.json();
    if (!bootstrapRes.ok) {
      setError(bootstrapData.error ?? "Failed to process document.");
      return;
    }

    // Transition to review screen (same as chat mode after bootstrap)
    setDraft(bootstrapData.draft);
  } catch {
    setError("Upload failed. Please try again.");
  } finally {
    setImportBusy(false);
  }
}
```

**Note:** The backend `/api/workspace/projects/intake/drafts/[id]/bootstrap` may need to be updated to accept `FormData` with a file upload. If the existing API only accepts JSON chat answers, you'll need to add a new API route or extend the existing one. Check the route handler first.

- [ ] **Step 6: Build and verify**

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/workspace/projects/new/WorkspaceProjectIntake.tsx
git commit -m "feat: add external content import as 4th project creation method (pdf/docx/xlsx)"
```

---

## Feature B: Email Draft Approval UI

### Task B1: Create Email Draft Cards in Action Centre

**Files:**
- Create: `apps/web/src/hooks/useEmailDrafts.ts`
- Modify: `apps/web/src/app/workspace/actions/page.tsx`

- [ ] **Step 1: Create the email drafts hook**

```typescript
// apps/web/src/hooks/useEmailDrafts.ts
import { useCallback, useEffect, useState } from "react";
import type { EmailDraft } from "@/app/dashboard/types";

export function useEmailDrafts() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/email/drafts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDrafts((data.items ?? data.drafts ?? []).filter((d: EmailDraft) => d.state === "draft"));
      }
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(async (draftId: string) => {
    setSending(draftId);
    try {
      const res = await fetch("/api/workspace/email/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } finally {
      setSending(null);
    }
  }, []);

  const dismiss = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { drafts, loading, sending, send, dismiss, refresh: load };
}
```

- [ ] **Step 2: Add email drafts section to the workspace actions page**

In `apps/web/src/app/workspace/actions/page.tsx`, import the hook and render draft cards between the pending review section and the recent activity section:

```tsx
// After the pending review section, before the activity section:
{emailDrafts.length > 0 && (
  <section
    style={{
      borderRadius: "var(--radius-card)",
      border: "1px solid var(--border)",
      background: "var(--surface)",
      padding: "20px",
    }}
  >
    <div className="flex items-center gap-3">
      <Mail size={18} style={{ color: "var(--cta)" }} />
      <div>
        <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
          Email drafts
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Larry has prepared these emails for your review.
        </p>
      </div>
    </div>
    <div className="mt-4 space-y-3">
      {emailDrafts.map((draft) => (
        <div
          key={draft.id}
          className="rounded-xl border px-4 py-4"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            To: {draft.recipient}
          </p>
          <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-1)" }}>
            {draft.subject}
          </p>
          <p className="mt-2 text-[13px] leading-6 line-clamp-3" style={{ color: "var(--text-2)" }}>
            {draft.body}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void dismissDraft(draft.id)}
              className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => void sendDraft(draft.id)}
              disabled={sendingDraft === draft.id}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: "var(--cta)" }}
            >
              {sendingDraft === draft.id ? "Sending..." : "Approve & Send"}
            </button>
          </div>
        </div>
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useEmailDrafts.ts apps/web/src/app/workspace/actions/page.tsx
git commit -m "feat: add email draft approval cards to workspace action centre"
```

---

## Feature C: PDF Export from Dashboard

### Task C1: Install Dependencies

- [ ] **Step 1: Install html2canvas and jsPDF**

```bash
cd apps/web && npm install html2canvas-pro jspdf
```

Note: Use `html2canvas-pro` (maintained fork) not `html2canvas` (stale).

- [ ] **Step 2: Commit package changes**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "deps: add html2canvas-pro and jspdf for PDF export"
```

### Task C2: Add Export Button to Dashboard

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/dashboard/ProjectDashboard.tsx`

- [ ] **Step 1: Read the full dashboard file**

Understand the layout — it has a donut chart, KPI cards, and an assignee breakdown.

- [ ] **Step 2: Add an export button and handler**

Import at top:
```typescript
import { Download } from "lucide-react";
```

Add state:
```typescript
const [exporting, setExporting] = useState(false);
const dashboardRef = useRef<HTMLDivElement>(null);
```

Add the export function:
```typescript
async function handleExport() {
  if (!dashboardRef.current) return;
  setExporting(true);
  try {
    const html2canvas = (await import("html2canvas-pro")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(dashboardRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${project?.name ?? "project"}-dashboard.pdf`);
  } catch {
    // Silently fail — user can try again
  } finally {
    setExporting(false);
  }
}
```

- [ ] **Step 3: Wrap the dashboard content in a ref div**

Add `ref={dashboardRef}` to the main content wrapper div.

- [ ] **Step 4: Add the export button to the header**

Find the dashboard header area and add:
```tsx
<button
  type="button"
  onClick={handleExport}
  disabled={exporting || loading}
  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-50"
  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
>
  <Download size={14} />
  {exporting ? "Exporting..." : "Export PDF"}
</button>
```

- [ ] **Step 5: Build and verify**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/workspace/projects/[projectId]/dashboard/ProjectDashboard.tsx
git commit -m "feat: add PDF export button to project dashboard"
```

---

## Feature D: Team List/Tree Toggle

### Task D1: Add Tree View to Collaborators Panel

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/CollaboratorsPanel.tsx`

- [ ] **Step 1: Read the full CollaboratorsPanel.tsx file**

Understand the existing list layout, the member type, and how data is fetched.

- [ ] **Step 2: Add a view toggle state**

```typescript
const [viewMode, setViewMode] = useState<"list" | "tree">("list");
```

- [ ] **Step 3: Add toggle buttons to the header**

```tsx
<div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
  <button
    type="button"
    onClick={() => setViewMode("list")}
    className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
    style={{
      background: viewMode === "list" ? "var(--surface-2)" : "transparent",
      color: viewMode === "list" ? "var(--text-1)" : "var(--text-muted)",
    }}
  >
    List
  </button>
  <button
    type="button"
    onClick={() => setViewMode("tree")}
    className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
    style={{
      background: viewMode === "tree" ? "var(--surface-2)" : "transparent",
      color: viewMode === "tree" ? "var(--text-1)" : "var(--text-muted)",
    }}
  >
    Tree
  </button>
</div>
```

- [ ] **Step 4: Create the tree view**

The tree view groups members by their `projectRole`:
- `owner` at root
- `editor` at second level
- `viewer` at third level

```tsx
{viewMode === "tree" && (
  <div className="space-y-1">
    {["owner", "editor", "viewer"].map((role) => {
      const roleMembers = members.filter((m) => m.projectRole === role);
      if (roleMembers.length === 0) return null;
      return (
        <div key={role}>
          <p
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-disabled)" }}
          >
            {role === "owner" ? "Owners" : role === "editor" ? "Editors" : "Viewers"}
          </p>
          {roleMembers.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
              style={{ marginLeft: role === "editor" ? "16px" : role === "viewer" ? "32px" : "0" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                style={{ background: "var(--brand-soft, #e2d6fc)", color: "var(--brand)" }}
              >
                {member.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                  {member.name}
                </p>
                <p className="text-[11px] truncate" style={{ color: "var(--text-disabled)" }}>
                  {member.email}
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 5: Wrap existing list view in viewMode check**

```tsx
{viewMode === "list" && (
  // ... existing list render ...
)}
```

- [ ] **Step 6: Add click-to-detail behaviour**

When clicking a team member, show a detail panel to the right (or below on mobile) with:
- Name, email, role
- Option to send a message (opens Larry chat with pre-filled mention)

Use a `selectedMemberId` state and conditionally render the detail.

- [ ] **Step 7: Build and verify**

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/workspace/projects/[projectId]/CollaboratorsPanel.tsx
git commit -m "feat: add list/tree view toggle to team panel with role-based hierarchy"
```

---

## Final Verification

- [ ] **Step 1:** Run full build: `cd apps/web && npx next build`
- [ ] **Step 2:** Verify all 4 features are accessible from the UI:
  - New project → 4th "Start from a document" option
  - Action centre → email draft cards (if drafts exist)
  - Project dashboard → "Export PDF" button
  - Project → Team tab → List/Tree toggle
- [ ] **Step 3:** Final commit with any fixes
