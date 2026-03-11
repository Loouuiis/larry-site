"use client";

import { useEffect, useRef } from "react";

// ─── Tuning constants ─────────────────────────────────────────────────────────
//
// GRID:            Matches the existing 28px CSS dot pattern so the canvas
//                  dots align with any page elements that reference that rhythm.
//
// CURSOR_RADIUS:   150px — large enough for the effect to read, small enough
//                  that connections never form across the full screen. The
//                  constraint is the entire point: local, not global.
//
// LINE_MAX_LENGTH: 100px — slightly over two grid diagonals. Allows connections
//                  between grid neighbours, not across unrelated dots.
//
// LINE_OPACITY_CAP: 0.15 — lines visible enough to register, transparent enough
//                  not to compete with the page. This is the restraint number.
//
// DOT_BASE_ALPHA:  0.055 — matches the existing CSS dot pattern opacity so the
//                  transition from CSS to canvas is invisible.

const GRID = 28;
const DOT_RADIUS = 0.9;
const CURSOR_RADIUS = 150;
const LINE_MAX_LENGTH = 100;
const LINE_OPACITY_CAP = 0.15;
const DOT_BASE_ALPHA = 0.055;
const DOT_NEAR_ALPHA = 0.19;

// Pre-compute squared radii — avoids Math.sqrt in the render hot path.
// At 60fps with ~2,700 dots, that's 162,000 sqrt calls saved per second.
const CR2 = CURSOR_RADIUS * CURSOR_RADIUS;
const LR2 = LINE_MAX_LENGTH * LINE_MAX_LENGTH;

interface Dot {
  x: number;
  y: number;
}

/**
 * InteractiveBackground
 *
 * Two layers:
 *
 *   GRADIENT (CSS div, z:-3)
 *   A full-page atmospheric wash that carries the brand green from the top
 *   downward. Two sub-layers: a radial ellipse anchored at the top for the
 *   primary warmth, and a linear gradient that fades cleanly by the midpoint.
 *   Opacity values are tuned to feel ambient — the green is *felt*, not seen.
 *   Combined with LiquidBackground's blobs, the page has green depth at top
 *   and bottom without a hard gradient band anywhere.
 *
 *   CANVAS (requestAnimationFrame, z:-2)
 *   A fixed-position canvas that replaces the per-section CSS dot grids with
 *   a single global dot field. Dots are arranged on a strict 28px grid (not
 *   random — randomness reads as a particle demo). When the cursor is within
 *   CURSOR_RADIUS, nearby dots are connected with thin brand-green lines whose
 *   opacity is proportional to both cursor proximity and line length. The effect
 *   is local: connections only form in a small radius around the cursor, not
 *   across the screen.
 *
 * Why canvas over DOM elements:
 *   ~2,700 div elements repainting per frame would cause layout thrashing.
 *   Canvas operations run on the compositor thread; clearRect + arc + fill
 *   for 2,700 dots is sub-millisecond on any modern GPU.
 *
 * Why a grid, not random placement:
 *   Random placement looks like a noise texture or a particle system — both
 *   associations the brief explicitly rejects. A grid has structure. It reads
 *   as intentional, not generative.
 *
 * Mobile: canvas is skipped entirely on coarse-pointer devices. Gradient stays.
 */
export function InteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Skip interactive canvas on touch devices — gradient layer still renders
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // ── Mutable render state (no React state — zero re-renders per frame) ───
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dots: Dot[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    // Lagged position for the network — lerps toward mouse at ~0.10 per frame.
    // The cursor tracks 1:1; the connection cluster trails slightly behind,
    // so the cursor never sits perfectly at the centre of the network.
    let lagX = -9999;
    let lagY = -9999;
    let rafId = 0;
    let resizeTimer = 0;

    // ── Dot grid ─────────────────────────────────────────────────────────────
    function buildGrid() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Physical pixel dimensions
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;

      // Re-apply DPR scale after resize reset
      ctx!.scale(dpr, dpr);

      // Build the grid — +1 col/row ensures edges are covered
      dots = [];
      const cols = Math.ceil(width / GRID) + 1;
      const rows = Math.ceil(height / GRID) + 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          dots.push({ x: c * GRID, y: r * GRID });
        }
      }
    }

    // ── Render loop ───────────────────────────────────────────────────────────
    function render() {
      ctx!.clearRect(0, 0, width, height);

      // Advance lagged position — lerp factor 0.10 gives a ~100ms trail at 60fps.
      // The cursor is 1:1; this network position lags behind, so the cursor
      // never sits exactly at the centre of the connection cluster.
      const LAG = 0.10;
      if (mouseX > -9000) {
        lagX += (mouseX - lagX) * LAG;
        lagY += (mouseY - lagY) * LAG;
      }

      // Collect dots within lag-cursor radius while drawing all dots.
      // Single pass — avoids iterating dots twice.
      const near: Dot[] = [];

      for (const d of dots) {
        const dx = d.x - lagX;
        const dy = d.y - lagY;
        const d2 = dx * dx + dy * dy;
        const isNear = d2 < CR2;

        if (isNear) near.push(d);

        // Proximity 0→1: 0 at lag-cursor edge, 1 at lag-cursor centre
        const prox = isNear ? 1 - d2 / CR2 : 0;
        const alpha = DOT_BASE_ALPHA + prox * (DOT_NEAR_ALPHA - DOT_BASE_ALPHA);

        ctx!.beginPath();
        ctx!.arc(d.x, d.y, DOT_RADIUS, 0, 6.2832);
        ctx!.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
        ctx!.fill();
      }

      // Connection lines — O(n²) over the near set only.
      // With CURSOR_RADIUS=150 and GRID=28, the near set is ~50–80 dots max,
      // so the worst case is ~3,160 pairs — well within budget for 60fps.
      ctx!.lineWidth = 0.55;

      for (let i = 0; i < near.length; i++) {
        const a = near[i];
        const adx = a.x - lagX;
        const ady = a.y - lagY;
        const proxA = 1 - (adx * adx + ady * ady) / CR2;

        for (let j = i + 1; j < near.length; j++) {
          const b = near[j];

          // Skip pairs farther apart than LINE_MAX_LENGTH
          const ldx = b.x - a.x;
          const ldy = b.y - a.y;
          const ld2 = ldx * ldx + ldy * ldy;
          if (ld2 > LR2) continue;

          const bdx = b.x - lagX;
          const bdy = b.y - lagY;
          const proxB = 1 - (bdx * bdx + bdy * bdy) / CR2;

          // Final opacity: weakest endpoint × line-length falloff × cap
          const lineFade = 1 - ld2 / LR2;
          const alpha = Math.min(proxA, proxB) * lineFade * LINE_OPACITY_CAP;
          if (alpha < 0.008) continue; // cull near-transparent lines early

          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(139,92,246,${alpha.toFixed(3)})`;
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
      // Cursor left the document — retract all lines gracefully
      mouseX = -9999;
      mouseY = -9999;
    }

    function onResize() {
      // Debounce: skip intermediate resize events during drag
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        // Reset transform accumulated by previous scale() calls
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
       * Full-page atmospheric gradient — CSS div, no canvas needed.
       *
       * Two composited layers:
       *   1. Radial ellipse from the top: the primary brand warmth.
       *      110% width so it spans edge-to-edge without clipping.
       *      Fades to transparent over 100% height — by the footer, it's gone.
       *
       *   2. Linear gradient: the same warmth as a softer, more directional
       *      signal, fading by 50% of the page height.
       *
       * Why not a single gradient:
       *   One linear gradient produces a visible colour band. The radial softens
       *   the top edge and centres the warmth over the hero content, which is
       *   where the product's first impression lives.
       *
       * Combined opacity with LiquidBackground's blobs (which are at z:-50):
       *   Blobs: 0.05–0.08 peak opacity, heavily blurred
       *   This gradient: 0.02–0.045 peak
       *   Total perceived: very faint green warmth — felt, not seen.
       */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -3,
          pointerEvents: "none",
          background: [
            "radial-gradient(ellipse 110% 55% at 50% 0%, rgba(139,92,246,0.055) 0%, transparent 100%)",
            "linear-gradient(180deg, rgba(139,92,246,0.025) 0%, transparent 52%)",
          ].join(", "),
        }}
      />

      {/*
       * Interactive dot canvas.
       *
       * pointer-events: none — the canvas never intercepts clicks or hovers.
       * Mouse position is read from a window-level listener, not from the canvas.
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
