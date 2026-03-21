"use client";

interface ReferralModalProps {
  onClose: () => void;
}

export function ReferralModal({ onClose }: ReferralModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-bold text-neutral-900">Refer a friend</h2>
        <p className="text-sm text-neutral-500">Share Larry with your network and earn rewards.</p>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-[var(--color-brand)] py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
