"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "./Button";
import type { ButtonHTMLAttributes } from "react";

type Size = "sm" | "md" | "lg";
type Variant = "primary" | "secondary" | "ghost";

interface LiquidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  variant?: Variant;
  className?: string;
}

/**
 * LiquidButton
 *
 * A thin wrapper around <Button> that opts the button into the CustomCursor
 * liquid-merge interaction. Everything visible is rendered by <Button> —
 * LiquidButton adds only the event bridge and the motion wrapper.
 *
 * How the merge works:
 *
 *   On mouseenter → dispatches `liquid:enter` with the button's DOMRect.
 *   CustomCursor reads this and transitions its cursor dot from a small filled
 *   circle into a 28px transparent ring (1.5px brand-green border). The ring's
 *   hollow centre keeps button text fully readable. The transition — filled dot
 *   opening into a ring — reads as the cursor making contact with the button's
 *   surface, like two liquid drops joining at their boundary.
 *
 *   On mouseleave → dispatches `liquid:leave`. Cursor returns to dot.
 *
 * Why a motion.div wrapper rather than patching Button directly:
 *   Keeps Button a pure, stateless presentational component. LiquidButton is
 *   an opt-in enhancement layer — use it for primary hero CTAs, keep <Button>
 *   everywhere else.
 *
 * The motion.div wrapper intentionally does NOT add its own whileHover scale —
 * Button's own CSS `hover:scale-[1.015]` handles that. Adding a second scale
 * here would compound to ~1.03, which pushes against the spec's 1.02 ceiling
 * and makes the button feel less controlled.
 */
export function LiquidButton({
  size = "lg",
  variant = "primary",
  className = "",
  children,
  ...props
}: LiquidButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleEnter = () => {
    if (!btnRef.current) return;
    // Re-query rect on each enter so scrolled positions are always fresh
    document.dispatchEvent(
      new CustomEvent("liquid:enter", {
        detail: { rect: btnRef.current.getBoundingClientRect() },
      })
    );
  };

  const handleLeave = () => {
    document.dispatchEvent(new CustomEvent("liquid:leave"));
  };

  return (
    <motion.div
      onHoverStart={handleEnter}
      onHoverEnd={handleLeave}
      // display: inline-flex so the wrapper doesn't inject block-level width
      style={{ display: "inline-flex" }}
    >
      <Button
        ref={btnRef}
        size={size}
        variant={variant}
        className={className}
        {...props}
      >
        {children}
      </Button>
    </motion.div>
  );
}
