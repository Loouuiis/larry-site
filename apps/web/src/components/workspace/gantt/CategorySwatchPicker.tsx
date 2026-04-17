"use client";

export interface CategorySwatch {
  hex: string;
  name: string;
}

// Fixed 8-swatch palette for categories. Chosen to contrast well on the
// lavender workspace background + stay tonally consistent with Larry purple.
// Users pick one of these; no custom hex. Default is Larry purple.
export const CATEGORY_PALETTE: readonly CategorySwatch[] = [
  { hex: "#6c44f6", name: "Larry purple" },
  { hex: "#0ea5e9", name: "Sky" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#64748b", name: "Slate" },
] as const;

export const DEFAULT_SWATCH_HEX = CATEGORY_PALETTE[0].hex;

// Returns true if the given hex is one of the palette swatches (case-insensitive).
export function isPaletteSwatch(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const normalized = hex.toLowerCase();
  return CATEGORY_PALETTE.some((s) => s.hex.toLowerCase() === normalized);
}

interface Props {
  value: string;
  onChange: (hex: string) => void;
  size?: number;           // px per swatch (default 24)
  "aria-label"?: string;
}

export function CategorySwatchPicker({
  value,
  onChange,
  size = 24,
  "aria-label": ariaLabel = "Category colour",
}: Props) {
  const selected = (value ?? "").toLowerCase();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "2px 0",
      }}
    >
      {CATEGORY_PALETTE.map(({ hex, name }) => {
        const isSelected = selected === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={name}
            title={name}
            onClick={() => onChange(hex)}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: hex,
              border: isSelected ? "2px solid var(--text-1)" : "2px solid transparent",
              boxShadow: isSelected
                ? `0 0 0 2px var(--surface), 0 0 0 4px ${hex}`
                : "inset 0 0 0 1px rgba(0,0,0,0.06)",
              cursor: "pointer",
              padding: 0,
              transition: "box-shadow 120ms ease-out, transform 120ms ease-out",
              transform: isSelected ? "scale(1.05)" : "scale(1)",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}
