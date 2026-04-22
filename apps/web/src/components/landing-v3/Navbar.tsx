"use client";

import Image from "next/image";
import Link from "next/link";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

export function LandingNavbar() {
  const onWaitlist = useOverlayTrigger("waitlist");
  const onIntro = useOverlayTrigger("intro");

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        padding: "18px 28px",
        background: "rgba(242,243,255,0.88)",
        borderColor: "rgba(240,237,250,0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between">
        <Link href="/" aria-label="Larry" className="inline-flex items-center">
          <Image
            src="/Larryfulllogo.png"
            alt="Larry"
            width={120}
            height={28}
            priority
            className="h-7 w-auto"
          />
        </Link>

        <div className="flex items-center gap-2.5">
          <a
            href="#what"
            className="hidden px-3.5 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] sm:inline-flex"
          >
            Mission
          </a>
          <Link
            href="/pricing"
            className="hidden px-3.5 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] sm:inline-flex"
          >
            Pricing
          </Link>
          <Link
            href="/careers"
            className="hidden px-3.5 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] sm:inline-flex"
          >
            Careers
          </Link>
          <Link
            href="/login"
            className="hidden rounded-full border border-[var(--brand)] px-4.5 py-2 text-[13px] font-medium text-[var(--brand)] transition-all duration-200 hover:bg-[var(--brand)] hover:text-white sm:inline-flex"
            style={{ letterSpacing: "-0.005em", padding: "9px 18px" }}
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={onIntro}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)] bg-[var(--brand)] px-4.5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[var(--brand-hover,#5b38d4)] hover:border-[var(--brand-hover,#5b38d4)]"
            style={{ letterSpacing: "-0.005em", padding: "9px 18px" }}
          >
            Book an intro
          </button>
        </div>
      </div>
    </nav>
  );
}
