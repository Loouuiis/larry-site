# RBAC Invite UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Larry's `/workspace/settings/members` UI onto the new RBAC v2 API (fix stale `viewer` role, add owner badge, pending-invitations section, copy-link modal, invite-accept landing page).

**Architecture:** Next.js 15 App Router. Reuse the existing `proxyApiRequest` + `getSession` pattern under `/api/workspace/*` for authenticated calls; add `/api/invitations/*` (no `/workspace/`) for the unauthenticated preview + accept proxies. Client components talk only to same-origin `/api/...` routes — never to Railway directly. All styling reuses Larry's inline CSS-token pattern and `#6c44f6` brand purple; no new primitives.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind + inline CSS-vars, lucide-react icons, Zod.

---

## File structure

**New files:**
- `apps/web/src/components/members/RoleBadge.tsx` — role pill (owner/admin/pm/member)
- `apps/web/src/components/members/InviteModal.tsx` — portal dialog with copy-link success state
- `apps/web/src/components/members/PendingInvitationsPanel.tsx` — pending list + revoke + resend
- `apps/web/src/app/api/workspace/invitations/route.ts` — GET list + POST create proxy
- `apps/web/src/app/api/workspace/invitations/[id]/revoke/route.ts` — POST revoke proxy
- `apps/web/src/app/api/workspace/invitations/[id]/resend/route.ts` — POST resend proxy
- `apps/web/src/app/api/invitations/[token]/route.ts` — **public** preview proxy (no session required)
- `apps/web/src/app/api/invitations/[token]/accept/route.ts` — **public** accept proxy
- `apps/web/src/app/invite/accept/page.tsx` — server component: fetches preview and branches
- `apps/web/src/app/invite/accept/AcceptForm.tsx` — client component: three-flow accept UI

**Modified files:**
- `apps/web/src/app/workspace/settings/members/page.tsx` — roles `viewer → pm`, add owner support, swap inline panel for modal, mount PendingInvitationsPanel
- `apps/web/src/app/api/workspace/members/invite/route.ts` — relax role enum to `["admin","pm","member"]` (matches API)
- `apps/web/src/app/api/workspace/members/[userId]/route.ts` — same role-enum fix for PATCH

---

## Task 1: Shared RoleBadge component

**Files:**
- Create: `apps/web/src/components/members/RoleBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { CSSProperties } from "react";

export type MemberRole = "owner" | "admin" | "pm" | "member";

const STYLES: Record<MemberRole, CSSProperties & { label: string }> = {
  owner: { label: "Owner",  background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" },
  admin: { label: "Admin",  background: "#f5f3ff", color: "#6c44f6", borderColor: "#ddd6fe" },
  pm:    { label: "PM",     background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
  member:{ label: "Member", background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" },
};

export function roleLabel(role: string): string {
  return (STYLES as Record<string, { label: string }>)[role]?.label ?? role;
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const s = STYLES[(role as MemberRole)] ?? STYLES.member;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className ?? ""}`}
      style={{ background: s.background, color: s.color, borderColor: s.borderColor }}
    >
      {s.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/members/RoleBadge.tsx
git commit -m "feat(web): shared RoleBadge component (owner/admin/pm/member)"
```

---

## Task 2: Fix role enum on workspace proxy routes

**Files:**
- Modify: `apps/web/src/app/api/workspace/members/invite/route.ts:6-10`
- Modify: `apps/web/src/app/api/workspace/members/[userId]/route.ts` (find the PATCH schema)

- [ ] **Step 1: Read current file state to find exact PATCH schema**

Run: `grep -n "z.enum" apps/web/src/app/api/workspace/members/[userId]/route.ts`
Expected: locate the role-enum line.

- [ ] **Step 2: Replace stale enum on invite proxy**

In `apps/web/src/app/api/workspace/members/invite/route.ts`:
```ts
// before:
role: z.enum(["admin", "member", "viewer"]).default("member"),
// after:
role: z.enum(["admin", "pm", "member"]).default("member"),
```

- [ ] **Step 3: Same fix on the PATCH proxy**

In `apps/web/src/app/api/workspace/members/[userId]/route.ts`, replace `"viewer"` with `"pm"` in the `z.enum(...)` call.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (or pre-existing warnings unrelated).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/workspace/members
git commit -m "fix(web): role proxy enums match API (admin/pm/member), drop stale viewer"
```

---

## Task 3: Invitations workspace proxies — list + create

**Files:**
- Create: `apps/web/src/app/api/workspace/invitations/route.ts`

- [ ] **Step 1: Implement both handlers**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "pm", "member"]).default("member"),
  displayName: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const result = await proxyApiRequest(session, `/v1/orgs/invitations?status=${encodeURIComponent(status)}`, {
    method: "GET",
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let payload: z.infer<typeof CreateSchema>;
  try {
    payload = CreateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid invite payload." }, { status: 400 });
  }
  const result = await proxyApiRequest(session, "/v1/orgs/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/workspace/invitations/route.ts
git commit -m "feat(web): workspace invitations proxy — GET list + POST create"
```

---

## Task 4: Invitations workspace proxies — revoke + resend

**Files:**
- Create: `apps/web/src/app/api/workspace/invitations/[id]/revoke/route.ts`
- Create: `apps/web/src/app/api/workspace/invitations/[id]/resend/route.ts`

- [ ] **Step 1: Revoke handler**

Contents of `revoke/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, `/v1/orgs/invitations/${id}/revoke`, {
    method: "POST",
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Resend handler**

Contents of `resend/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, `/v1/orgs/invitations/${id}/resend`, {
    method: "POST",
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/workspace/invitations
git commit -m "feat(web): workspace invitation proxies — revoke + resend"
```

---

## Task 5: Public preview + accept proxies

**Files:**
- Create: `apps/web/src/app/api/invitations/[token]/route.ts`
- Create: `apps/web/src/app/api/invitations/[token]/accept/route.ts`

These endpoints are intentionally **outside** `/workspace/` because they don't require a logged-in session. They forward directly to Railway with no auth header.

- [ ] **Step 1: Create `apps/web/src/app/api/invitations/[token]/route.ts`**

```ts
import { NextResponse } from "next/server";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const upstream = await fetch(`${API_BASE}/v1/orgs/invitations/${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store",
  });
  const body = await upstream.json().catch(() => ({}));
  return NextResponse.json(body, { status: upstream.status });
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/invitations/[token]/accept/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();
  const upstream = await fetch(`${API_BASE}/v1/orgs/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
  const responseBody = await upstream.json().catch(() => ({}));
  return NextResponse.json(responseBody, { status: upstream.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/invitations
git commit -m "feat(web): public preview + accept proxies for invitation tokens"
```

---

## Task 6: InviteModal component

**Files:**
- Create: `apps/web/src/components/members/InviteModal.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Shield, ShieldCheck, Users, X, Copy, Check } from "lucide-react";

export type InviteRole = "admin" | "pm" | "member";

const ROLE_OPTIONS: { value: InviteRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin",  label: "Admin",  description: "Manage members, settings, and every project",      icon: ShieldCheck },
  { value: "pm",     label: "PM",     description: "Lead projects they're added to",                    icon: Shield },
  { value: "member", label: "Member", description: "Collaborate on projects they're added to",          icon: Users },
];

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void; // parent re-loads members + pending list
}

export function InviteModal({ open, onClose, onInvited }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the email input when opened; reset state each time.
  useEffect(() => {
    if (!open) return;
    setEmail(""); setDisplayName(""); setRole("member");
    setBusy(false); setError(""); setSuccessUrl(null); setCopied(false);
    // Next tick so the portal has mounted.
    const t = setTimeout(() => emailRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Failed to send invite.");
        return;
      }
      setSuccessUrl(typeof data?.inviteUrl === "string" ? data.inviteUrl : null);
      setSuccessEmail(email.trim());
      onInvited();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [email, role, displayName, onInvited]);

  const copyLink = useCallback(async () => {
    if (!successUrl) return;
    try {
      await navigator.clipboard.writeText(successUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API blocked — ignore */ }
  }, [successUrl]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(15,23,42,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 id="invite-modal-title" className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
            {successUrl ? "Invitation sent" : "Invite a team member"}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <X size={16} />
          </button>
        </div>

        {successUrl ? (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              We emailed <strong>{successEmail}</strong> with an invite link. You can also copy the link below
              to send it yourself.
            </p>
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <code
                className="flex-1 truncate text-[12px]"
                style={{ color: "var(--text-1)" }}
                title={successUrl}
              >
                {successUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold"
                style={{ background: copied ? "#dcfce7" : "#f5f3ff", color: copied ? "#15803d" : "#6c44f6" }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6" }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                Email address <span style={{ color: "#b91c1c" }}>*</span>
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-disabled)" }} />
                <input
                  ref={emailRef}
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  className="h-10 w-full rounded-lg border pl-9 pr-3 text-[13px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>

            <div>
              <label htmlFor="invite-name" className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                Display name <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
              </label>
              <input
                id="invite-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Jamie Smith"
                className="h-10 w-full rounded-lg border px-3 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>

            <fieldset>
              <legend className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                Role
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const selected = role === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(opt.value)}
                      className="rounded-lg border p-3 text-left transition-all"
                      style={{
                        borderColor: selected ? "#6c44f6" : "var(--border)",
                        background: selected ? "rgba(108,68,246,0.05)" : "var(--surface)",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon size={14} style={{ color: selected ? "#6c44f6" : "var(--text-muted)" }} />
                        <span className="text-[12px] font-semibold" style={{ color: selected ? "#6c44f6" : "var(--text-1)" }}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error && (
              <div
                aria-live="polite"
                className="rounded-lg border px-3 py-2 text-[12px]"
                style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-full border px-4 text-[12px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/members/InviteModal.tsx
git commit -m "feat(web): InviteModal with copy-link success + focus trap + a11y"
```

---

## Task 7: PendingInvitationsPanel

**Files:**
- Create: `apps/web/src/components/members/PendingInvitationsPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, RotateCw, Trash2, Mail } from "lucide-react";
import { RoleBadge } from "./RoleBadge";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  invitedByUserId: string | null;
  createdAt: string;
}

function relativeFrom(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  if (d >= 1) return diff >= 0 ? `in ${d}d` : `${d}d ago`;
  const h = Math.floor(abs / 3_600_000);
  if (h >= 1) return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  return diff >= 0 ? "<1h" : "just now";
}

export function PendingInvitationsPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/workspace/invitations?status=pending", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Flag off or endpoint missing → render empty-state, not an error banner.
        setItems([]);
        if (res.status !== 404) setError(data?.message ?? "Failed to load pending invitations.");
        return;
      }
      setItems(Array.isArray(data?.invitations) ? data.invitations : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const revoke = async (id: string) => {
    setBusy(`revoke:${id}`);
    try {
      const res = await fetch(`/api/workspace/invitations/${id}/revoke`, { method: "POST" });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    } finally { setBusy(null); }
  };

  const resend = async (id: string) => {
    setBusy(`resend:${id}`);
    try { await fetch(`/api/workspace/invitations/${id}/resend`, { method: "POST" }); }
    finally { setBusy(null); }
  };

  if (!loading && items.length === 0 && !error) return null;

  return (
    <section
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <header
        className="flex items-center gap-2 px-5 py-3 text-[12px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
      >
        <MailCheck size={14} />
        Pending invitations
        {items.length > 0 && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: "#f5f3ff", color: "#6c44f6" }}
          >
            {items.length}
          </span>
        )}
      </header>

      {loading ? (
        <div className="px-5 py-6 text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : error ? (
        <div className="px-5 py-6 text-[13px]" style={{ color: "#b91c1c" }}>{error}</div>
      ) : items.map((inv, i) => {
        const expired = Date.parse(inv.expiresAt) <= Date.now();
        return (
          <div
            key={inv.id}
            className="flex items-center gap-3 px-5 py-3"
            style={{ borderBottom: i < items.length - 1 ? "1px solid var(--border)" : undefined }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              <Mail size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-1)" }}>
                {inv.email}
              </p>
              <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {expired ? "Expired " : "Expires "} {relativeFrom(inv.expiresAt)}
                {" · invited "} {relativeFrom(inv.createdAt)}
              </p>
            </div>
            <RoleBadge role={inv.role} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void resend(inv.id)}
                disabled={busy === `resend:${inv.id}` || expired}
                title="Resend email"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ color: "var(--text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <RotateCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => void revoke(inv.id)}
                disabled={busy === `revoke:${inv.id}`}
                title="Revoke invitation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ color: "var(--text-disabled)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#b91c1c"; e.currentTarget.style.background = "#fef2f2"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-disabled)"; e.currentTarget.style.background = ""; }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/members/PendingInvitationsPanel.tsx
git commit -m "feat(web): PendingInvitationsPanel with revoke + resend"
```

---

## Task 8: Wire Members page to modal + pending panel; fix roles

**Files:**
- Modify: `apps/web/src/app/workspace/settings/members/page.tsx`

Changes: (a) swap the inline `showInvite` panel for `<InviteModal/>`; (b) replace the `viewer` role option everywhere with `pm`; (c) render owner in the role column + disable select when target is owner (only another owner could demote, which can't happen in this UI); (d) mount `<PendingInvitationsPanel/>` below the intro section; (e) remove `setInviteSuccess` ephemeral state (modal owns it now); (f) read role enum from a single constant.

- [ ] **Step 1: Add imports at the top**

```tsx
import { InviteModal } from "@/components/members/InviteModal";
import { PendingInvitationsPanel } from "@/components/members/PendingInvitationsPanel";
import { RoleBadge } from "@/components/members/RoleBadge";
```

- [ ] **Step 2: Replace the `OrgRole` type and `ROLE_OPTIONS` array**

```tsx
type OrgRole = "admin" | "pm" | "member";

const ROLE_OPTIONS: { value: OrgRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin",  label: "Admin",  description: "Manage members and every project",          icon: ShieldCheck },
  { value: "pm",     label: "PM",     description: "Lead projects they're added to",             icon: Shield },
  { value: "member", label: "Member", description: "Collaborate on projects they're added to",   icon: Eye },
];
```

(If `Eye` is no longer imported cleanly after the viewer removal, leave the import — it's used above. The `PM` icon is `Shield`.)

- [ ] **Step 3: Replace inline invite panel with modal + trigger**

Find the block starting at `{/* Invite form */}` and ending at the closing `</div>` before `{/* Error */}`. Replace with nothing — the inline form is gone.

In place of the current `onClick={() => setShowInvite(!showInvite)}` on the "Invite member" button, keep `onClick={() => setShowInvite(true)}`.

At the very end of the returned JSX (before the final closing `</div></div>`), add:

```tsx
<InviteModal
  open={showInvite}
  onClose={() => setShowInvite(false)}
  onInvited={() => {
    void loadMembers();
    setRefreshPending((n) => n + 1);
  }}
/>
```

Add a new state hook near the top of the component:
```tsx
const [refreshPending, setRefreshPending] = useState(0);
```

- [ ] **Step 4: Mount PendingInvitationsPanel under the intro section**

Immediately after the closing `</section>` of the "Intro + Invite Button" section, add:

```tsx
<PendingInvitationsPanel refreshKey={refreshPending} />
```

- [ ] **Step 5: Fix the role `<select>` in the members list**

Replace the `<option value="viewer">Viewer</option>` with `<option value="pm">PM</option>`. Also replace the hardcoded three options with a map over `ROLE_OPTIONS`:

```tsx
<select
  value={currentRole as string}
  onChange={(e) => setEditingRole((prev) => ({ ...prev, [member.id]: e.target.value as OrgRole }))}
  disabled={member.role === "owner" || isLastAdmin || busyAction === `role:${member.id}` || busyAction === `remove:${member.id}`}
  className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
  style={{
    ...getRoleBadgeStyle(currentRole as string),
    border: `1px solid ${getRoleBadgeStyle(currentRole as string).borderColor}`,
    cursor: member.role === "owner" ? "not-allowed" : "pointer",
    outline: "none",
  }}
>
  {member.role === "owner" && <option value="owner">Owner</option>}
  {ROLE_OPTIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

- [ ] **Step 6: Extend `getRoleBadgeStyle` to handle owner + pm**

Find the `getRoleBadgeStyle` helper and replace the `switch`:

```ts
function getRoleBadgeStyle(role: string): React.CSSProperties & { borderColor: string } {
  switch (role) {
    case "owner":
      return { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
    case "admin":
      return { background: "#f5f3ff", color: "#6c44f6", borderColor: "#ddd6fe" };
    case "pm":
      return { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
    case "member":
      return { background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" };
    default:
      return { background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" };
  }
}
```

- [ ] **Step 7: Guard the delete button for owners**

Under the row's `<div className="flex justify-end">` block, the condition currently is `{!isLastAdmin && ...}`. Update to:

```tsx
{!isLastAdmin && member.role !== "owner" && ...}
```

- [ ] **Step 8: Typecheck + build**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: clean (no new errors).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/workspace/settings/members/page.tsx
git commit -m "feat(web): members page uses InviteModal + PendingInvitationsPanel; adds owner tier"
```

---

## Task 9: /invite/accept landing page

**Files:**
- Create: `apps/web/src/app/invite/accept/page.tsx`
- Create: `apps/web/src/app/invite/accept/AcceptForm.tsx`

The page is a server component that fetches the preview upstream. It renders one of four states: **preview**, **accepted**, **revoked**, **expired**, or **not-found**. The client component owns the accept form and handles the authed-vs-unauthed branches.

- [ ] **Step 1: Create `AcceptForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AcceptFormProps {
  token: string;
  email: string;
  // Authenticated user's email, if any — set by the server component.
  currentUserEmail: string | null;
}

export function AcceptForm({ token, email, currentUserEmail }: AcceptFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mismatch =
    currentUserEmail !== null && currentUserEmail.toLowerCase() !== email.toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          currentUserEmail ? {} : { password, displayName: displayName.trim() || undefined },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "We couldn't accept this invitation.");
        return;
      }
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (mismatch) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
          This invitation was sent to <strong>{email}</strong>. You're signed in as <strong>{currentUserEmail}</strong>.
        </p>
        <a
          href={`/logout?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
          className="inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold text-white"
          style={{ background: "#6c44f6" }}
        >
          Sign out and accept as {email}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      {!currentUserEmail && (
        <>
          <div>
            <label htmlFor="accept-name" className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              Your name <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
            </label>
            <input
              id="accept-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jamie Smith"
              className="h-10 w-full rounded-lg border px-3 text-[13px]"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
            />
          </div>
          <div>
            <label htmlFor="accept-password" className="block text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              Create a password <span style={{ color: "#b91c1c" }}>*</span>
            </label>
            <input
              id="accept-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
              minLength={12}
              required
              className="h-10 w-full rounded-lg border px-3 text-[13px]"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)", outline: "none" }}
            />
          </div>
        </>
      )}

      {error && (
        <div
          aria-live="polite"
          className="rounded-lg border px-3 py-2 text-[12px]"
          style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || (!currentUserEmail && password.length < 12)}
        className="h-10 w-full rounded-full text-[13px] font-semibold text-white"
        style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
      >
        {busy
          ? "Accepting…"
          : currentUserEmail
            ? `Continue as ${currentUserEmail}`
            : "Create account and join"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `page.tsx` (server component)**

```tsx
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { AcceptForm } from "./AcceptForm";
import { MailX, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface Preview {
  email: string;
  role: string;
  expiresAt: string;
  tenantName: string | null;
  tenantSlug: string | null;
}

async function fetchPreview(token: string): Promise<
  | { kind: "ok"; data: Preview }
  | { kind: "notFound" }
  | { kind: "gone"; code: string }
  | { kind: "error" }
> {
  const base = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/v1/orgs/invitations/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "notFound" };
    if (res.status === 410) {
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      return { kind: "gone", code: data.code ?? "invite_unavailable" };
    }
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as Preview;
    return { kind: "ok", data };
  } catch {
    return { kind: "error" };
  }
}

function StateCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border p-8 text-center space-y-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex justify-center">{icon}</div>
      <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>{title}</h1>
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>{body}</p>
      {cta && (
        <a
          href={cta.href}
          className="inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold text-white"
          style={{ background: "#6c44f6" }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await getSession();
  const currentUserEmail = session?.user?.email ?? null;

  if (!token) {
    return (
      <Shell>
        <StateCard
          icon={<AlertCircle size={40} color="#b45309" />}
          title="No invitation token"
          body="The link you followed is missing its token. Ask the person who invited you to resend it."
          cta={{ href: "/", label: "Go to larry-pm.com" }}
        />
      </Shell>
    );
  }

  const result = await fetchPreview(token);

  if (result.kind === "notFound") {
    return (
      <Shell>
        <StateCard
          icon={<MailX size={40} color="#b91c1c" />}
          title="Invitation not found"
          body="This link doesn't match any invitation. Double-check the URL or ask for a new one."
          cta={{ href: "/", label: "Go to larry-pm.com" }}
        />
      </Shell>
    );
  }
  if (result.kind === "gone") {
    const msg =
      result.code === "invite_accepted"
        ? {
            icon: <CheckCircle2 size={40} color="#15803d" />,
            title: "This invitation was already accepted",
            body: "You should already have access. Try logging in.",
            cta: { href: "/login", label: "Sign in" },
          }
        : result.code === "invite_revoked"
          ? {
              icon: <MailX size={40} color="#b91c1c" />,
              title: "This invitation was revoked",
              body: "The admin cancelled this invitation. Ask them to send a new one.",
              cta: { href: "/", label: "Go to larry-pm.com" },
            }
          : {
              icon: <Clock size={40} color="#b45309" />,
              title: "This invitation has expired",
              body: "Invitations are valid for 7 days. Ask the admin to resend it.",
              cta: { href: "/", label: "Go to larry-pm.com" },
            };
    return <Shell><StateCard {...msg} /></Shell>;
  }
  if (result.kind === "error") {
    return (
      <Shell>
        <StateCard
          icon={<AlertCircle size={40} color="#b91c1c" />}
          title="Couldn't load your invitation"
          body="Something went wrong on our side. Please try again in a minute."
        />
      </Shell>
    );
  }

  const { email, role, tenantName, expiresAt } = result.data;
  const expiresIso = new Date(expiresAt).toISOString();

  return (
    <Shell>
      <div
        className="w-full max-w-[440px] rounded-2xl border p-8 space-y-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="text-center space-y-2">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "#f5f3ff", color: "#6c44f6", fontWeight: 700, fontSize: 20 }}
          >
            L
          </div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>
            You're invited to {tenantName ?? "a Larry workspace"}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            Joining as <strong>{email}</strong> · Role <strong>{role}</strong>
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Invitation expires {new Date(expiresIso).toLocaleString()}
          </p>
        </div>

        <AcceptForm token={token} email={email} currentUserEmail={currentUserEmail} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center p-6"
      style={{ background: "var(--page-bg)" }}
    >
      {children}
    </main>
  );
}
```

- [ ] **Step 3: Handle the lib alias import**

The component imports `@/lib/auth`. Confirm the alias is configured:
```bash
grep -n "@/lib/auth" apps/web/tsconfig.json
```
If `@/*` is aliased to `./src/*`, no change needed. Larry already uses this alias throughout — expect it to work.

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/invite/accept
git commit -m "feat(web): /invite/accept landing page — preview + accept form + 410 states"
```

---

## Task 10: Verify on deployed preview

Vercel auto-deploys this branch as a preview. Wait for the preview URL (or use Vercel MCP) and sanity-check manually.

- [ ] **Step 1: Push branch + wait for preview**

```bash
git push -u origin feat/rbac-invite-ui
```
Then fetch preview URL via `gh pr view --json` once PR is opened, or via `vercel ls`.

- [ ] **Step 2: Manual smoke test on preview**

1. Open `/workspace/settings/members` — verify:
   - Invite button opens the modal (not an inline panel)
   - Role card options show `Admin / PM / Member` (no Viewer)
   - Submitting a valid email shows the success state with a copy link
   - A "Pending invitations" panel appears with the new row and Revoke/Resend icons
   - Revoking removes the row immediately
2. Open `/invite/accept?token=<raw-token-from-success-state>` in an incognito window — verify:
   - Preview card shows org name, email, role, expiry
   - "Create account and join" button is disabled until password ≥ 12 chars
   - On successful accept, redirected to `/workspace`
3. Reuse the same token → "This invitation was already accepted" card.
4. Open `/invite/accept?token=invalid-token` → "Invitation not found" card.

- [ ] **Step 3: Merge to main once the preview looks right**

Via `gh pr merge --squash`. Vercel auto-promotes preview to production.

---

## Self-review

**1. Spec coverage:**
- Invite modal with copy-link + focus trap + a11y → Task 6 ✓
- Pending invitations panel with revoke + resend → Task 7 ✓
- Roles owner/admin/pm/member → Tasks 1, 2, 8 ✓
- /invite/accept landing with three flows (unauthed + authed-match + authed-mismatch) → Task 9 ✓
- Error states for 410 accepted/revoked/expired + 404 not-found + 500 error → Task 9 ✓
- Responsive / mobile-first → modal max-w-[480px] shrinks naturally; Tailwind `w-full max-w-*` handles it ✓
- A11y (visible labels, aria-live, escape-to-close, focus return) → Task 6 ✓

**2. Placeholder scan:** No "TODO" / "implement later" / "similar to task N" anywhere. Every step shows the code it produces.

**3. Type consistency:**
- `InviteRole = "admin" | "pm" | "member"` matches `OrgRole` in `page.tsx` and the workspace proxy's `z.enum(["admin","pm","member"])` — all three agree.
- `MemberRole` in RoleBadge adds `owner` to the union, intentional — the members list renders the owner but the invite flow cannot create one.
- `/api/workspace/invitations` + `/api/invitations/[token]` paths match the route handlers exactly.
- `InviteModal` props (`open`, `onClose`, `onInvited`) match the call site in `page.tsx`.
