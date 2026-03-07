This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Mobile Implementation Notes

### Breakpoints
Tailwind CSS v4 with mobile-first approach. Breakpoints in use:
- Default (≥0px): mobile styles — single-column layouts, smaller fonts, reduced padding
- `sm` (≥640px): tablet portrait — two-column grids, larger type
- `md` (≥768px): tablet landscape — desktop nav visible, full layouts
- `lg` (≥1024px): desktop — max-width containers, multi-column grids

### Mobile Navigation
- Below `md` (768px): hamburger button appears in the top-right of the navbar pill
- Tapping hamburger opens an animated dropdown with all nav links + Log in + Join Waitlist CTA
- Closes on: link click, ESC key, click outside the header
- The "Join the Waitlist" CTA always remains visible in the pill on all screen sizes

### Key mobile changes
| File | Change |
|------|--------|
| `Navbar.tsx` | Added hamburger menu with AnimatePresence dropdown |
| `VibeSection.tsx` | Comparison table replaced with a checklist on mobile (< md), full table on desktop |
| `HeroSection.tsx` | h1 reduced to `text-[2.25rem]` on mobile, top padding reduced |
| `CTASection.tsx` | h2 reduced to `text-3xl` on mobile |
| `LiquidOverlay.tsx` | Modal padding tightened on mobile (`p-5 sm:p-8`) |
| `ROICalculator.tsx` | Card padding tightened on mobile |
| All sections | `py-24` → `py-16 sm:py-24`; card `p-8` → `p-5 sm:p-8` |
| `globals.css` | Added `overflow-x: hidden` on body |
| `layout.tsx` | Added explicit viewport meta |

### How to test mobile locally
1. Run `npm run dev` → open http://localhost:3000
2. Open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M)
3. Test at these widths:
   - **320px** — smallest phones (iPhone SE): no horizontal scroll, nav usable, text readable
   - **375px** — iPhone 14 standard
   - **414px** — iPhone 14 Plus / Pro Max
   - **768px** — iPad portrait (breakpoint where desktop nav appears)
4. Pages to verify: `/` (all sections), `/admin`
5. Check: hamburger opens/closes, all CTAs tappable, forms usable, no horizontal scroll

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
