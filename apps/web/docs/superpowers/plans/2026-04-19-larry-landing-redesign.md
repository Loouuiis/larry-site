# Larry Landing Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the larry-pm.com landing page as "The Statement" (Direction C) — Inter-typed hero with a kinetic keyword, a 12-second animated execution timeline as the hero centerpiece, a 5-box Mission section, hover-reveal comparison cards, plus new `/pricing` and `/careers` pages and a Book-an-intro modal that emails `anna.wigrena@gmail.com`.

**Architecture:** Next.js 16 App Router, React 19, Tailwind 4, Framer Motion 12. Preserves the existing design tokens and premium easing; replaces Plus Jakarta Sans with Inter; introduces one new easing/animation (`strokeDraw`); adds 8 new files, modifies 13 existing.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 (inline theme), Framer Motion 12, Lucide React icons, Resend 6 (existing integration), Zod 4, React Query 5, Redis rate-limit (existing util).

**Spec reference:** `apps/web/docs/superpowers/specs/2026-04-19-larry-landing-redesign-design.md`

---

## Prerequisites & Context

- Working directory: `C:\Dev\larry\site-deploys\larry-site`
- Web app root: `apps/web/`
- Run dev server: `npm run dev` (from `apps/web/` or repo root — monorepo workspaces)
- Run type check: `npm run typecheck` (or `tsc --noEmit` from `apps/web/`)
- Run tests: `npm run test` (Vitest) — from `apps/web/`
- Run lint: `npm run lint`
- User preference: **final verification must happen on a Vercel preview deploy, not just local dev.** See the `feedback-verify-on-production` memory and Task 25.

Existing patterns to mirror:
- **Email endpoint**: `apps/web/src/app/api/founder-contact/route.ts` — the Resend + rate-limit pattern. `/api/intro` follows this structure exactly.
- **Form component**: `apps/web/src/components/ui/WaitlistForm.tsx` — the Zod + status-machine pattern. `<IntroForm>` follows this structure exactly.
- **Overlay integration**: `apps/web/src/components/ui/LiquidOverlay.tsx` and `OverlayManager.tsx` — the existing overlay plumbing. `"intro"` is added as a new overlay type alongside `"waitlist"` and `"founders"`.

---

## File Structure

### New Files (8)

| Path | Purpose |
|---|---|
| `apps/web/src/components/ui/ExecutionTimeline.tsx` | Animated Gantt-style hero centerpiece (12s loop) |
| `apps/web/src/components/ui/ExecutionTimeline.data.ts` | Lane/task/notification choreography data |
| `apps/web/src/components/ui/IntroForm.tsx` | Book-an-intro form rendered inside `<LiquidOverlay>` |
| `apps/web/src/components/ui/LarrySeal.tsx` | Typographic SVG coin seal ("LARRY · EST. 2024") |
| `apps/web/src/components/sections/MissionSection.tsx` | 5-card mission row ("What Larry Does") |
| `apps/web/src/components/sections/ComparisonSection.tsx` | With/Without Larry cards with hover-reveal overlays |
| `apps/web/src/app/pricing/page.tsx` | `/pricing` route |
| `apps/web/src/app/careers/page.tsx` | `/careers` route |
| `apps/web/src/app/api/intro/route.ts` | POST endpoint → Resend → `anna.wigrena@gmail.com` |
| `apps/web/src/app/api/intro/route.test.ts` | Unit tests for the intro endpoint |

### Modified Files (13)

| Path | Nature of change |
|---|---|
| `apps/web/src/app/page.tsx` | Update section imports and order |
| `apps/web/src/app/layout.tsx` | Swap Plus Jakarta Sans → Inter; move `<OverlayManager>` here |
| `apps/web/src/app/globals.css` | Rename `--font-plus-jakarta` → `--font-inter`; landing-page body bg override |
| `apps/web/src/components/layout/Navbar.tsx` | New links + three-item right cluster |
| `apps/web/src/components/layout/Footer.tsx` | Product-links column update |
| `apps/web/src/components/ui/WelcomeSplash.tsx` | Text: `welcome` → `Larry` |
| `apps/web/src/components/ui/LiquidOverlay.tsx` | Add `"intro"` to `OverlayType` union |
| `apps/web/src/components/ui/OverlayManager.tsx` | Route `"intro"` → `<IntroForm>` |
| `apps/web/src/components/sections/HeroSection.tsx` | Headline rewrite, `strokeDraw`, replace mockup with `<ExecutionTimeline>` |
| `apps/web/src/components/sections/LogoBar.tsx` | Industry list copy change |
| `apps/web/src/components/sections/FeaturesSection.tsx` | H2 + 4 step copy updates |
| `apps/web/src/components/sections/WhoItsForSection.tsx` | Simplify to 6 role cards + industries sub-section |
| `apps/web/src/components/sections/CTASection.tsx` | Secondary CTA: `Speak to the Founders` → `Book an intro` |

### Files Left in Place (Unchanged)

`UseCasesSection.tsx` stays in the repo (unimported) — delete in a follow-up once the new pages are verified.
`FounderContact.tsx`, `TemplatesSection.tsx`, `VibeSection.tsx`, `ROISection.tsx`, `ClientLogos.tsx`, `LogoCarousel.tsx`, `ROICalculator.tsx`, `AmbientFeed.tsx`, `LiquidBackground.tsx` — unchanged.

---

## Phase 1 — Foundation

### Task 1: Install Inter font and remove Plus Jakarta Sans

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Read the current layout.tsx to see the font setup**

Run: Read `apps/web/src/app/layout.tsx`
Identify the `next/font/google` imports and the CSS-var names currently applied to `<body>`.

- [ ] **Step 2: Replace Plus Jakarta Sans import with Inter**

In `layout.tsx`:

```tsx
import { Inter, Geist } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  weight: ["300"],
  variable: "--font-geist-sans",
  display: "swap",
});
```

Remove the `Plus_Jakarta_Sans` import entirely.

- [ ] **Step 3: Update the `<body>` className**

Replace the existing className that combines the three font variables with:

```tsx
<body
  className={`${inter.variable} ${geistSans.variable} antialiased`}
  suppressHydrationWarning
>
```

- [ ] **Step 4: Update globals.css `--font-sans` mapping**

In `apps/web/src/app/globals.css`, find the `@theme inline` block (Tailwind v4 theme). Change:

```css
--font-sans: var(--font-plus-jakarta);
```

to:

```css
--font-sans: var(--font-inter);
```

Remove any `--font-plus-jakarta` references anywhere in the file.

- [ ] **Step 5: Verify build**

Run: `npm run typecheck` from `apps/web/`
Expected: 0 type errors.

Run: `npm run dev` from `apps/web/`. Open `http://localhost:3000`. Verify the page still renders (fonts will shift to Inter).
Expected: no runtime errors; visual body text is now Inter.

- [ ] **Step 6: Commit**

```bash
cd C:\Dev\larry\site-deploys\larry-site
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "refactor(web): swap body font Plus Jakarta Sans → Inter"
```

---

### Task 2: Change welcome splash text "welcome" → "Larry"

**Files:**
- Modify: `apps/web/src/components/ui/WelcomeSplash.tsx`

- [ ] **Step 1: Locate the displayed string**

Run: Grep for `welcome` in `WelcomeSplash.tsx`.
Expected: one text node rendering the lowercased word.

- [ ] **Step 2: Replace the text**

Change the rendered text from `welcome` to `Larry`.
Keep the Geist Sans font, `weight: 300`, `letterSpacing: 0.45em`, color `#8b5cf6`, `fontSize: clamp(1.75rem, 4vw, 3.5rem)`. These stay exactly as they are.

- [ ] **Step 3: Visual check**

Run `npm run dev`. Hard-refresh `http://localhost:3000` (or open a new private window — the splash only shows once per session via localStorage or similar; check the component for how it decides).
Expected: `Larry` (capital L) displays for 2s in brand purple, fades out over 1s.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/WelcomeSplash.tsx
git commit -m "feat(web): welcome splash reads 'Larry' instead of 'welcome'"
```

---

### Task 3: Landing page body background — pure white override

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add a landing-only class selector to globals.css**

Append near the end of `globals.css`:

```css
/* Landing-page-only body background override.
   Interior app pages continue to use --page-bg (#f2f3ff). */
body.landing-root {
  background: #ffffff;
}
```

- [ ] **Step 2: Create `LandingRoot` client wrapper (always)**

Create `apps/web/src/components/layout/LandingRoot.tsx`:

```tsx
"use client";
import { useEffect } from "react";

export function LandingRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("landing-root");
    return () => document.body.classList.remove("landing-root");
  }, []);
  return <>{children}</>;
}
```

Using a small wrapper component keeps `page.tsx` able to stay as a server component (Next.js 16 App Router default) while the body-class toggle happens in a client effect. Task 24 wires this wrapper around the main landing sections.

- [ ] **Step 2b: (Do NOT modify `page.tsx` yet)**

`page.tsx` is updated holistically in Task 24 once all sections are in place. This task only establishes the wrapper and the CSS override.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: clean. (Visual verification deferred to Task 24, once the wrapper is actually used.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/components/layout/LandingRoot.tsx
git commit -m "feat(web): add LandingRoot wrapper + white body override for landing"
```

---

### Task 4: Add the `strokeDraw` animation utility

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add a CSS utility for the strokeDraw animation**

Append to `globals.css`:

```css
/* strokeDraw — purple underline that draws itself left-to-right.
   Used on the hero keyword and on interactive icon rings.
   Respects prefers-reduced-motion. */
.stroke-draw {
  position: relative;
  display: inline-block;
}
.stroke-draw::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.08em;
  height: 3px;
  width: 100%;
  background: #6c44f6;
  border-radius: 2px;
  transform: scaleX(0);
  transform-origin: left center;
  animation: strokeDraw 800ms cubic-bezier(0.22, 1, 0.36, 1) 600ms forwards;
  will-change: transform;
}
@keyframes strokeDraw {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  .stroke-draw::after {
    animation: none;
    transform: scaleX(1);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean. No test for this utility yet — it's exercised by the hero (Task 14).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add strokeDraw keyframe for hero keyword underline"
```

---

## Phase 2 — Book-an-intro infrastructure (backend-first)

### Task 5: `/api/intro` route with unit tests

**Files:**
- Create: `apps/web/src/app/api/intro/route.ts`
- Create: `apps/web/src/app/api/intro/route.test.ts`
- Reference: `apps/web/src/app/api/founder-contact/route.ts` (pattern source)

- [ ] **Step 1: Read the founder-contact route to copy the pattern**

Run: Read `apps/web/src/app/api/founder-contact/route.ts`
Note: the Zod schema shape, the rate-limit helper import path, the Resend client import, the `from:` address, the HTML email template structure.

- [ ] **Step 2: Write the test file first**

Create `apps/web/src/app/api/intro/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend before importing the route
const mockSend = vi.fn().mockResolvedValue({ data: { id: "test-id" }, error: null });
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: mockSend } })),
}));

// Mock the rate-limit helper (pick the same module path the founder-contact route imports)
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

import { POST } from "./route";

function makeRequest(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/intro", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/intro", () => {
  beforeEach(() => {
    mockSend.mockClear();
    process.env.RESEND_API_KEY = "test-key";
  });

  it("accepts a well-formed intro request and sends email to anna.wigrena@gmail.com", async () => {
    const req = makeRequest({
      firstName: "Fergus",
      lastName: "O'Reilly",
      email: "fergus@larry.dev",
      company: "Larry",
      jobTitle: "Founder",
      comment: "Looking forward to a call.",
      marketingConsent: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toEqual(["anna.wigrena@gmail.com"]);
    expect(call.subject).toContain("Fergus O'Reilly");
    expect(call.subject).toContain("Larry");
    expect(call.html).toContain("fergus@larry.dev");
    expect(call.html).toContain("Looking forward to a call.");
  });

  it("rejects missing required fields with 400", async () => {
    const req = makeRequest({ firstName: "A", email: "x@y.z" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid email with 400", async () => {
    const req = makeRequest({
      firstName: "A",
      lastName: "B",
      email: "not-an-email",
      company: "C",
      jobTitle: "D",
      marketingConsent: false,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/ratelimit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });
    const req = makeRequest({
      firstName: "A",
      lastName: "B",
      email: "a@b.c",
      company: "C",
      jobTitle: "D",
      marketingConsent: false,
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
```

**Note on mock paths:** Before committing, check the exact import path the founder-contact route uses for the rate-limit helper (it may be `@/lib/ratelimit`, `@/lib/rate-limit`, or elsewhere). Update the `vi.mock()` path in the test to match exactly.

- [ ] **Step 3: Run the test — expect failure**

Run: `npm run test apps/web/src/app/api/intro/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist.

- [ ] **Step 4: Implement the route**

Create `apps/web/src/app/api/intro/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/ratelimit"; // update path if founder-contact uses a different one

const IntroSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  company: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  comment: z.string().max(1000).optional(),
  marketingConsent: z.boolean(),
});

const RECIPIENT = "anna.wigrena@gmail.com";
// NOTE: copy the `from:` value from founder-contact/route.ts — do NOT introduce a new sender.
// If founder-contact uses a variable like `process.env.RESEND_FROM`, reuse it here identically.
const FROM_ADDRESS = process.env.RESEND_FROM ?? "Larry <hello@larry-pm.com>";

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await checkRateLimit(`intro:${ip}`, { limit: 3, window: 3600 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = IntroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email service unavailable" }, { status: 503 });
  }
  const resend = new Resend(apiKey);

  const html = `
    <h2>New Larry intro request</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
      <tr><td><b>Name</b></td><td>${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</td></tr>
      <tr><td><b>Email</b></td><td><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
      <tr><td><b>Company</b></td><td>${escapeHtml(data.company)}</td></tr>
      <tr><td><b>Job title</b></td><td>${escapeHtml(data.jobTitle)}</td></tr>
      <tr><td><b>Marketing consent</b></td><td>${data.marketingConsent ? "Yes" : "No"}</td></tr>
      ${data.comment ? `<tr><td><b>Comment</b></td><td>${escapeHtml(data.comment)}</td></tr>` : ""}
    </table>
    <p style="font-family:sans-serif;color:#666;font-size:12px">Sent from larry-pm.com /api/intro · ${new Date().toISOString()}</p>
  `.trim();

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [RECIPIENT],
    replyTo: data.email,
    subject: `Larry intro request — ${data.firstName} ${data.lastName} (${data.company})`,
    html,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run the test — expect pass**

Run: `npm run test apps/web/src/app/api/intro/route.test.ts`
Expected: all 4 tests pass.

If any test fails, the most likely cause is a mismatched `vi.mock()` path for the rate-limit helper. Read `founder-contact/route.ts` again and match the import exactly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/intro/route.ts apps/web/src/app/api/intro/route.test.ts
git commit -m "feat(api): POST /api/intro sends intro requests to anna.wigrena@gmail.com"
```

---

### Task 6: `<IntroForm>` component

**Files:**
- Create: `apps/web/src/components/ui/IntroForm.tsx`
- Reference: `apps/web/src/components/ui/WaitlistForm.tsx` (pattern source)

- [ ] **Step 1: Read WaitlistForm.tsx to copy the Field pattern and status machine**

Run: Read `apps/web/src/components/ui/WaitlistForm.tsx`
Note: the internal `Field` component, validation helpers, status state (`"idle" | "submitting" | "success" | "error"`), the success card, and how it calls `fetch("/api/waitlist", ...)`.

- [ ] **Step 2: Create IntroForm.tsx**

```tsx
"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

type Status = "idle" | "submitting" | "success" | "error";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle: string;
  comment: string;
  marketingConsent: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.firstName.trim()) errors.firstName = "Required";
  if (!state.lastName.trim()) errors.lastName = "Required";
  if (!state.email.trim()) errors.email = "Required";
  else if (!emailRe.test(state.email)) errors.email = "Enter a valid email";
  if (!state.company.trim()) errors.company = "Required";
  if (!state.jobTitle.trim()) errors.jobTitle = "Required";
  if (state.comment.length > 1000) errors.comment = "Keep it under 1000 characters";
  return errors;
}

export function IntroForm() {
  const [state, setState] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    jobTitle: "",
    comment: "",
    marketingConsent: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(state);
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setStatus("submitting");
    setServerError(null);
    try {
      const res = await fetch("/api/intro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body?.error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setServerError("Network error — please try again");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="flex flex-col items-center text-center py-10"
      >
        <div className="h-14 w-14 rounded-full bg-[#6c44f6] text-white grid place-items-center mb-4">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[--text-1]">Request received.</h3>
        <p className="text-sm text-[--text-2] mt-1">We&rsquo;ll be in touch shortly.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name" name="firstName" value={state.firstName} onChange={(v) => update("firstName", v)} error={errors.firstName} autoComplete="given-name" />
        <Field label="Last name" name="lastName" value={state.lastName} onChange={(v) => update("lastName", v)} error={errors.lastName} autoComplete="family-name" />
      </div>
      <Field label="Work email" name="email" type="email" value={state.email} onChange={(v) => update("email", v)} error={errors.email} autoComplete="email" />
      <Field label="Company" name="company" value={state.company} onChange={(v) => update("company", v)} error={errors.company} autoComplete="organization" />
      <Field label="Job title" name="jobTitle" value={state.jobTitle} onChange={(v) => update("jobTitle", v)} error={errors.jobTitle} autoComplete="organization-title" />
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wider text-[--text-muted] mb-2">Comment (optional)</span>
        <textarea
          value={state.comment}
          onChange={(e) => update("comment", e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full rounded-xl bg-white/30 backdrop-blur-sm border border-white/50 px-4 py-3 text-[--text-1] placeholder-[--text-disabled] focus:bg-white/50 focus:border-white/70 focus:ring-1 focus:ring-white/40 outline-none transition"
          style={{ fontSize: "1rem" }}
          placeholder="Anything we should know before our call?"
        />
        {errors.comment && <p className="text-xs text-red-500 mt-1">{errors.comment}</p>}
      </label>
      <label className="flex items-start gap-3 text-sm text-[--text-2]">
        <input
          type="checkbox"
          checked={state.marketingConsent}
          onChange={(e) => update("marketingConsent", e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#6c44f6]"
        />
        <span>I agree to receive updates from Larry about the product.</span>
      </label>
      <p className="text-xs text-[--text-muted]">
        By submitting you agree to our <a href="#" className="underline text-[--text-2] hover:text-[--text-1]">Privacy Policy</a>.
      </p>
      {serverError && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-500"
        >
          {serverError}
        </motion.p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full min-h-[44px] border border-[--text-1] text-[--text-1] bg-transparent hover:bg-[#6c44f6] hover:border-[#6c44f6] hover:text-white transition-colors duration-200 font-medium disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Book an intro"}
      </button>
      <p className="text-xs text-[--text-muted] text-center">
        No spam. We&rsquo;ll use your details only to follow up on your intro request.
      </p>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}

function Field({ label, name, value, onChange, error, type = "text", autoComplete }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-[--text-muted] mb-2">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={`w-full rounded-xl bg-white/30 backdrop-blur-sm border px-4 py-3 min-h-[44px] text-[--text-1] placeholder-[--text-disabled] focus:bg-white/50 focus:ring-1 outline-none transition ${
          error ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-white/50 focus:border-white/70 focus:ring-white/40"
        }`}
        style={{ fontSize: "1rem" }}
      />
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="text-xs text-red-500 mt-1"
        >
          {error}
        </motion.p>
      )}
    </label>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit** (without wiring — that's Task 7)

```bash
git add apps/web/src/components/ui/IntroForm.tsx
git commit -m "feat(web): add IntroForm component for Book-an-intro modal"
```

---

### Task 7: Wire `"intro"` type into `<LiquidOverlay>` + `<OverlayManager>`

**Files:**
- Modify: `apps/web/src/components/ui/LiquidOverlay.tsx`
- Modify: `apps/web/src/components/ui/OverlayManager.tsx`

- [ ] **Step 1: Read both files to find the `OverlayType` union**

Run: Read both files.
Note the existing string-literal union (`"waitlist" | "founders"`) and the body-rendering switch.

- [ ] **Step 2: Extend the type union in LiquidOverlay.tsx**

Find every instance of `"waitlist" | "founders"` and replace with `"waitlist" | "founders" | "intro"`.

Update the header copy switch so that the `"intro"` case renders:
- Eyebrow: `EARLY ACCESS`
- H2: `Book an intro`
- Subtitle: `Tell us about your team and we'll reach out to arrange a call.`

- [ ] **Step 3: Update OverlayManager.tsx to route intro → IntroForm**

Add the import:

```tsx
import { IntroForm } from "./IntroForm";
```

In the body-rendering conditional (next to `"waitlist"` → `<WaitlistForm />` and `"founders"` → `<FounderContact />`), add:

```tsx
{type === "intro" && <IntroForm />}
```

- [ ] **Step 4: Type-check and manual verify**

Run: `npm run typecheck`. Expected: clean.

Run: `npm run dev`. In a browser DevTools console, open an intro overlay manually:

```js
document.dispatchEvent(new CustomEvent("overlay:open", {
  detail: {
    type: "intro",
    rect: { left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40 }
  }
}));
```

Expected: bubble-expansion animation plays; the IntroForm renders with "Book an intro" header; Escape / backdrop click dismisses.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/LiquidOverlay.tsx apps/web/src/components/ui/OverlayManager.tsx
git commit -m "feat(web): wire 'intro' overlay type to IntroForm"
```

---

### Task 8: Move `<OverlayManager>` from `page.tsx` to `layout.tsx`

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Why:** `/pricing` and `/careers` both include a "Book an intro" CTA. Having `<OverlayManager>` at the layout level means every route can trigger overlays.

- [ ] **Step 1: Remove the `<OverlayManager>` mount from page.tsx**

Find the `<OverlayManager />` in `page.tsx` and remove it (and the import).

- [ ] **Step 2: Add `<OverlayManager>` to layout.tsx**

In `apps/web/src/app/layout.tsx`:

```tsx
import { OverlayManager } from "@/components/ui/OverlayManager";

// …inside <body>:
<body ...>
  <OverlayManager />
  {children}
</body>
```

Note: `OverlayManager` must be rendered as a client component. If it already has `"use client"` at the top, this works directly. If not, wrap it in a small client component.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Visit `/` — click "Join the Waitlist", confirm overlay opens. Close. Navigate to `/login` — the overlay is not there (no CTA to fire it), but no crashes. Refresh `/` — overlay still works.
Expected: overlay behavior identical to before, but now available globally.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/layout.tsx
git commit -m "refactor(web): mount OverlayManager at layout root for cross-route overlays"
```

---

## Phase 3 — Navbar, Footer, LogoBar

### Task 9: Navbar center links — Mission · Pricing · Careers

**Files:**
- Modify: `apps/web/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Read the current nav-link array**

Run: Read `Navbar.tsx`.
Locate the array of link definitions (label + href + tracked section id).

- [ ] **Step 2: Replace the link array**

Change the array to:

```ts
const NAV_LINKS = [
  { label: "Mission", href: "/#mission", sectionId: "mission", kind: "hash" as const },
  { label: "Pricing", href: "/pricing", kind: "route" as const },
  { label: "Careers", href: "/careers", kind: "route" as const },
];
```

Rendering logic:
- `kind: "hash"` → smooth-scroll in-page (existing behavior) when on `/`; when on another page, `/` + hash routes home first then scrolls.
- `kind: "route"` → standard `<Link>` navigation.

Keep the hover-underline treatment and active-section styling. The IntersectionObserver only tracks in-page sections that exist on the current route — reduce its watch list to `["mission"]` (or guard it so it only attaches on `/`). Active route matching for `/pricing` and `/careers` uses `usePathname()`.

Add at the top of the component:

```ts
import { usePathname } from "next/navigation";
// inside component:
const pathname = usePathname();
```

Apply `aria-current="page"` to a route-kind link when `pathname === link.href`.

- [ ] **Step 3: Test keyboard navigation + hash scroll**

Run `npm run dev`. On `/`, tab through the nav. Click "Mission" — smooth-scrolls to `#mission` (section doesn't exist yet — that's Task 16, but the anchor target should at least no-op cleanly). Click "Pricing" — routes to `/pricing` (404 until Task 22 — expected).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/Navbar.tsx
git commit -m "feat(web): navbar links → Mission / Pricing / Careers"
```

---

### Task 10: Navbar right cluster — Sign in · Book an intro · Join Waitlist

**Files:**
- Modify: `apps/web/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Locate the current right-side cluster**

Read `Navbar.tsx` again. Find the block rendering "Log in" link + "Join the Waitlist" button.

- [ ] **Step 2: Rebuild the cluster**

Replace the existing right-cluster block with three elements in this order, separated by appropriate spacing (~16px gap):

```tsx
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LiquidButton } from "@/components/ui/LiquidButton";

// inside the nav render:
const onIntro = useOverlayTrigger("intro");
const onWaitlist = useOverlayTrigger("waitlist");

<div className="flex items-center gap-3 sm:gap-4">
  <Link
    href="/login"
    className="hidden sm:inline text-sm text-[--text-muted] hover:text-[--text-1] transition-colors"
  >
    Sign in
  </Link>
  <Button
    variant="secondary"
    size="sm"
    onClick={onIntro}
    className="hidden sm:inline-flex"
  >
    Book an intro
  </Button>
  <LiquidButton size="sm" onClick={onWaitlist}>
    <span className="sm:hidden">Join Waitlist</span>
    <span className="hidden sm:inline">Join the Waitlist</span>
  </LiquidButton>
</div>
```

- [ ] **Step 3: Update the mobile dropdown menu**

Find the mobile menu block (inside `<AnimatePresence>`). Update the listed items to:
1. Mission (hash link, scrolls to `/#mission` on home, closes menu)
2. Pricing (route link, closes menu)
3. Careers (route link, closes menu)
4. Sign in (route link to `/login`, closes menu)
5. Book an intro (full-width outlined button, fires intro overlay, closes menu)
6. Join Waitlist (full-width filled button, fires waitlist overlay, closes menu)

Keep the existing menu chrome (motion.div, backdrop-blur, rounded-xl) and dismiss handlers (Escape, click-outside).

- [ ] **Step 4: Visual check**

Run `npm run dev`. At desktop width: three right-cluster items visible — "Sign in" as plain text, "Book an intro" outlined, "Join the Waitlist" as filled LiquidButton. No visual crowding. At mobile width (<640px): hamburger shows all six items stacked.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/Navbar.tsx
git commit -m "feat(web): navbar right cluster — Sign in · Book an intro · Join Waitlist"
```

---

### Task 11: Footer link updates

**Files:**
- Modify: `apps/web/src/components/layout/Footer.tsx`

- [ ] **Step 1: Replace the product-links list**

Find the "PRODUCT" column ul of four links. Replace with three:

```tsx
const FOOTER_PRODUCT_LINKS = [
  { label: "Mission", href: "/#mission" },
  { label: "Pricing", href: "/pricing" },
  { label: "Careers", href: "/careers" },
];
```

Render them with the same `<Link>` and class treatment as today.

- [ ] **Step 2: Visual check**

Run `npm run dev`. Scroll to footer. Three links visible, correct labels.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/Footer.tsx
git commit -m "feat(web): footer product links → Mission / Pricing / Careers"
```

---

### Task 12: LogoBar industry list update

**Files:**
- Modify: `apps/web/src/components/sections/LogoBar.tsx`

- [ ] **Step 1: Update the industries array**

Find the array of industry strings. Replace:

```
["Consulting", "IT Services", "Engineering", "Financial Services", "SaaS"]
```

With:

```
["Consulting", "IT Services", "Engineering", "Construction and Infrastructure", "Energy and Renewables", "SaaS"]
```

Keep the thin divider rendering between items (existing).

- [ ] **Step 2: Visual check**

Run `npm run dev`. Scroll below hero. The industry list reads: `Consulting · IT Services · Engineering · Construction and Infrastructure · Energy and Renewables · SaaS`. On narrow viewports the list may wrap; that's fine.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/sections/LogoBar.tsx
git commit -m "feat(web): LogoBar industries list updated per brief"
```

---

## Phase 4 — Hero Rebuild (the centerpiece)

### Task 13: ExecutionTimeline choreography data

**Files:**
- Create: `apps/web/src/components/ui/ExecutionTimeline.data.ts`

- [ ] **Step 1: Create the data module**

```ts
export type LaneId = "alpha" | "q3" | "platform";

export interface Lane {
  id: LaneId;
  label: string;
}

export const LANES: Lane[] = [
  { id: "alpha", label: "ALPHA LAUNCH" },
  { id: "q3", label: "Q3 PROGRAMME" },
  { id: "platform", label: "PLATFORM MIGRATION" },
];

export type BarState = "in-progress" | "complete" | "overdue" | "escalated";

export interface TaskBar {
  id: string;
  lane: LaneId;
  /** Left edge as a percentage of the lane width */
  left: number;
  /** Target width as a percentage of the lane width (animates 0 → this) */
  width: number;
  /** When the bar first appears (seconds into the 12s loop) */
  tAppear: number;
  /** How long the width animates from 0 to its target */
  tGrow: number;
  /** Initial state; optionally transitions via `transitions[]` */
  state: BarState;
  transitions?: Array<{ at: number; to: BarState }>;
}

export const BARS: TaskBar[] = [
  {
    id: "alpha-deliverables",
    lane: "alpha",
    left: 20, width: 35, tAppear: 0, tGrow: 2,
    state: "in-progress",
    transitions: [{ at: 3, to: "complete" }],
  },
  {
    id: "alpha-stakeholder",
    lane: "alpha",
    left: 60, width: 30, tAppear: 9, tGrow: 2,
    state: "in-progress",
  },
  {
    id: "q3-engsignoff",
    lane: "q3",
    left: 10, width: 25, tAppear: 1, tGrow: 2.5,
    state: "in-progress",
    transitions: [{ at: 6, to: "complete" }],
  },
  {
    id: "platform-apihandoff",
    lane: "platform",
    left: 5, width: 15, tAppear: 4, tGrow: 1.5,
    state: "overdue",
    transitions: [{ at: 7, to: "escalated" }],
  },
];

export interface Notification {
  id: string;
  /** Notification body text */
  text: string;
  /** Dot colour */
  dot: "brand" | "amber" | "red";
  /** When it fades in */
  tShow: number;
  /** When it fades out */
  tHide: number;
}

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", text: "Reminder sent → @Morgan", dot: "brand", tShow: 2, tHide: 3.5 },
  { id: "n2", text: "Risk flagged: API handoff 2d overdue", dot: "red", tShow: 4.5, tHide: 6 },
  { id: "n3", text: "Exec summary compiled — ready for review", dot: "brand", tShow: 8, tHide: 9.5 },
];

export const LOOP_SECONDS = 12;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ui/ExecutionTimeline.data.ts
git commit -m "feat(web): define ExecutionTimeline choreography data"
```

---

### Task 14: `<ExecutionTimeline>` component

**Files:**
- Create: `apps/web/src/components/ui/ExecutionTimeline.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  BARS,
  LANES,
  LOOP_SECONDS,
  NOTIFICATIONS,
  type BarState,
  type LaneId,
  type Notification,
  type TaskBar,
} from "./ExecutionTimeline.data";

const BAR_COLOR: Record<BarState, string> = {
  "in-progress": "#f59e0b", // amber
  complete: "#10b981", // emerald
  overdue: "#ef4444", // red
  escalated: "#f59e0b", // amber (same as in-progress, but no pulse)
};

const DOT_COLOR = {
  brand: "#6c44f6",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

function currentBarState(bar: TaskBar, t: number): BarState {
  if (!bar.transitions) return bar.state;
  let s = bar.state;
  for (const tr of bar.transitions) {
    if (t >= tr.at) s = tr.to;
  }
  return s;
}

export function ExecutionTimeline() {
  const reducedMotion = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const elapsed = ((now - start) / 1000) % LOOP_SECONDS;
      setTick(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // For reduced motion: freeze at t=10s (steady-state frame).
  const t = reducedMotion ? 10 : tick;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.92, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-5xl mx-auto rounded-2xl border border-[--border] bg-[rgba(248,247,255,0.8)] backdrop-blur-sm overflow-hidden"
      role="img"
      aria-label="Larry execution activity — animated timeline"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[--border]">
        <div className="flex items-center gap-2">
          <div
            className="h-3.5 w-3.5 rounded-sm bg-[#6c44f6] grid place-items-center text-white text-[9px] font-bold"
            aria-hidden="true"
          >
            L
          </div>
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[--text-disabled]">
            LARRY — LIVE
          </span>
        </div>
        <span className="text-[10px] text-[--text-disabled]">3 projects active</span>
      </div>

      {/* Notifications layer */}
      <div className="absolute top-12 right-4 sm:right-6 z-10 flex flex-col items-end gap-2 pointer-events-none">
        {NOTIFICATIONS.map((n) => {
          const visible = t >= n.tShow && t < n.tHide;
          return <NotificationBubble key={n.id} n={n} visible={visible} />;
        })}
      </div>

      {/* Lanes */}
      <div className="divide-y divide-[--border]">
        {LANES.map((lane) => (
          <div
            key={lane.id}
            className="relative flex items-center gap-4 px-4 sm:px-6 py-3 min-h-[48px]"
          >
            <span className="text-[9px] font-semibold tracking-[0.14em] text-[--text-disabled] w-[120px] shrink-0">
              {lane.label}
            </span>
            <div className="relative flex-1 h-5">
              {BARS.filter((b) => b.lane === lane.id).map((bar) => (
                <Bar key={bar.id} bar={bar} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Bar({ bar, t }: { bar: TaskBar; t: number }) {
  const visible = t >= bar.tAppear;
  if (!visible) return null;
  const growT = Math.min(1, (t - bar.tAppear) / bar.tGrow);
  const widthPct = bar.width * growT;
  const state = currentBarState(bar, t);
  const color = BAR_COLOR[state];
  const pulsing = state === "overdue";

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.5 }}
      animate={{
        opacity: 1,
        scaleX: 1,
      }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute",
        left: `${bar.left}%`,
        width: `${widthPct}%`,
        height: "100%",
        backgroundColor: color,
        borderRadius: 4,
        transformOrigin: "left center",
      }}
      className={pulsing ? "animate-[livePulse_2.4s_ease-in-out_infinite]" : ""}
    >
      {state === "complete" && (
        <svg
          viewBox="0 0 24 24"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </motion.div>
  );
}

function NotificationBubble({ n, visible }: { n: Notification; visible: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : -8,
      }}
      transition={{ duration: reducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-2 bg-white border border-[--border] rounded-lg px-3 py-1.5 shadow-sm text-[10px] sm:text-xs text-[--text-2] max-w-[300px]"
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: DOT_COLOR[n.dot] }}
      />
      {n.text}
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** (without integration — that's Task 15)

```bash
git add apps/web/src/components/ui/ExecutionTimeline.tsx
git commit -m "feat(web): add ExecutionTimeline hero animation component"
```

---

### Task 15: `<HeroSection>` rewrite

**Files:**
- Modify: `apps/web/src/components/sections/HeroSection.tsx`

- [ ] **Step 1: Replace the component body**

Rewrite HeroSection.tsx to:

```tsx
"use client";

import { motion } from "framer-motion";
import { BlurReveal } from "@/components/ui/BlurReveal";
import { Button } from "@/components/ui/Button";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { ExecutionTimeline } from "@/components/ui/ExecutionTimeline";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.72;

export function HeroSection() {
  const onWaitlist = useOverlayTrigger("waitlist");
  const onIntro = useOverlayTrigger("intro");

  return (
    <section className="relative pt-20 sm:pt-32">
      {/* Ambient radial wash (existing pattern) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 hero-gradient-drift"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(139,92,246,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        {/* Eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, ease: EASE }}
          className="inline-block rounded-full border border-[--border] bg-[--surface-2] text-[--text-disabled] uppercase text-[11px] tracking-[0.1em] px-3 py-1 mb-8"
        >
          AI-Powered Autonomous Execution
        </motion.span>

        {/* Headline */}
        <BlurReveal delay={0}>
          <h1
            className="font-extrabold text-[--text-1]"
            style={{
              fontSize: "clamp(2.5rem, 8vw, 5rem)",
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
            }}
          >
            Making Projects{" "}
            <span className="stroke-draw">Run</span>{" "}
            Themselves.
          </h1>
        </BlurReveal>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, delay: 0.1, ease: EASE }}
          className="mt-6 max-w-2xl mx-auto text-[--text-2] text-base sm:text-lg"
        >
          Larry connects to your existing tools and owns the execution layer —
          follow-ups, escalations, and status updates happen automatically.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, delay: 0.2, ease: EASE }}
          className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4"
        >
          <LiquidButton size="lg" onClick={onWaitlist}>
            Join the Waitlist
          </LiquidButton>
          <Button variant="secondary" size="lg" onClick={onIntro}>
            Book an intro
          </Button>
        </motion.div>
      </div>

      {/* Execution timeline (hero centerpiece) */}
      <div className="mt-16 sm:mt-20 px-4 sm:px-6">
        <ExecutionTimeline />
      </div>

      {/* Warm fade into next section */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 -z-10 bg-gradient-to-t from-[#F8F7FF] to-transparent"
      />
    </section>
  );
}
```

- [ ] **Step 2: Remove the old hero mockup code**

If the old HeroSection.tsx had an inline mockup (browser chrome, project sidebar, task rows, ambient feed inside the mockup), delete it — the ExecutionTimeline replaces it.

- [ ] **Step 3: Visual check**

Run `npm run dev`. Scroll to top of `/`. Verify:
- Eyebrow pill reads "AI-POWERED AUTONOMOUS EXECUTION" in the brand purple treatment
- H1 reads "Making Projects Run Themselves." with an underline drawing under "Run" shortly after load
- Subtitle and two CTAs render
- Below: the animated timeline loops with bars appearing, turning green, overdue bar pulsing red, notifications floating in top-right every ~2s

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sections/HeroSection.tsx
git commit -m "feat(web): rebuild HeroSection with stroke-draw headline + ExecutionTimeline"
```

---

## Phase 5 — New Body Sections

### Task 16: `<MissionSection>`

**Files:**
- Create: `apps/web/src/components/sections/MissionSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/FadeUp";
import { Waypoints, Database, Link2, Zap, BrainCircuit, type LucideIcon } from "lucide-react";

interface MissionCard {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CARDS: MissionCard[] = [
  {
    icon: Waypoints,
    title: "Alignment",
    body: "Aligns stakeholders, timelines, and work across fragmented systems, tools, and individuals.",
  },
  {
    icon: Database,
    title: "Source of Truth",
    body: "Creates a real-time, single source of truth for all work.",
  },
  {
    icon: Link2,
    title: "Coordination",
    body: "Eliminates manual coordination and constant status chasing.",
  },
  {
    icon: Zap,
    title: "Autonomous Execution",
    body: "Automatically executes actions end-to-end.",
  },
  {
    icon: BrainCircuit,
    title: "Project Context",
    body: "Maintains full project knowledge and delivers instant responses.",
  },
];

export function MissionSection() {
  return (
    <section id="mission" className="py-12 sm:py-24 bg-white border-t border-[--border]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase text-center">
            What Larry Does
          </p>
          <h2
            className="mt-4 text-center text-[--text-1] font-bold mx-auto max-w-4xl"
            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Making projects run themselves by aligning stakeholders, timelines, and work
            through autonomous execution — so teams focus on outcomes, not updates.
          </h2>
        </FadeUp>

        <StaggerContainer className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
          {CARDS.map((card) => (
            <StaggerItem key={card.title}>
              <MissionCardTile {...card} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

function MissionCardTile({ icon: Icon, title, body }: MissionCard) {
  return (
    <div
      className="group h-full rounded-xl border border-[--border] bg-white p-6 transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(17,23,44,0.06)]"
      style={{ transitionProperty: "box-shadow, transform" }}
    >
      <div
        className="h-8 w-8 rounded-lg grid place-items-center transition-transform duration-200 group-hover:scale-110 group-hover:ring-2 group-hover:ring-[#6c44f6] group-hover:ring-offset-2 group-hover:ring-offset-white"
        style={{ background: "rgba(108,68,246,0.08)" }}
      >
        <Icon size={18} className="text-[#6c44f6]" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-[--text-1]">{title}</h3>
      <p className="mt-2 text-[13px] text-[--text-2] leading-[1.5]">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`. Expected: clean.
If `FadeUp`/`StaggerContainer`/`StaggerItem` export paths differ from `@/components/ui/FadeUp`, adjust the import — they live in the `components/ui/` directory per the spec.

- [ ] **Step 3: Commit** (integration in Task 24)

```bash
git add apps/web/src/components/sections/MissionSection.tsx
git commit -m "feat(web): add MissionSection with 5 autonomous-execution cards"
```

---

### Task 17: `<ComparisonSection>` with hover reveals

**Files:**
- Create: `apps/web/src/components/sections/ComparisonSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { FadeUp } from "@/components/ui/FadeUp";
import { ChevronRight } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const WITHOUT_ITEMS = [
  "Chasing updates across teams, email, Slack, and spreadsheets",
  "Sending reminders and following up on tasks and deadlines",
  "Running status meetings that create more confusion than progress",
  "Manually updating project plans and reports",
];

const WITH_ITEMS = [
  "Real-time, fully updated project state with clear priorities",
  "Automatically aligns stakeholders, timelines, and tools",
  "Automates task execution, updates, follow-ups, and progress tracking",
  "Full project context and immediate, informed responses via chat",
];

export function ComparisonSection() {
  return (
    <section className="py-12 sm:py-24 border-t border-[--border] bg-[#F2F2EF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase text-center">
            The Difference
          </p>
          <h2
            className="mt-4 text-center text-[--text-1] font-bold"
            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Where execution breaks down.
          </h2>
        </FadeUp>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WithoutCard />
          <WithCard />
        </div>

        <FadeUp delay={0.1}>
          <div className="mt-10 rounded-2xl border border-[--border] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(17,23,44,0.04)] text-center">
            <p className="text-sm text-[--text-muted]">This is not a tracking problem.</p>
            <p
              className="mt-2 font-bold text-[--text-1]"
              style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)", letterSpacing: "-0.02em" }}
            >
              It&rsquo;s an execution gap.
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function WithoutCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[--border] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(17,23,44,0.04)] min-h-[420px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase">Without Larry</p>
      <p className="mt-1 text-sm text-[--text-muted]">Today&rsquo;s reality</p>
      <p className="mt-6 text-[--text-2]">Every day, project managers lose hours to:</p>
      <ul className="mt-4 space-y-3">
        {WITHOUT_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-2 h-[2px] w-3 bg-[--text-disabled] shrink-0" aria-hidden="true" />
            <span className="text-[--text-2]">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl bg-[--surface-2] p-4">
        <p className="text-[--text-muted]">Critical information is scattered across:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Slack", "Tickets", "Meetings", "Inboxes"].map((chip) => (
            <span key={chip} className="rounded-full border border-[--border] bg-white px-3 py-1 text-xs text-[--text-2]">
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-[--text-1]">Nothing owns execution.</p>
      </div>

      {/* Hover overlay — chaos */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "rgba(26,26,14,0.9)" }}
      >
        <div className="relative w-full max-w-sm">
          {[
            { rotate: -4, top: 0, text: "@jake: where are we on the API spec?" },
            { rotate: 3, top: 40, text: "@morgan: still waiting on sign-off" },
            { rotate: -2, top: 80, text: "@priya: I thought this shipped last week?" },
            { rotate: 2, top: 120, text: "@leadership: why is this 2 days late?" },
          ].map((msg, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 bg-white/90 rounded px-3 py-2 text-xs text-[--text-1] shadow"
              style={{ transform: `rotate(${msg.rotate}deg)`, top: msg.top }}
            >
              {msg.text}
            </div>
          ))}
        </div>
        <div className="absolute top-6 right-6 rounded-full bg-red-500 text-white text-[10px] font-bold px-2 py-1 tracking-wider">
          ⚠ 3 OVERDUE
        </div>
        <p className="absolute bottom-6 text-white/80 text-sm italic">This is what execution without Larry looks like.</p>
      </motion.div>
    </div>
  );
}

function WithCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[--text-2] bg-[--text-1] p-6 sm:p-8 min-h-[420px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase">With Larry</p>
      <p className="mt-1 text-sm text-[--text-muted]">Autonomous execution</p>
      <p className="mt-6 text-[--text-muted]">Every day, project managers experience:</p>
      <ul className="mt-4 space-y-3">
        {WITH_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <ChevronRight size={14} className="text-[--text-muted] mt-1 shrink-0" aria-hidden="true" />
            <span className="text-[--text-muted]">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl bg-white/5 p-4">
        <p className="text-sm text-[--text-muted]">
          Automatically aligns stakeholders, timelines, and tools. Teams focus on outcomes, not updates.
        </p>
      </div>

      {/* Hover overlay — order */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
        style={{ backgroundColor: "rgba(248,247,255,0.97)" }}
      >
        <div className="w-full max-w-sm space-y-2">
          {[
            { label: "Finalise Q3 deliverables", state: "Done", color: "#10b981" },
            { label: "Engineering sign-off on API", state: "Pending", color: "#f59e0b" },
            { label: "Update project tracker", state: "Overdue", color: "#ef4444" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-lg border border-[--border] bg-white px-3 py-2 shadow-sm">
              <span className="text-sm text-[--text-1]">{row.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: row.color }}>
                {row.state}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-center gap-2 pt-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6c44f6] animate-[livePulse_2.4s_ease-in-out_infinite]" />
            <span className="text-[11px] font-semibold tracking-wider text-[--text-1]">LARRY IS ACTIVE</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/sections/ComparisonSection.tsx
git commit -m "feat(web): add ComparisonSection with chaos/order hover reveals"
```

---

## Phase 6 — Section Copy + Simplifications

### Task 18: `<FeaturesSection>` copy updates

**Files:**
- Modify: `apps/web/src/components/sections/FeaturesSection.tsx`

- [ ] **Step 1: Update headline and step copy**

Read the file. Find the H2 string and replace:
- `"Coordination that runs itself."` → `"Project management that runs itself."`

Find the 4-step array. Replace each step description exactly:

| Step | New description |
|---|---|
| 01 Connect | Integrates with Teams, email, Slack and your existing stack of tools — no migration, no new process. |
| 02 Capture | Extracts actions, owners, and deadlines from emails, ticket comments, and meeting notes automatically. |
| 03 Execute | Creates tasks, sends reminders, escalates blockers, and updates status based on real activity — without you asking. |
| 04 Report | Compiles standups, proactively flags risks, and surfaces key insights for leadership to ensure timely execution and delivery. |

Leave the structure, easing, and capability-panel copy unchanged.

- [ ] **Step 2: Visual check**

Run `npm run dev`. Scroll to the "How it works" section. Verify H2 reads "Project management that runs itself." and the four step descriptions match the table above exactly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/sections/FeaturesSection.tsx
git commit -m "feat(web): update FeaturesSection copy per brief"
```

---

### Task 19: `<WhoItsForSection>` simplify + industries

**Files:**
- Modify: `apps/web/src/components/sections/WhoItsForSection.tsx`

- [ ] **Step 1: Read the current file**

Run: Read `WhoItsForSection.tsx`. Note: it has 2 large primary role cards and 4 secondary role cards, each with body descriptions.

- [ ] **Step 2: Replace the component body**

Rewrite the section to:

```tsx
"use client";

import { FadeUp } from "@/components/ui/FadeUp";

const ROLES = [
  "Project Managers",
  "PMO Leads",
  "Consultants and Professional Services Teams",
  "Operations and Delivery Leaders",
  "Engineering and Technical Leaders",
  "CTOs & COOs",
];

const INDUSTRIES = [
  "Consulting",
  "IT Services",
  "Engineering",
  "Construction and Infrastructure",
  "Energy and Renewables",
  "SaaS",
];

export function WhoItsForSection() {
  return (
    <section id="audience" className="py-12 sm:py-24 border-t border-[--border] bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase text-center">
            Who This Is For
          </p>
          <h2
            className="mt-4 text-center text-[--text-1] font-bold mx-auto max-w-3xl"
            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Built for the people who own project management and execution.
          </h2>
        </FadeUp>

        {/* Roles grid — names only, no descriptions */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {ROLES.map((role) => (
            <div
              key={role}
              className="rounded-xl border border-[--border] bg-white px-4 py-5 text-center transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(17,23,44,0.05)]"
            >
              <span className="text-[15px] font-medium text-[--text-1]">{role}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mt-16 border-t border-[--border]" />

        {/* Industries */}
        <FadeUp delay={0.05}>
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase shrink-0">
              Built for teams in
            </span>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((industry) => (
                <span
                  key={industry}
                  className="rounded-full border border-[--border] bg-[--surface-2] px-4 py-1.5 text-[13px] font-medium text-[--text-2]"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Visual check**

Run `npm run dev`. Scroll to the "Who It's For" section. Verify: H2 reads "Built for the people who own project management and execution."; six role cards render in a 3-column grid on desktop (2-col on mobile) with no descriptions; below a thin divider: "BUILT FOR TEAMS IN" eyebrow + 6 industry pills.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sections/WhoItsForSection.tsx
git commit -m "feat(web): simplify WhoItsForSection + add industries sub-section"
```

---

### Task 20: `<CTASection>` — "Book an intro" rewiring

**Files:**
- Modify: `apps/web/src/components/sections/CTASection.tsx`

- [ ] **Step 1: Read the file**

Run: Read `CTASection.tsx`. Note: there are two CTAs — primary "Join the Waitlist" (LiquidButton) and secondary "Speak to the Founders" (ghost/outline Button).

- [ ] **Step 2: Swap the secondary CTA**

Find the secondary CTA. Change:
- Label from `Speak to the Founders` → `Book an intro`
- `onClick` from `useOverlayTrigger("founders")` → `useOverlayTrigger("intro")`
- Optional: update the fine-print line below the secondary CTA from `"Explore a structured pilot for your team"` → `"Tell us about your team — we&rsquo;ll arrange a call"` (if that line exists; otherwise leave).

Leave all dark-mode styling, H2 copy, primary CTA, and entrance animations unchanged.

- [ ] **Step 3: Visual check**

Run `npm run dev`. Scroll to the final dark CTA section. Verify: secondary button label is "Book an intro"; clicking opens the intro modal; primary button still opens the waitlist modal.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sections/CTASection.tsx
git commit -m "feat(web): CTASection secondary CTA → Book an intro"
```

---

## Phase 7 — New Pages + Brand

### Task 21: `<LarrySeal>` SVG component

**Files:**
- Create: `apps/web/src/components/ui/LarrySeal.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface LarrySealProps {
  size?: number;
  color?: string;
  className?: string;
}

export function LarrySeal({ size = 80, color = "#6c44f6", className }: LarrySealProps) {
  const uid = "larry-seal-arc";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <path id={`${uid}-top`} d="M 20 50 A 30 30 0 0 1 80 50" />
        <path id={`${uid}-bottom`} d="M 80 50 A 30 30 0 0 1 20 50" />
      </defs>
      <circle cx="50" cy="50" r="42" />
      <circle cx="50" cy="50" r="36" strokeOpacity="0.6" />
      <text fontSize="7" fontWeight="700" letterSpacing="2" fill={color} stroke="none" textLength="55">
        <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
          LARRY
        </textPath>
      </text>
      <text fontSize="5" fontWeight="600" letterSpacing="1.5" fill={color} stroke="none">
        <textPath href={`#${uid}-bottom`} startOffset="50%" textAnchor="middle">
          EST. 2024
        </textPath>
      </text>
      {/* Centre ornament */}
      <g transform="translate(50, 50)">
        <circle r="2.5" fill={color} stroke="none" />
        <line x1="-10" y1="0" x2="-5" y2="0" strokeWidth="1" />
        <line x1="5" y1="0" x2="10" y2="0" strokeWidth="1" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/LarrySeal.tsx
git commit -m "feat(web): add LarrySeal typographic SVG mark"
```

---

### Task 22: `/pricing` page

**Files:**
- Create: `apps/web/src/app/pricing/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function PricingPage() {
  const onIntro = useOverlayTrigger("intro");
  return (
    <>
      <LiquidBackground />
      <Navbar />
      <main className="relative min-h-screen flex items-center justify-center pt-32 pb-24">
        <div
          className="absolute inset-x-0 bottom-0 h-[40vh] pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 50% 110%, rgba(108,68,246,0.12) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-[11px] font-semibold tracking-[0.14em] text-[--text-disabled] uppercase"
          >
            Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="mt-4 font-bold text-[--text-1]"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Get pricing tailored to your needs.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="mt-6 text-base sm:text-lg text-[--text-2] max-w-xl mx-auto"
          >
            Book an intro call and we&rsquo;ll walk you through it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
            className="mt-10"
          >
            <LiquidButton size="lg" onClick={onIntro}>
              Book an intro
            </LiquidButton>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Visual check**

Run `npm run dev`. Navigate to `/pricing`. Verify: navbar visible, heading centered, CTA opens intro modal when clicked, footer renders.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "feat(web): add /pricing page routed through Book-an-intro"
```

---

### Task 23: `/careers` page

**Files:**
- Create: `apps/web/src/app/careers/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { LarrySeal } from "@/components/ui/LarrySeal";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function CareersPage() {
  return (
    <>
      <LiquidBackground />
      <Navbar />
      <main className="relative pt-24">
        {/* Top band */}
        <section className="relative w-full overflow-hidden bg-[--text-1]" style={{ minHeight: "40vh" }}>
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
            <Image
              src="/Larry_logos.png"
              alt=""
              aria-hidden="true"
              width={400}
              height={400}
              className="object-contain"
              priority
            />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-24 sm:py-32 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              className="font-bold text-white"
              style={{
                fontSize: "clamp(2rem, 5vw, 4rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
                textShadow: "0 2px 20px rgba(0,0,0,0.4)",
              }}
            >
              Build the next era of project execution.
            </motion.h1>
          </div>
        </section>

        {/* Body */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <p className="text-base sm:text-lg text-[--text-2] leading-[1.7] max-w-2xl">
                We don&rsquo;t hire for fixed team roles. Instead, we look for exceptional engineers
                and brilliant people with strong skillsets and character. Join the founding team
                and help shape the future of how work gets done.
              </p>
              <div className="mt-12">
                <p className="text-[15px] text-[--text-muted]">
                  Reach out via{" "}
                  <a
                    href="mailto:anna.wigrena@gmail.com"
                    className="text-[#6c44f6] hover:text-[#5b38d4] underline underline-offset-4 font-medium transition-colors"
                  >
                    email
                  </a>
                  .
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
              className="hidden lg:block"
            >
              <LarrySeal size={180} />
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Visual check**

Run `npm run dev`. Navigate to `/careers`. Verify: dark top band with the Larry "L" mark at 40% opacity as backdrop, large white heading "Build the next era of project execution."; below: body text + mailto link in purple; on the right on desktop: the LarrySeal SVG at 180px.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/careers/page.tsx
git commit -m "feat(web): add /careers page with LarrySeal and mailto contact"
```

---

## Phase 8 — Assembly & Verification

### Task 24: Update `page.tsx` composition

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Update imports**

Ensure these imports exist:

```tsx
import { HeroSection } from "@/components/sections/HeroSection";
import { MissionSection } from "@/components/sections/MissionSection";
import { LogoBar } from "@/components/sections/LogoBar";
import { ClientLogos } from "@/components/sections/ClientLogos";
import { ComparisonSection } from "@/components/sections/ComparisonSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { VibeSection } from "@/components/sections/VibeSection";
import { TemplatesSection } from "@/components/sections/TemplatesSection";
import { ROISection } from "@/components/sections/ROISection";
import { WhoItsForSection } from "@/components/sections/WhoItsForSection";
import { CTASection } from "@/components/sections/CTASection";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WelcomeSplash } from "@/components/ui/WelcomeSplash";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { LandingRoot } from "@/components/layout/LandingRoot";
```

Remove imports of any section no longer rendered (e.g. `UseCasesSection` if it was imported).

- [ ] **Step 2: Update the composition**

The `<main>` ordering must be exactly:

```tsx
<LandingRoot>
  <WelcomeSplash />
  <LiquidBackground />
  <Navbar />
  <main>
    <HeroSection />
    <MissionSection />
    <LogoBar />
    <ClientLogos />
    <ComparisonSection />
    <FeaturesSection />
    <VibeSection />
    <TemplatesSection />
    <ROISection />
    <WhoItsForSection />
    <CTASection />
  </main>
  <Footer />
</LandingRoot>
```

`<OverlayManager>` is NOT rendered here — it now lives in `layout.tsx` (Task 8).

- [ ] **Step 3: Type-check, lint, and full dev sweep**

Run:
- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors (fix any warnings introduced by the new files)

Then `npm run dev`. Scroll through the full page. Checklist:
- [ ] Welcome splash says "Larry" for 2s, then fades
- [ ] Nav has three center links, three right-cluster items
- [ ] Hero headline + stroke-draw under "Run"
- [ ] ExecutionTimeline animates (notifications fade in/out, bars appear/complete/escalate)
- [ ] Mission section (5 cards) renders with hover ring
- [ ] LogoBar shows updated industries
- [ ] ClientLogos carousel still runs
- [ ] Comparison section — hover left card: chaos reveal; hover right card: order reveal
- [ ] FeaturesSection copy matches the brief
- [ ] VibeSection comparison table unchanged
- [ ] TemplatesSection unchanged
- [ ] ROISection slider still animates
- [ ] WhoItsFor shows role cards (no descriptions) + industries pills
- [ ] Dark CTA secondary button says "Book an intro"; opens intro modal
- [ ] Footer shows Mission/Pricing/Careers links
- [ ] `/pricing` and `/careers` load cleanly and the Book an intro CTA works on both
- [ ] No console errors, no hydration warnings
- [ ] Run tests: `npm run test` → all green (including `/api/intro` tests from Task 5)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): wire new section composition into landing page"
```

---

### Task 25: Vercel preview verification

**Files:** none (deployment + manual QA)

**Context:** Fergus tests on deployed production — local dev is insufficient for the final sign-off (see `feedback-verify-on-production` memory).

- [ ] **Step 1: Push the branch**

```bash
git push
```

Expected: pushed to `fix/auth-p2-polish` (or whatever branch was being used). Vercel will automatically build a preview deploy.

- [ ] **Step 2: Wait for the Vercel preview**

Use the Vercel MCP tool `mcp__vercel__get_deployment` with the latest deployment URL to watch build status, or visit Vercel dashboard. Look for build success.

If the build fails, read `get_deployment_build_logs` to diagnose. Common issues:
- Missing dependency (did `lucide-react` need explicit install? Check `package.json`.)
- `useReducedMotion` import path (should be `framer-motion`, not a separate hook library)
- Case-sensitivity on import paths (Windows dev vs Linux CI)

- [ ] **Step 3: Run the 25-point QA on the preview URL**

Open the preview URL in a browser. Run through the full landing page once, then visit `/pricing` and `/careers`. Repeat the Task 24 Step 3 checklist on the live URL.

Extra preview-only checks:
- [ ] Submit the Book an intro form with real data. Verify an email arrives at `anna.wigrena@gmail.com` within 1 minute. Check the `replyTo` is the submitted email.
- [ ] Open the site in a mobile viewport (Chrome devtools 375×667). Verify hamburger menu shows all 6 items and the hero headline scales cleanly.
- [ ] Toggle `prefers-reduced-motion` via Chrome devtools (Rendering panel → "Emulate CSS media feature"). Verify stroke-draw renders at full width immediately; the ExecutionTimeline shows the steady-state frame with no animation.

- [ ] **Step 4: If anything fails on preview, diagnose and fix in a follow-up task**

Do not merge to master until every checklist item above passes on the preview URL.

- [ ] **Step 5: Final commit of any preview-driven fixes**

If the preview surfaced issues, commit targeted fixes per issue with clear messages. Push and re-verify.

---

## Self-Review Checklist (done during plan-writing)

- ✅ Every spec section maps to a task:
  - §1 Global system → Tasks 1, 4
  - §2 Welcome splash → Task 2
  - §3 Navbar → Tasks 9, 10
  - §4 Hero → Tasks 14, 15
  - §4.7 ExecutionTimeline → Tasks 13, 14
  - §5 MissionSection → Task 16
  - §6 LogoBar → Task 12
  - §7 ComparisonSection → Task 17
  - §8 FeaturesSection copy → Task 18
  - §10 WhoItsForSection + Industries → Task 19
  - §12 CTASection → Task 20
  - §13 Footer → Task 11
  - §14 LiquidOverlay "intro" type → Task 7
  - §15 IntroForm → Task 6
  - §16 /api/intro → Task 5
  - §17 /pricing → Task 22
  - §18 /careers + LarrySeal → Tasks 21, 23
  - §19 Page composition → Task 24
  - §20 OverlayManager move → Task 8
  - §21 Accessibility → verified in Task 24 Step 3 checklist

- ✅ No placeholders in task steps — every code block is full and pasteable.
- ✅ Type consistency — `OverlayType` extended uniformly; `IntroForm` field names match `/api/intro` Zod schema.
- ✅ Bite-sized tasks — each task under 10 minutes except Task 14 (ExecutionTimeline — complex by nature).
- ✅ Commit after every task.
- ✅ Production verification gate (Task 25) before considering done.
