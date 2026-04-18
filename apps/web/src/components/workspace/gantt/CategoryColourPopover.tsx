"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CategorySwatchPicker, DEFAULT_SWATCH_HEX } from "./CategorySwatchPicker";

interface Props {
  currentColour: string | null;
  onApply: (hex: string) => Promise<void> | void;
  onClose: () => void;
}

export function CategoryColourPopover({ currentColour, onApply, onClose }: Props) {
  const [colour, setColour] = useState<string>(currentColour ?? DEFAULT_SWATCH_HEX);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleApply() {
    if (saving) return;
    setSaving(true);
    try { await onApply(colour); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: "var(--surface, #fff)", border: "1px solid var(--border, #eaeaea)", borderRadius: 12, padding: 20, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Category colour</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>
        <CategorySwatchPicker value={colour} onChange={setColour} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={saving}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#6c44f6", border: 0, borderRadius: 8, color: "#fff", cursor: "pointer", opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
