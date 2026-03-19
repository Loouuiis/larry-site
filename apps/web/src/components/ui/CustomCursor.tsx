"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HoverTarget {
  rect: DOMRect;
}

// Premium easing — weighted, deliberate, not bouncy
const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * CustomCursor
 *
 * Two distinct states:
 *
 *   DEFAULT — 7px solid dark dot, tracked via RAF lerp.
 *   The SVG goo filter (feGaussianBlur + feColorMatrix) is applied to the
 *   cursor element itself, giving the dot crisper, more "physical" edges than
 *   plain CSS antialiasing. It reads as weight — not decoration.
 *
 *   LIQUID HOVER — cursor grows to a 28px transparent ring (1.5px solid brand-
 *   green border). The dot-to-ring transition IS the merge moment: the cursor's
 *   filled centre opens as it aligns with the button's surface, like two liquid
 *   surfaces making contact. The ring's hollow interior leaves button text
 *   fully readable at all times.
 *
 * Why a ring, not a blob:
 *   A filled blob at z:9999 sits on top of button text — unacceptable in
 *   enterprise UI. A ring is a presence, not an obstruction. It marks the
 *   contact point without dominating it.
 *
 * Why the goo filter on the dot only:
 *   The filter amplifies and thresholds alpha (via feColorMatrix), producing a
 *   crisper boundary than CSS antialiasing alone. Applied to the solid dot, it
 *   makes expansion feel like a drop of liquid swelling — not a div resizing.
 *   Removed for the ring state so the filter doesn't flood the hollow interior.
 *
 * Performance:
 *   - Position via RAF + direct style mutation (zero React re-renders per frame)
 *   - Scale / colour via Framer Motion (GPU composited, no layout)
 *   - Magnetic pull computed in the RAF loop — no separate event listener
 *   - Disabled entirely on coarse-pointer (touch) devices
 */
export function CustomCursor() {
  const pathname = usePathname();
  const isDashboardRoute = pathname?.startsWith("/dashboard") ?? false;
  const [isVisible, setIsVisible] = useState(false);
  const [isGenericHover, setIsGenericHover] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);

  // Raw mouse coords — updated in event listener, read in RAF
  const mouseX = useRef(-200);
  const mouseY = useRef(-200);

  // DOM ref for the position wrapper (RAF target)
  const outerRef = useRef<HTMLDivElement>(null);

  // Ref mirrors of state — readable in RAF without closure stale values
  const hoverRef = useRef<HoverTarget | null>(null);
  const visRef = useRef(false);
  const genericRef = useRef(false);

  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isDashboardRoute) {
      document.body.classList.remove("cursor-enabled");
      return;
    }

    // Respect touch devices — native cursor is appropriate there
    if (window.matchMedia("(pointer: coarse)").matches) {
      document.body.classList.remove("cursor-enabled");
      return;
    }

    document.body.classList.add("cursor-enabled");

    // ── Event listeners ───────────────────────────────────────────────────

    const onMove = (e: MouseEvent) => {
      mouseX.current = e.clientX;
      mouseY.current = e.clientY;
      if (!visRef.current) {
        visRef.current = true;
        setIsVisible(true);
      }
    };

    const onLeave = () => {
      visRef.current = false;
      setIsVisible(false);
    };

    // Generic hover: any interactive element (expands dot to 14px)
    const onOver = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const is = !!el.closest(
        "a, button, [role='button'], input, textarea, select, label"
      );
      if (is !== genericRef.current) {
        genericRef.current = is;
        setIsGenericHover(is);
      }
    };

    // Liquid hover: only LiquidButton dispatches these
    const onLiquidEnter = (e: Event) => {
      const detail = (e as CustomEvent<HoverTarget>).detail;
      hoverRef.current = detail;
      setHoverTarget(detail);
    };

    const onLiquidLeave = () => {
      hoverRef.current = null;
      setHoverTarget(null);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("liquid:enter", onLiquidEnter);
    document.addEventListener("liquid:leave", onLiquidLeave);

    // ── RAF tracking loop ─────────────────────────────────────────────────

    const tick = () => {
      const target = hoverRef.current;
      let tx = mouseX.current;
      let ty = mouseY.current;

      // Magnetic pull: when inside a LiquidButton, the cursor is biased
      // toward the button centre by up to 5px. Creates a subtle "stickiness"
      // that makes the cursor feel anchored to the surface — not just floating.
      if (target) {
        const cx = target.rect.left + target.rect.width / 2;
        const cy = target.rect.top + target.rect.height / 2;
        const dx = cx - tx;
        const dy = cy - ty;
        const dist = Math.hypot(dx, dy);
        const maxPull = 5; // px — beyond this and it would feel wrong
        const pullZone = 80;
        const strength = Math.max(0, 1 - dist / pullZone);
        if (dist > 0.5) {
          tx += (dx / dist) * strength * maxPull;
          ty += (dy / dist) * strength * maxPull;
        }
      }

      if (outerRef.current) {
        // 1:1 tracking — position written directly from mouse coords each frame.
        // No lerp. No trailing. The cursor is exactly where the pointer is.
        outerRef.current.style.transform = `translate(${tx}px, ${ty}px) translateZ(0)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("liquid:enter", onLiquidEnter);
      document.removeEventListener("liquid:leave", onLiquidLeave);
      document.body.classList.remove("cursor-enabled");
    };
  }, [isDashboardRoute]);

  if (isDashboardRoute) return null;

  const isLiquidHover = !!hoverTarget;

  // ── Cursor sizing ──────────────────────────────────────────────────────────
  // Scale is applied to a fixed 36px container, giving three visual sizes:
  //   0.28 × 36 = ~10px  (default dot — more legible than the previous 7px)
  //   0.50 × 36 =  18px  (over any interactive element)
  //   1.00 × 36 =  36px  (liquid button — ring state)
  const scale = isLiquidHover ? 1 : isGenericHover ? 0.5 : 0.28;

  return (
    <>
      {/*
       * SVG goo filter — feGaussianBlur + feColorMatrix.
       *
       * Blur (σ=3.5) softens the dot's edges; feColorMatrix then amplifies
       * the alpha channel (×22) and clips at a threshold (-8), producing a
       * boundary that is crisper and more "solid" than CSS antialiasing.
       *
       * The net effect: the small dark dot looks like it has physical mass —
       * a real drop of ink, not a rendered circle. This is the baseline
       * quality signal that makes the whole cursor feel crafted.
       *
       * Scoped to this element only (not a full-screen overlay), so there is
       * zero GPU cost outside the cursor's own bounding region.
       *
       * stdDeviation values:
       *   3.5 chosen so the blur extension (≈3×σ = 10.5px) is smaller than
       *   the cursor's minimum visual size (7px radius), keeping edges tight.
       *
       * feColorMatrix alpha row: 0 0 0 22 -8
       *   threshold ≈ 8/22 = 0.36 — anything below 36% alpha disappears,
       *   above it snaps to fully opaque. Produces a ~1px transition band
       *   at the dot's edge rather than a 3-4px antialiased gradient.
       */}
      <svg
        aria-hidden="true"
        style={{
          position: "fixed",
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter id="cursor-goo" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="3.5"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -8"
            />
          </filter>
        </defs>
      </svg>

      {/*
       * Outer wrapper — position only.
       *
       * RAF writes translate(x, y) here every frame. Keeping position in a
       * separate element from scale/colour means the CSS transitions on the
       * inner motion.div are never reset by the RAF mutation. If both lived
       * in one transform, every frame would cancel the in-progress scale
       * transition.
       *
       * The goo filter is applied here — to the container, not the inner div —
       * so the filter sees the cursor's final rendered pixel output (post-scale)
       * rather than the logical element size. This matters: we want filter
       * applied to the visual 7px dot, not the layout-level 28px container.
       *
       * Filter is removed for the ring state (isLiquidHover=true) because
       * feColorMatrix fills hollow shapes — a ring becomes a solid disc.
       */}
      {/*
       * Outer wrapper — position + blend mode.
       *
       * DOT STATES: mix-blend-mode "difference" with a white fill.
       *   The browser composites: |white − backdrop| per channel.
       *   On a white page:      |255 − 255| = 0   → black dot   ✓
       *   On a dark section:    |255 −  10| = 245 → near-white  ✓
       *   Works automatically against any surface — no JS color detection.
       *
       * RING STATE: blend mode reverts to "normal" so the brand-green ring
       *   renders at its intended colour and is not inverted.
       *
       * The goo filter is applied here in dot states only. feColorMatrix
       *   fills hollow shapes (ring → solid disc), so it is removed when
       *   isLiquidHover is true.
       */}
      <div
        ref={outerRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 10001, // above WelcomeSplash (10000) so cursor is always visible
          filter: isLiquidHover ? "none" : "url(#cursor-goo)",
          mixBlendMode: isLiquidHover ? "normal" : "difference",
          willChange: "transform",
        }}
      >
        {/*
         * Inner motion.div — scale, colour, opacity.
         *
         * Fixed at 36×36px; scale controls apparent size (see sizing note above).
         * marginLeft/marginTop of -18px centres it on the cursor hotspot.
         *
         * Ring state (isLiquidHover):
         *   backgroundColor → transparent
         *   borderColor     → brand green, 85% opacity
         *   scale           → 1.0 (full 36px ring)
         *
         * Dot states (default / generic hover):
         *   backgroundColor → #ffffff (white — works with difference blend)
         *   borderColor     → transparent
         *   scale           → 0.28 / 0.50
         */}
        <motion.div
          animate={{
            scale,
            backgroundColor: isLiquidHover ? "rgba(0,0,0,0)" : "#ffffff",
            borderColor: isLiquidHover
              ? "rgba(139,92,246,0.82)"
              : "rgba(0,0,0,0)",
            opacity: isVisible ? 1 : 0,
          }}
          transition={{
            scale: { duration: 0.28, ease: EASE },
            backgroundColor: { duration: 0.22, ease: "easeInOut" },
            borderColor: { duration: 0.22, ease: "easeInOut" },
            opacity: { duration: 0.18, ease: "easeInOut" },
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            borderWidth: 1.5,
            borderStyle: "solid",
            marginLeft: -18,
            marginTop: -18,
          }}
        />
      </div>
    </>
  );
}
