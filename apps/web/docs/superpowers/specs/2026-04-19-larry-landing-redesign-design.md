# Larry Landing Page Redesign — Design Spec
**Date**: 2026-04-19  
**Direction**: C — "The Statement" (bold scale + product grounding)  
**Scope**: Landing page (`/`), `/pricing`, `/careers`, `Book an intro` modal + `/api/intro`  
**Out of scope**: Invite-code signup gating (separate project)

---

## 1. Global Design System

### 1.1 Typography
- **Font family**: Inter throughout. Remove Plus Jakarta Sans. Update `layout.tsx` to load Inter via `next/font/google` with weights 300/400/500/600/700/800. Remove `--font-plus-jakarta`; set `--font-sans` CSS var to Inter.
- **Hero H1**: Inter 800, `clamp(2.5rem, 8vw, 5rem)`, tracking `-0.04em`, line-height `1.0`.
- **H2 headings**: Inter 700, `clamp(1.75rem, 4vw, 3rem)`, tracking `-0.02em`, line-height `1.1`.
- **Body**: Inter 400, 16px base, line-height 1.6.
- **Eyebrow labels**: Inter 500, 10–12px, uppercase, `letter-spacing: 0.12em`, color `--text-disabled`.
- **Buttons/labels**: Inter 500–600.

### 1.2 Colour System
Existing tokens are **unchanged**:
| Token | Value | Role |
|---|---|---|
| `--brand` | `#6c44f6` | Primary purple |
| `--brand-hover` | `#5b38d4` | Hover |
| `--text-1` | `#11172c` | Near-black navy |
| `--text-2` | `#4b556b` | Body copy |
| `--text-muted` | `#bdb7d0` | Secondary |
| `--text-disabled` | `#b7b8ba` | Eyebrows/captions |
| `--border` | `#f0edfa` | Card borders |

**Landing-page-only change**: page background shifts from `--page-bg` (`#f2f3ff` lavender) to pure white (`#ffffff`). The `<LiquidBackground>` aurora blobs remain; they read as more vivid against white. Interior app pages keep `#f2f3ff`.

### 1.3 Motion Language
- **Existing easing preserved**: `--ease-premium: cubic-bezier(0.22, 1, 0.36, 1)`.
- **New animation — `strokeDraw`**: a `::after` pseudo-element (or `motion.span`) that animates `scaleX(0 → 1)` from `transform-origin: left center`, 800ms, `ease-out`. Applied to: (a) the hero keyword `Run`, (b) icon ring on mission card hover. See §4 and §5.
- **Reduced-motion**: `prefers-reduced-motion` disables `strokeDraw`, hero glow, gradient drift, live pulse — same as existing.
- **Durations**: micro-interactions 150–200ms; content reveals 600–850ms; timeline loop 12s; aurora loops 30–42s unchanged.

### 1.4 Icons
Use Lucide React (already in `package.json`). No emoji as icons. SVG only.

---

## 2. Welcome Splash

**File**: `components/ui/WelcomeSplash.tsx` — minimal change only.

- Text: `welcome` → `Larry` (with capital L — it's the brand name).
- Typography: Inter 300, `letterSpacing: 0.45em`, `fontSize: clamp(1.75rem, 4vw, 3.5rem)`, color `#8b5cf6`.
- All other behaviour (2s hold, 1s fade, click-to-skip, `aria-hidden`) unchanged.

---

## 3. Navbar

**File**: `components/layout/Navbar.tsx`

### 3.1 Centre links
Replace existing four anchors with three:
| Label | Destination | Type |
|---|---|---|
| Mission | `#mission` | In-page smooth scroll |
| Pricing | `/pricing` | Next.js `<Link>` (new page) |
| Careers | `/careers` | Next.js `<Link>` (new page) |

IntersectionObserver active-section tracking: update tracked section IDs to `["mission", "solution", "differentiator", "audience"]` (keeping sub-section tracking but only Mission in the nav).

### 3.2 Right cluster (desktop, left→right)
1. **Sign in** — text link only (`--text-muted` base, `--text-1` hover). Routes to `/login`. Replaces "Log in".
2. **Book an intro** — `<Button variant="secondary" size="sm">`. Fires `useOverlayTrigger("intro")`. Replaces nothing (new).
3. **Join Waitlist** — `<LiquidButton size="sm">`. Fires `useOverlayTrigger("waitlist")`. Unchanged.

Visual hierarchy: Sign in (text) < Book an intro (outlined) < Join Waitlist (filled). Three items fit comfortably at `max-w-6xl`.

### 3.3 Mobile dropdown
Same order: Mission · Pricing · Careers links, then Sign in, then Book an intro (full-width outlined), then Join Waitlist (full-width filled).

### 3.4 Logo
`/Larryfulllogo.png` stays. No change.

---

## 4. Hero Section

**File**: `components/sections/HeroSection.tsx` — significant rewrite.

### 4.1 Eyebrow
```
AI-POWERED AUTONOMOUS EXECUTION
```
Rendered as a small `<span>`: rounded-full, 1px `--border`, `--surface-2` background, `--text-disabled` color, 11px uppercase, `letter-spacing: 0.1em`, padding `4px 12px`. Centred above H1. Fade-up entrance at delay 0.

### 4.2 Headline
```
Making Projects Run Themselves.
```
Inter 800, `clamp(2.5rem, 8vw, 5rem)`, tracking `-0.04em`, line-height 1.0, `--text-1`. Centred, `max-w-4xl`.

The word **`Run`** wraps in `<span class="hero-keyword">` with a `::after` or `<motion.span>` underline child:
- Width: `100%` of the word, height 3px, `background: #6c44f6`, border-radius 2px.
- On mount: `scaleX: 0 → 1`, `transform-origin: left`, 800ms, `ease-out`, delay 600ms (after headline fades in).
- `prefers-reduced-motion`: underline renders at full width immediately (no animation).

`<BlurReveal delay={0}>` wraps the heading (existing entrance pattern preserved).

### 4.3 Subtitle
```
Larry connects to your existing tools and owns the execution layer —
follow-ups, escalations, and status updates happen automatically.
```
Inter 400, 18px, `--text-2`, `max-w-2xl`, centred. Framer Motion entrance at delay 0.1s.

### 4.4 CTA row
- `<LiquidButton size="lg">` → "Join the Waitlist" (fires `useOverlayTrigger("waitlist")`)
- `<Button variant="secondary" size="lg">` → "Book an intro" (fires `useOverlayTrigger("intro")`)
- Stacked full-width mobile, inline `sm+`. Entrance at delay 0.2s.

### 4.5 Ambient radial wash + warm fade at bottom
Keep exactly as-is (§4.1 and §4.2 of the existing report).

### 4.6 Remove hero product mockup
The browser-chrome faux screenshot (`§4.4` of existing report) is **removed**. Replaced by `<ExecutionTimeline>` (§4.7). This is the primary hero visual.

### 4.7 `<ExecutionTimeline>` — new component

**File**: `components/ui/ExecutionTimeline.tsx`

Full-width strip, `min-height: 200px` (mobile `160px`), rounded-2xl, 1px `--border`, background `rgba(248,247,255,0.8)`, `backdrop-blur-sm`. Entrance: `opacity 0 → 1`, `y 24 → 0`, 920ms, 400ms delay (mirrors removed mockup timing).

**Structure**:
- Header bar (32px): left — small brand-purple 14×14 square with white `L` glyph + `LARRY — LIVE` eyebrow label; right — `"3 projects active"` in `--text-disabled`.
- Three lanes, each 48px tall with a left label (10px uppercase `--text-disabled`): `ALPHA LAUNCH`, `Q3 PROGRAMME`, `PLATFORM MIGRATION`.
- Each lane contains animated task bars (`motion.div`) and a thin lane separator (1px `--border`).

**Animation choreography** (12s loop, `repeat: Infinity`):
```
t=0s    Alpha: "Deliverables" bar appears at 20% position, width 0→35%, amber (in-progress)
t=1s    Q3: "Engineering sign-off" bar appears at 10%, width 0→25%, amber
t=2s    Notification floats in at top: "Reminder sent → @Morgan" (fade+y, 500ms, then fades out at t=3.5s)
t=3s    Alpha: "Deliverables" bar turns emerald (complete), checkmark appears
t=4s    Platform: "API handoff" bar appears at 5%, width 0→15%, red (overdue, pulse animation)
t=4.5s  Notification: "Risk flagged: API handoff 2d overdue" (amber dot, red text)
t=6s    Q3: "Engineering sign-off" bar turns emerald
t=7s    Platform: "API handoff" turns amber (escalated, no longer overdue pulse)
t=8s    Notification: "Exec summary compiled — ready for review" (brand-purple dot)
t=9s    Alpha: second bar appears "Stakeholder update" at 60%, width 0→30%, amber
t=10s   All bars hold steady (clean order visible)
t=12s   Fade out entire timeline (opacity 0.3) then loop restarts
```

Notification bubbles: `position: absolute; top: 8px; right: 16px`, white card with 1px `--border`, 10px text, a 6px dot (colour-coded), `z-index: 10`. Entrance `y: -8 → 0, opacity 0 → 1`, exit `opacity 0`, 400ms transitions.

`prefers-reduced-motion`: render a static snapshot at `t=10s` (all bars in steady state, no notifications).

---

## 5. Mission Section

**File**: `components/sections/MissionSection.tsx` — new file, replaces `UseCasesSection.tsx` as the second narrative section.

`id="mission"` (nav anchor). 48px vertical padding (96px `sm+`). Background white.

**Eyebrow**: `WHAT LARRY DOES`

**H2** (max-w-4xl, centred):
```
Making projects run themselves by aligning stakeholders, timelines, and work
through autonomous execution — so teams focus on outcomes, not updates.
```

**5 cards** grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`. Equal columns on lg, max-w-7xl.

| # | Lucide Icon | Title | Body |
|---|---|---|---|
| 1 | `Waypoints` | Alignment | Aligns stakeholders, timelines, and work across fragmented systems, tools, and individuals |
| 2 | `Database` | Source of Truth | Creates a real-time, single source of truth for all work |
| 3 | `Link2` | Coordination | Eliminates manual coordination and constant status chasing |
| 4 | `Zap` | Autonomous Execution | Automatically executes actions end-to-end |
| 5 | `BrainCircuit` | Project Context | Maintains full project knowledge and delivers instant responses |

**Card anatomy**: white, 1px `--border`, `--radius-card` (12px), padding `24px 20px`.
- Icon container: 32×32, `background: rgba(108,68,246,0.08)`, rounded-lg, icon at 18px in `--brand`.
- Title: Inter 600, 15px, `--text-1`, margin-top 16px.
- Body: Inter 400, 13px, `--text-2`, margin-top 8px, line-height 1.5.

**Hover state**: transition 200ms.
- Card: `--shadow-2` elevation (from `--shadow-1`).
- Icon: `scale(1.08)`.
- Icon container: a 1.5px `--brand` ring draws around it via `strokeDraw` (`scaleX 0→1` on a `::after` pseudo, width override to `border-width`). Use `box-shadow: 0 0 0 2px #6c44f6` transition instead of `scaleX` (simpler, same effect for a square container).

**Entrance**: `<StaggerContainer>` wrapping all 5 cards. `<StaggerItem>` per card, 100ms stagger, `whileInView`, once, margin `-80px`.

---

## 6. LogoBar + Logo Carousel

**LogoBar** (`components/sections/LogoBar.tsx`) — update industry list only:

Change: `Consulting · IT Services · Engineering · Financial Services · SaaS`  
To: `Consulting · IT Services · Engineering · Construction and Infrastructure · Energy and Renewables · SaaS`

Provenance copy ("Designed by operators with backgrounds in…") unchanged.

**ClientLogos** (`components/sections/ClientLogos.tsx`) — no changes. Keep exactly.

---

## 7. Comparison Section

**File**: `components/sections/ComparisonSection.tsx` — replaces `UseCasesSection.tsx`.

Section bg `#F2F2EF`. 48px/96px padding. 1px top `--border`.

**Eyebrow**: `THE DIFFERENCE`  
**H2**: `"Where execution breaks down."`

**Two cards, `lg:grid-cols-2`**, each `position: relative; overflow: hidden`.

### Left card — "Without Larry"
White card, rounded-2xl, `--shadow-1`. Content:
- Header: `WITHOUT LARRY` (10px uppercase `--text-disabled`) + `"Today's reality"` subtitle.
- 4 pain points with `—` dash icons (existing style).
- Inset panel: "Critical information is scattered across: Slack · Tickets · Meetings · Inboxes"

**Hover overlay** (`position: absolute; inset: 0; z-index: 10`):
- Background: `#1a1a0e` at 90% opacity.
- Content: a JSX "chaos" simulation — 4 Slack-message-style rows at `rotate(±2–4deg)`, overlapping, a `"⚠ 3 OVERDUE"` red badge, a spinning loader icon (`animate-spin`). All white text at reduced opacity. Feels like looking into the mess.
- Transition: `opacity 0 → 1`, 280ms, `--ease-premium`. Triggered by `onMouseEnter` / `onMouseLeave` on the card.
- `pointer-events: none` on the overlay itself so hover remains stable.

### Right card — "With Larry"
Dark card (`bg-[--text-1]`). Content: same as existing "consequences" card but repurposed for the "WITH LARRY" side:
- Header: `WITH LARRY` (10px uppercase `--text-disabled`) + `"Autonomous execution"` subtitle.
- 4 outcomes with chevron icons.
- Inset: "Automatically aligns stakeholders, timelines, and tools. Teams focus on outcomes, not updates."

**Hover overlay**:
- Background: `rgba(248,247,255,0.97)`.
- Content: the clean Larry miniature dashboard — three task rows (Done/Pending/Overdue) in `--text-1` on white cards, "Larry is active" dot pulsing. Styled identically to the hero mockup inner panel.
- Transition: same 280ms fade.

**Closing banner** (below cards, full-width white elevated): keep existing two-liner — `"This is not a tracking problem."` + `"It's an execution gap."`

---

## 8. How It Works

**File**: `components/sections/FeaturesSection.tsx` — copy changes only. Structure unchanged.

**H2**: `"Project management that runs itself."`

**Steps** (copy only):
- 01 Connect — "Integrates with Teams, email, Slack and your existing stack of tools — no migration, no new process."
- 02 Capture — "Extracts actions, owners, and deadlines from emails, ticket comments, and meeting notes automatically."
- 03 Execute — "Creates tasks, sends reminders, escalates blockers, and updates status based on real activity — without you asking."
- 04 Report — "Compiles standups, proactively flags risks, and surfaces key insights for leadership to ensure timely execution and delivery."

Capability panel copy unchanged.

---

## 9. Why This Is Different

**File**: `components/sections/VibeSection.tsx` — no changes. Keep exactly.

---

## 10. Who It's For + Industries

**File**: `components/sections/WhoItsForSection.tsx` — significant simplification.

`id="audience"`

**H2**: `"Built for the people who own project management and execution."`

**Sub**: remove. No subtitle.

**Roles grid** (`grid-cols-2 sm:grid-cols-3`): 6 cards, role name only. No descriptions.

| Role |
|---|
| Project Managers |
| PMO Leads |
| Consultants and Professional Services Teams |
| Operations and Delivery Leaders |
| Engineering and Technical Leaders |
| CTOs & COOs |

Card style: white, 1px `--border`, rounded-xl, padding `20px 24px`. Role name: Inter 500, 15px, `--text-1`, centred. No icon. No body copy. Hover: `--shadow-1` elevation.

**Remove** the large primary role cards entirely. Remove secondary role card descriptions.

**Industries** (same section, below a 1px `--border` divider):
- Eyebrow: `BUILT FOR TEAMS IN`
- Flex-wrap row of industry pill badges: `Consulting · IT Services · Engineering · Construction and Infrastructure · Energy and Renewables · SaaS`
- Pill style: rounded-full, 1px `--border`, `--surface-2` bg, `--text-2` color, Inter 500 13px, padding `6px 16px`.

---

## 11. ROI Section

**File**: `components/sections/ROISection.tsx` — no changes. Keep exactly.

---

## 12. Dark CTA Section

**File**: `components/sections/CTASection.tsx` — one copy change.

Secondary CTA: label changes from `"Speak to the Founders"` → `"Book an intro"`. The `onClick` fires `useOverlayTrigger("intro")` instead of `useOverlayTrigger("founders")`.

All other design and H2 copy unchanged.

---

## 13. Footer

**File**: `components/layout/Footer.tsx` — link list update only.

Product links column changes from `[How It Works, Why Larry, Who It's For, Pricing]` to `[Mission, Pricing, Careers]` with correct hrefs (`#mission`, `/pricing`, `/careers`).

Everything else unchanged.

---

## 14. `<LiquidOverlay>` / `<OverlayManager>` — new `"intro"` type

**File**: `components/ui/LiquidOverlay.tsx`

Add `"intro"` as a valid overlay type alongside `"waitlist"` and `"founders"`.

The existing `"founders"` overlay (`<FounderContact>`) remains in the codebase but is no longer wired to any CTA on the public pages (the "Speak to the Founders" button is replaced). It can be removed in a follow-up cleanup.

---

## 15. `<IntroForm>` — new component

**File**: `components/ui/IntroForm.tsx`

Rendered inside `<LiquidOverlay type="intro">`.

**Header**:
- Eyebrow: `EARLY ACCESS`
- H2: `"Book an intro"`
- Subtitle: `"Tell us about your team and we'll reach out to arrange a call."`

**Fields** (all required unless noted):
| Field | Input type | autoComplete |
|---|---|---|
| First name | text | given-name |
| Last name | text | family-name |
| Email | email | email |
| Company name | text | organization |
| Job title | text | organization-title |
| Comment | textarea (4 rows, optional) | off |

Plus:
- Marketing comms checkbox: `"I agree to receive updates from Larry"` (optional).
- Privacy policy acknowledgment: `"By submitting you agree to our Privacy Policy"` — inline link `href="#"` for now (no `/privacy` page exists; placeholder is intentional and acceptable for launch).

**Validation** (same pattern as `<WaitlistForm>`):
- Empty required fields → `"Required"`.
- Email → `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Textarea: 1000 char cap.

**Submit**: POST `/api/intro`. Status machine: `idle → submitting → success | error`.
- Submitting: spinner + disabled + 60% opacity.
- Success: scale-in card, purple tick circle, `"Request received."`, subtitle `"We'll be in touch shortly."`.
- Error: red error `<p>` slides in below form.

**Footer fine print**: `"No spam. We'll use your details only to follow up on your intro request."`

---

## 16. `/api/intro` — new API route

**File**: `apps/web/src/app/api/intro/route.ts`

```
POST /api/intro
Body: { firstName, lastName, email, company, jobTitle, comment?, marketingConsent }
```

**Flow**:
1. Parse and validate with Zod.
2. Rate-limit: 3 requests per IP per hour (same Redis pattern as `/api/founder-contact`).
3. Send via Resend to `anna.wigrena@gmail.com` with subject: `"Larry intro request — {firstName} {lastName} ({company})"`.
4. Email body: structured HTML showing all fields.
5. Return `{ success: true }` or appropriate error.

**Environment variable needed**: none new — reuses existing `RESEND_API_KEY`. The `from:` address must use the existing verified Resend sender. Check `apps/web/src/app/api/founder-contact/route.ts` to find the current `from` value and reuse it exactly — do not introduce a new sender address.

---

## 17. `/pricing` — new page

**File**: `apps/web/src/app/pricing/page.tsx`

Single-viewport centred layout. Uses `<Navbar>` and `<Footer>` from layout.

```
[Eyebrow]  PRICING
[H1]       Get pricing tailored to your needs.
[Sub]      Book an intro call and we'll walk you through it.
[CTA]      <LiquidButton size="lg"> Book an intro </LiquidButton>
```

Background: white. Subtle `radial-gradient(ellipse 50% 40% at 50% 110%, rgba(108,68,246,0.10) 0%, transparent 70%)` floor glow (mirrors dark CTA section's glow, but light). CTA fires `useOverlayTrigger("intro")`.

The `<OverlayManager>` must be mounted on this page too (add it to the page layout or move it to the root layout).

---

## 18. `/careers` — new page

**File**: `apps/web/src/app/careers/page.tsx`

Uses `<Navbar>` and `<Footer>`.

**Top band** (40vh, `position: relative`, `overflow: hidden`, `background: #11172c`):
- Fluid "L" mark (`/Larry_logos.png` — the vertical stacked version) at ~50% opacity, centred, large (300px), `object-contain`. Acts as a dramatic decorative backdrop.
- Over it: `<h1>` text `"Build the next era of project execution."` — Inter 800, `clamp(2rem, 5vw, 4rem)`, white, `text-shadow: 0 2px 20px rgba(0,0,0,0.4)`, centred.

**Body section** (white, 64px padding, `max-w-4xl` centred):
- Body text (Inter 400, 18px, `--text-2`, `max-w-2xl`):
  ```
  We don't hire for fixed team roles. Instead, we look for exceptional 
  engineers and brilliant people with strong skillsets and character. 
  Join the founding team and help shape the future of how work gets done.
  ```
- Empty row (48px spacer).
- Contact line: `"Reach out via email"` — Inter 500, 16px, `--text-muted`. The word `"email"` is an `<a href="mailto:anna.wigrena@gmail.com">` styled in `--brand`, hover `--brand-hover`, underline on hover.

**Coin seal**: Build a clean inline SVG coin seal component `<LarrySeal />`:
- 80×80px SVG circle, 1.5px stroke in `#6c44f6`.
- Top arc text: `LARRY` (SVG `<textPath>`).
- Centre: a simple `*` or `◆` ornament.
- Bottom arc text: `EST. 2024`.
- Used here in the body section (right side of a 2-col layout on `lg+`), and at small size (48px) in the Footer.

---

## 19. Page Composition (`page.tsx`)

Update section order:

```
<OverlayManager>           — moved to layout.tsx; includes "intro" type
<WelcomeSplash>            — "Larry" text (not "welcome")
<LiquidBackground>         — unchanged
<Navbar>                   — Mission / Pricing / Careers + Sign in / Book an intro / Join Waitlist
<main>
  <HeroSection>            — new headline, strokeDraw, ExecutionTimeline, no mockup
  <MissionSection>         — NEW: 5 mission cards, id="mission"
  <LogoBar>                — industry list updated; provenance copy unchanged
  <ClientLogos>            — unchanged
  <ComparisonSection>      — NEW: hover-reveal chaos vs order; slots where UseCasesSection was
  <FeaturesSection>        — copy changes only; id="solution" unchanged
  <VibeSection>            — unchanged; id="differentiator" unchanged
  <TemplatesSection>       — unchanged
  <ROISection>             — unchanged
  <WhoItsForSection>       — simplified role cards + industries; id="audience" unchanged
  <CTASection>             — "Book an intro" CTA; id="pricing" unchanged
</main>
<Footer>                   — Mission / Pricing / Careers links
```

`UseCasesSection.tsx` is no longer imported but kept in the file system (safe delete in a follow-up).

---

## 20. `<OverlayManager>` — mount on non-home pages

`<OverlayManager>` is currently only in `page.tsx`. The `/pricing` and `/careers` pages also need it so that "Book an intro" CTAs work. Options:
- Move `<OverlayManager>` into `layout.tsx` (cleanest — available everywhere).
- Or duplicate it per page (simple but repetitive).

**Decision**: move to `layout.tsx`. Confirm no side effects (it's stateless until an `overlay:open` event fires, so it's safe at the root).

---

## 21. Accessibility

All new interactive elements follow existing patterns:
- `role="dialog"` + `aria-modal="true"` on `<IntroForm>` overlay (inherited from `<LiquidOverlay>`).
- `aria-label` on close button, focused on mount.
- Checkbox: `<label htmlFor>` pairing, explicit `id`.
- Textarea: `<label>`, `aria-describedby` for character count hint if shown.
- Comparison card hover overlays: `aria-hidden="true"` (decorative; screen reader reads the card content below).
- `<ExecutionTimeline>`: `aria-label="Larry execution activity feed"`, `aria-live="off"` (it's ambient decoration, not content updates).
- Coin seal SVG: `aria-hidden="true"` (decorative).
- `/pricing` and `/careers` pages: `<h1>` present, landmark roles, standard Next.js `<Link>` routing.

---

## 22. New Files Summary

| File | Type |
|---|---|
| `components/ui/ExecutionTimeline.tsx` | New component |
| `components/ui/IntroForm.tsx` | New component |
| `components/ui/LarrySeal.tsx` | New component (SVG coin seal) |
| `components/sections/MissionSection.tsx` | New component |
| `components/sections/ComparisonSection.tsx` | New component (fills the slot previously occupied by UseCasesSection in the DOM order; `UseCasesSection.tsx` is kept in FS, not deleted yet) |
| `app/pricing/page.tsx` | New page |
| `app/careers/page.tsx` | New page |
| `app/api/intro/route.ts` | New API route |

## 23. Modified Files Summary

| File | Change |
|---|---|
| `app/page.tsx` | Section order, new imports, remove hero mockup |
| `app/layout.tsx` | Inter font, OverlayManager moved here |
| `globals.css` | Font var rename, landing-page body bg to white |
| `components/layout/Navbar.tsx` | New links + right cluster |
| `components/layout/Footer.tsx` | Link list update |
| `components/sections/LogoBar.tsx` | Industry list copy change only |
| `components/ui/WelcomeSplash.tsx` | Text change only |
| `components/ui/LiquidOverlay.tsx` | Add "intro" type |
| `components/ui/OverlayManager.tsx` | Add "intro" → IntroForm routing |
| `components/sections/HeroSection.tsx` | Full rewrite (new headline, strokeDraw, ExecutionTimeline) |
| `components/sections/FeaturesSection.tsx` | Copy changes only |
| `components/sections/WhoItsForSection.tsx` | Simplification + industries |
| `components/sections/CTASection.tsx` | Secondary CTA label + trigger |
