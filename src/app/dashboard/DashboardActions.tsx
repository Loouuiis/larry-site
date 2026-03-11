"use client";

import { useState } from "react";
import { LogoutButton } from "./LogoutButton";
import { ReferralModal } from "./ReferralModal";

export function DashboardActions() {
  const [showReferral, setShowReferral] = useState(false);

  return (
    <>
      {/* Top-right controls */}
      <div className="fixed right-4 top-4 z-40 flex items-center gap-2 sm:right-6 sm:top-5">
        <button
          onClick={() => setShowReferral(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 bg-white/80 backdrop-blur-sm px-4 text-sm font-medium text-neutral-700 transition-colors duration-200 hover:border-[#8b5cf6] hover:text-[#8b5cf6]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2.5C9 3.88 7.88 5 6.5 5S4 3.88 4 2.5 5.12 0 6.5 0 9 1.12 9 2.5Z" fill="currentColor" opacity=".4"/>
            <path d="M13 11.5C13 12.88 11.88 14 10.5 14S8 12.88 8 11.5s1.12-2.5 2.5-2.5S13 10.12 13 11.5Z" fill="currentColor" opacity=".4"/>
            <path d="M8.2 3.4 9.8 4.6M8.2 10.6 9.8 9.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="6.5" cy="2.5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <circle cx="10.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <circle cx="10.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M8.2 3.4 9.8 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Refer a Friend
        </button>
        <LogoutButton />
      </div>

      {/* Referral modal */}
      {showReferral && <ReferralModal onClose={() => setShowReferral(false)} />}
    </>
  );
}
