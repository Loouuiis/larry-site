"use client";

import { useEffect, useRef } from "react";

// ─── Tuning constants ─────────────────────────────────────────────────────────
//
// The field is governed by three forces on each dot:
//
//   SPRING    Restoring force back to home position.
//             Higher = stiffer, faster return, less displacement.
//             Lower  = more sluggish, "floaty" return.
//
//   ATTRACT   Force pulling a dot toward the lag cursor.
//             Scales with proximity (0 at field edge, peak at mid-radius).
//             Kept very small — max equilibrium displacement ≈ 5–7px.
//             Subtle enough to register as "intelligence", not as motion.
//
//   DAMP      Per-frame velocity multiplier (< 1 = energy loss per frame).
//             At 0.73, velocity decays to ~4% after 10 frames (≈ 0.17s).
//             Overdamped: no oscillation. Dots settle, they don't bounce.
//
// VEL_TRANSFER
//             Fraction of cursor velocity applied as a field nudge.
//             Creates the "directional alignment" behaviour: dots lean
//             slightly in the direction the cursor is moving, not just
//             toward where it currently is. Very small — purely atmospheric.
//
// LAG         Network lag factor (fraction per frame toward actual cursor).
//             0.09 ≈ ~110ms trail at 60fps. The cursor is 1:1; the
//             interaction cluster trails slightly behind, so the cursor
//             never sits exactly at the centre of the displacement field.
//
// LINE_MAX    Maximum distance between two connected dots (px).
//             90px ≈ 2.27 grid diagonals — connects neighbours only,
//             never links across unrelated regions of the grid.
//
// LINE_OPACITY_CAP
//             Maximum opacity for any single connection line.
//             0.12 keeps lines visible enough to register, transparent
//             enough to never compete with page content.

const GRID = 28;
const DOT_RADIUS = 0.85;
const FIELD_RADIUS = 130; // px — the sphere of influence
const LINE_MAX = 90;      // px — max length of a connection line
const LINE_OPACITY_CAP = 0.12;
const DOT_BASE_ALPHA = 0.05;
const DOT_NEAR_ALPHA = 0.17;
const SPRING = 0.08;
const DAMP = 0.73;
const ATTRACT = 0.015;
const VEL_TRANSFER = 0.010; // cursor momentum → field nudge
const LAG = 0.09;

// Pre-compute squared thresholds — avoids Math.sqrt in the hot path.
const FR2 = FIELD_RADIUS * FIELD_RADIUS;
const LM2 = LINE_MAX * LINE_MAX;
const TAU = Math.PI * 2;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dot {
  hx: number; hy: number; // home position (never changes after buildGrid)
  x: number;  y: number;  // current position (mutated by spring physics)
  vx: number; vy: number; // velocity (mutated each frame)
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * MagneticFieldBackground
 *
 * Two rendered layers:
 *
 *   GRADIENT (CSS div, z:-3)
 *   Ambient brand-green wash. Radial ellipse anchored at the top for
 *   primary warmth; linear gradient that fades by 50% of page height.
 *   These two sub-layers eliminate the hard band a single gradient
 *   would produce. Combined with LiquidBackground's blobs, the result
 *   is green depth that is felt, not seen.
 *
 *   CANVAS (RAF loop, z:-2)
 *   A 28px-grid dot field with spring-physics displacement. Each dot has
 *   a home position and a current position. When the lag cursor enters a
 *   dot's field radius, the dot is attracted toward it — a micro movement
 *   of 5–7px at most. A spring and damper return it to home when the
 *   cursor leaves. Cursor velocity is partially transferred to the field,
 *   giving dots a directional lean in the direction of cursor travel.
 *
 *   Three draw passes per frame:
 *     1. All dots at base alpha — one beginPath() + fill(). O(n) but a
 *        single GPU draw call: sub-millisecond for ~2,800 dots.
 *     2. Near dots at higher alpha — another batch fill() on the sub-set.
 *     3. Connection lines — O(n²) over the near set only. With
 *        FIELD_RADIUS=130 and GRID=28, near set ≈ 65 dots max → ~2,080
 *        pairs → well within 60fps budget after opacity culling.
 *
 * Why spring physics rather than position lerp:
 *   Lerp produces trailing — the dot chases the cursor. Spring physics
 *   produces settling — the dot is pulled, then held by its home anchor.
 *   The difference: lerp reads as "following", spring reads as "reacting".
 *   A field that reacts feels intelligent. A field that follows feels
 *   decorative.
 *
 * Why ATTRACT is kept tiny (0.015):
 *   At equilibrium, a dot 40px from the cursor displaces ≈ 5.5px. This
 *   is invisible at a casual glance but registers as aliveness in peripheral
 *   vision. The moment you notice is the moment you start to believe the
 *   interface is watching you. That's the correct feeling.
 *
 * prefers-reduced-motion: canvas is skipped entirely. Gradient stays.
 * coarse-pointer (touch): same — canvas skipped, gradient stays.
 */
export function MagneticFieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect motion preferences and touch devices.
    // Both skip the canvas; the atmospheric gradient layer still renders.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // ── Mutable render state ──────────────────────────────────────────────────
    let width = 0, height = 0, dpr = 1;
    let dots: Dot[] = [];

    // Raw mouse coordinates — written by event listener, read by RAF
    let mouseX = -9999, mouseY = -9999;

    // Lagged position — the network interaction cluster trails the cursor.
    // This decouples cursor precision from network position: the cursor is
    // always 1:1; the cluster is always slightly behind.
    let lagX = -9999, lagY = -9999;

    // Cursor velocity — used to nudge dots in the direction of travel.
    // Dampened exponentially: vX = vX×0.75 + (Δx)×0.25 per frame.
    let cursorVX = 0, cursorVY = 0;
    let prevMouseX = -9999, prevMouseY = -9999;

    let rafId = 0, resizeTimer = 0;

    // ── Grid construction ─────────────────────────────────────────────────────
    function buildGrid() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.scale(dpr, dpr);

      // Every dot begins at its home position, at rest.
      dots = [];
      const cols = Math.ceil(width / GRID) + 1;
      const rows = Math.ceil(height / GRID) + 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = c * GRID, y = r * GRID;
          dots.push({ hx: x, hy: y, x, y, vx: 0, vy: 0 });
        }
      }
    }

    // ── Render loop ───────────────────────────────────────────────────────────
    function render() {
      ctx!.clearRect(0, 0, width, height);

      // ── Advance lag position ────────────────────────────────────────────────
      // Only advance if cursor is on screen. When cursor leaves, lagX/lagY
      // retract immediately (see onLeave) — dots spring back on their own.
      const hasLag = lagX > -9000;
      if (mouseX > -9000) {
        lagX += (mouseX - lagX) * LAG;
        lagY += (mouseY - lagY) * LAG;

        // Cursor velocity: weighted moving average of raw frame-to-frame delta.
        // Guard against the first frame after entry (prevMouseX still -9999).
        if (prevMouseX > -9000) {
          cursorVX = cursorVX * 0.75 + (mouseX - prevMouseX) * 0.25;
          cursorVY = cursorVY * 0.75 + (mouseY - prevMouseY) * 0.25;
        }
        prevMouseX = mouseX;
        prevMouseY = mouseY;
      } else {
        // Cursor off-screen — velocity decays, then stops driving the field
        cursorVX *= 0.82;
        cursorVY *= 0.82;
      }

      const velMag = Math.hypot(cursorVX, cursorVY);

      // ── Physics update ──────────────────────────────────────────────────────
      // Two-pass loop:
      //   Pass A (physics): update every dot's velocity and position.
      //   Pass B (collect): after position update, check proximity to lagX/lagY.
      //
      // Separation matters: near-set is collected from post-update positions,
      // so connection lines draw between where dots actually are this frame,
      // not where they were at frame start.

      const near: Dot[] = [];

      for (const d of dots) {
        // Restoring spring force — always pulls toward home
        let fx = (d.hx - d.x) * SPRING;
        let fy = (d.hy - d.y) * SPRING;

        if (hasLag) {
          const ddx = lagX - d.x;
          const ddy = lagY - d.y;
          const d2 = ddx * ddx + ddy * ddy;

          if (d2 < FR2) {
            // Proximity: 0 at field edge → 1 at field centre
            const prox = 1 - d2 / FR2;

            // Attraction toward lag cursor — micro displacement only
            fx += ddx * prox * ATTRACT;
            fy += ddy * prox * ATTRACT;

            // Velocity transfer: cursor motion nudges dots in direction of travel.
            // Only applied when cursor is actually moving (velMag threshold).
            // Effect: dots "lean" into the cursor's wake — directional alignment.
            if (velMag > 0.8) {
              const nvx = cursorVX / velMag;
              const nvy = cursorVY / velMag;
              fx += nvx * prox * VEL_TRANSFER;
              fy += nvy * prox * VEL_TRANSFER;
            }
          }
        }

        // Integrate velocity + apply damping
        d.vx = (d.vx + fx) * DAMP;
        d.vy = (d.vy + fy) * DAMP;
        d.x += d.vx;
        d.y += d.vy;

        // Collect near set from post-physics positions
        if (hasLag) {
          const ndx = lagX - d.x;
          const ndy = lagY - d.y;
          if (ndx * ndx + ndy * ndy < FR2) near.push(d);
        }
      }

      // ── Draw pass 1: all dots at base alpha ─────────────────────────────────
      // Single beginPath + fill = one GPU draw call regardless of dot count.
      // moveTo before each arc is required to prevent the canvas path
      // engine from connecting consecutive arcs with a straight line.
      ctx!.beginPath();
      for (const d of dots) {
        ctx!.moveTo(d.x + DOT_RADIUS, d.y);
        ctx!.arc(d.x, d.y, DOT_RADIUS, 0, TAU);
      }
      ctx!.fillStyle = `rgba(0,0,0,${DOT_BASE_ALPHA})`;
      ctx!.fill();

      // ── Draw pass 2: near dots brightened ───────────────────────────────────
      // Redrawn on top of pass 1, slightly higher alpha.
      // Batched into one fill call for the same GPU efficiency reason.
      if (near.length > 0) {
        ctx!.beginPath();
        for (const d of near) {
          ctx!.moveTo(d.x + DOT_RADIUS, d.y);
          ctx!.arc(d.x, d.y, DOT_RADIUS, 0, TAU);
        }
        ctx!.fillStyle = `rgba(0,0,0,${DOT_NEAR_ALPHA})`;
        ctx!.fill();
      }

      // ── Draw pass 3: connection lines ────────────────────────────────────────
      // O(n²) over near set only. With FR=130 and GRID=28, near ≤ ~65 dots →
      // ≤ ~2,080 pairs. After alpha culling (< 0.006 skipped), typically
      // 80–150 draw calls. Each is a GPU stroke; total is sub-millisecond.
      ctx!.lineWidth = 0.5;

      for (let i = 0; i < near.length; i++) {
        const a = near[i];
        const adx = a.x - lagX;
        const ady = a.y - lagY;
        // proxA: how close dot A is to the lag cursor centre (0→1)
        const proxA = 1 - (adx * adx + ady * ady) / FR2;

        for (let j = i + 1; j < near.length; j++) {
          const b = near[j];

          const ldx = b.x - a.x;
          const ldy = b.y - a.y;
          const ld2 = ldx * ldx + ldy * ldy;
          if (ld2 > LM2) continue; // dots too far apart

          const bdx = b.x - lagX;
          const bdy = b.y - lagY;
          const proxB = 1 - (bdx * bdx + bdy * bdy) / FR2;

          // Line opacity: driven by the weaker endpoint's proximity and
          // line length. Short lines between central dots are most visible;
          // long lines between peripheral dots are nearly invisible.
          const lineFade = 1 - ld2 / LM2;
          const alpha = Math.min(proxA, proxB) * lineFade * LINE_OPACITY_CAP;
          if (alpha < 0.006) continue; // cull near-transparent lines early

          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(46,125,79,${alpha.toFixed(3)})`;
          ctx!.stroke();
        }
      }

      rafId = requestAnimationFrame(render);
    }

    // ── Event handlers ────────────────────────────────────────────────────────
    function onMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }

    function onLeave() {
      mouseX = -9999;
      mouseY = -9999;
      // Reset lag immediately — dots spring back naturally via physics.
      // If we lerped lagX toward -9999 instead, dots would see a "cursor"
      // dragging off-screen, pulling the field in a direction. Immediate
      // reset is cleaner: the field simply loses its attractor.
      lagX = -9999;
      lagY = -9999;
      prevMouseX = -9999;
      prevMouseY = -9999;
      cursorVX = 0;
      cursorVY = 0;
    }

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        buildGrid();
      }, 150);
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    buildGrid();
    rafId = requestAnimationFrame(render);

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(resizeTimer);
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      {/*
       * Atmospheric gradient wash — CSS only, no canvas.
       *
       * Radial ellipse (top): centres the brand warmth over the hero,
       * where the product's first impression is formed.
       * Linear fade: same warmth, softer signal, gone by 52% of page height.
       *
       * Two layers prevent the hard colour band a single gradient produces.
       * Opacity values: 0.02–0.045 — the green is ambient, not decorative.
       */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -3,
          pointerEvents: "none",
          background: [
            "radial-gradient(ellipse 110% 55% at 50% 0%, rgba(46,125,79,0.045) 0%, transparent 100%)",
            "linear-gradient(180deg, rgba(46,125,79,0.02) 0%, transparent 52%)",
          ].join(", "),
        }}
      />

      {/*
       * Magnetic field canvas.
       * pointer-events: none — never intercepts clicks or hovers.
       * willChange omitted intentionally: the canvas is already a composited
       * layer; redundant willChange hints can increase GPU memory usage.
       */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -2,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
