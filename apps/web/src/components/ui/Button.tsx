import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/*
 * Outlined button system — inspired by project-a.vc's editorial approach.
 *
 * Primary: border + transparent bg on light backgrounds. Fills to near-black
 *   on hover so text flips to white — high-contrast, decisive. No gradients;
 *   the typography IS the signal.
 *
 * Secondary: lower-contrast outlined. For supporting actions that shouldn't
 *   compete with the primary CTA.
 *
 * Ghost: text-only. For tertiary actions or actions on dark/accent surfaces.
 *
 * Transitions: 200ms for fill (matches project-a.vc's 160-200ms range).
 *   Scale capped at 1.012 — perceptible without breaking the outlined geometry.
 *
 * Dark-surface override: pass className="border-white text-white
 *   hover:bg-white hover:text-neutral-900" to invert for dark sections.
 */
const variantStyles: Record<Variant, string> = {
  primary: [
    "border border-[var(--text-1)] bg-transparent text-[var(--text-1)]",
    "hover:bg-[var(--brand)] hover:text-white",
    "hover:scale-[1.012]",
    "active:scale-100",
    "focus-visible:ring-[var(--text-1)]",
    "transition-colors duration-200",
  ].join(" "),
  secondary: [
    "border border-[var(--border)] bg-transparent text-[var(--text-2)]",
    "hover:border-[var(--brand)] hover:text-[var(--text-1)]",
    "hover:scale-[1.012]",
    "active:scale-100",
    "focus-visible:ring-[var(--text-muted)]",
    "transition-colors duration-200",
  ].join(" "),
  ghost: [
    "text-[var(--text-2)]",
    "hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]",
    "active:bg-[var(--surface-2)]",
    "focus-visible:ring-[var(--text-muted)]",
    "transition-colors duration-200",
  ].join(" "),
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-4 text-sm",
  md: "h-9 px-5 text-sm",
  lg: "h-[2.75rem] px-7 text-[0.9375rem] tracking-[-0.01em]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", className = "", children, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-full font-medium",
          "cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
