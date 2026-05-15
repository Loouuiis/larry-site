# Landing page — mobile responsive design

**Date:** 2026-05-16
**Author:** Fergus + Claude
**Status:** Approved, in implementation

## Problem

The marketing landing on `larry-pm.com` is desktop-first. On a phone browser:

- Navbar middle links (Solution / Pricing / Career) vanish entirely at <820px with no hamburger replacement; the remaining CTAs (Sign in / Book a demo / Join Waitlist) overflow the pill.
- Hero `bars-stage` contains 5×5 bars whose inline JS widths (`120–320px`) overflow a 311px-wide phone canvas (only saved from horizontal scroll by `.landing-anna { overflow-x: hidden }`, which means bars get clipped).
- Below 820px many grids stay at 2 columns (`.boxes-5`, `.howit__steps`, `.roles`), giving ~150px-wide cards on a 375px phone.
- `.compare-card h3` uses `white-space: nowrap`, so "Work without Larry" overflows.
- Various section paddings (110–130px vertical) and font sizes (88px topmark, 64px contact L, 24px compare h3) are sized for desktop.

Sub-pages `/careers` and `/book-a-demo` have their own `@media (max-width: 900px)` blocks for `.reachpage`/`.formpage` and are *mostly* OK below 768px — they only inherit the broken `landing-anna/Navbar`. `/pricing` already uses the responsive `layout/Navbar` and Tailwind utilities; out of scope.

## Goal

A landing experience that **looks intentional** on a phone — same brand identity and visual language, but readable, tap-friendly, and with no overflow or vanishing nav.

**Out of scope:** desktop styling (must not regress), `/login`, `/workspace`, admin pages.

## Approach

**Strictly additive mobile-only CSS.** Do not modify the existing desktop rules. Add new mobile breakpoint blocks and extend the existing `@media (max-width: 820px)` block where it already exists.

**One JS change:** add a hamburger drawer to `landing-anna/Navbar.tsx`. This also benefits `/careers` and `/book-a-demo` (they share the Navbar).

## Breakpoints

| Breakpoint | Purpose | Status |
| --- | --- | --- |
| `≤ 1100px` | Coarse tablet: drop dense 5-col grids to 3 | Already exists — keep |
| `≤ 900px` | `.formpage` / `.reachpage` single-column | Already exists — keep |
| `≤ 820px` | Hide nav links (now: show hamburger), stack `.compare__grid` / `.pcs__inner` / `.footer__inner`, drop `.boxes-5` to 2 cols, `.roles` to 2 cols, `.bars-stage` to 280px | Already exists — extend |
| `≤ 600px` | New — phone column. Drop all multi-column grids to 1 col. Hide decorative `.bars-stage`. Shrink topmark / hero-marquee / contact display type. Tighten section padding. | **New** |
| `≤ 380px` | New — cramped phones. Smaller chip padding, tighter CTA padding. | **New** |

## Per-section behaviour

### Navbar (drawer)

- New element: hamburger button (`button.nav__burger`), visible only `≤ 820px`. 44×44px tap target. Icon swaps `☰` ↔ `✕` on toggle.
- New element: `.nav__drawer` — full-width panel rendered just below the navbar pill, positioned `fixed`, slides down from above with a small `transform/opacity` transition (CSS only — no framer-motion dependency).
- Drawer contents: three section links (Solution / Pricing / Career, respecting `basePath`), divider, Sign in, Book a demo. The "Join Waitlist" CTA stays pinned in the navbar pill on mobile (primary conversion path stays one tap away).
- Close behaviour: link click, Esc key, click outside, route change.
- Body scroll lock while open (`document.body.style.overflow = 'hidden'`).
- Accessibility: `aria-expanded`, `aria-controls`, `aria-label`, `role="dialog"`, focus stays within button while closed (the drawer's own links handle focus when open).

### Hero (≤600px)

- `.hero` padding `90px 0 40px` (was `120px 0 70px`).
- `.hero__marquee-track > span` font-size `clamp(40px, 12vw, 140px)` (was `clamp(54px, 9vw, 140px)`) so it scales smaller on phones.
- `.hero__sub` font-size `15px` (was `17px`).
- `.bars-stage { display: none; }` — the bars are decorative and the inline-width JS will not look right at phone widths. Replaced visually by the marquee already doing the heavy lifting.

### Mission (≤600px)

- `.mission__topmark .L` font-size `56px` (was `88px`).
- `.mission h2` font-size scales via existing `clamp(30px, 4vw, 52px)` → 30px on phone. Fine.
- `.boxes-5` → `grid-template-columns: 1fr`. Gap `12px`. Reduces from 2 cols at the 820px breakpoint to 1 col here.

### Compare (≤600px)

- `.compare-card { padding: 28px 22px 30px; min-height: auto; }`
- `.compare-card h3 { white-space: normal; font-size: 20px; }`
- `.compare__list li { font-size: 13.5px; }`

### How it works (≤600px)

- `.howit__l` font-size `56px` (was `82px`).
- `.howit__steps` → `grid-template-columns: 1fr`.

### Audience (≤600px)

- `.roles` → `grid-template-columns: 1fr`. Existing 820px block sets 2-col.
- `.chip` padding `8px 14px` font-size `13.5px`.

### PCS — Careers / Pricing slots (≤600px)

- `.pcs` padding `70px 18px` (was `90px 24px`).
- `.pcs h2` already `clamp(34px, 4.4vw, 56px)` → 34px. Fine.
- Careers `.pcs__inner` already drops to 1-col at 820px. `.trojan` aspect-ratio stays 4/3 — fine.

### Contact (≤600px)

- `.contact` padding `90px 18px 100px`.
- `.contact__L` font-size `44px`.
- `.contact__bar` padding `4px 4px 4px 18px`, font-size `14px`.

### Footer (≤600px)

- Already stacks at 820px. Add: `.footer__bottom { flex-direction: column; gap: 6px; align-items: center; text-align: center; }`.

### Section padding (≤600px, applies to all `.section`)

- `.section { padding: 70px 18px; }` (was `110px 24px`).

## Files touched

1. `apps/web/src/components/landing-anna/Navbar.tsx` — add hamburger button, drawer JSX, state hooks.
2. `apps/web/src/styles/landing-anna.css` — append mobile media-query blocks. Extend existing `@media (max-width: 820px)` block to show hamburger and add overflow/`align-items` fixes to the nav pill.

## Risk + verification

- **Desktop regression risk:** mitigated by additive-only changes inside media queries; existing rules untouched. Desktop QA at ≥1280px after deploy.
- **Drawer scroll-lock risk:** Body scroll restored on unmount and on close. Verified via toggle + Esc + route change.
- **JS hydration:** Navbar is already a client component (`"use client"`). No SSR concerns.
- **Verification on prod (Vercel preview deploy):**
  - 375×812 (iPhone 13/14 portrait): home, careers, book-a-demo
  - 414×896 (iPhone Plus): home
  - 768×1024 (iPad portrait): home
  - 1280×800 (desktop sanity): home
  - Drawer open/close, link nav, scroll lock release
- Playwright MCP for the mobile viewports; standard browser for the desktop check.

## Non-goals

- Redesigning the desktop landing.
- Changing copy or imagery.
- Touching `/login`, `/workspace`, `/admin`, `/pricing`, `/preview`, `/dashboard`.
- Adding framer-motion or any new dependency.
