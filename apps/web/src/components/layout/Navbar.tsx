"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

interface NavLink {
  label: string;
  href: string;
  kind: "hash" | "route";
  sectionId?: string;
}

const NAV_LINKS: NavLink[] = [
  { label: "Mission",  href: "/#mission", sectionId: "mission", kind: "hash"  },
  { label: "Pricing",  href: "/pricing",                        kind: "route" },
  { label: "Careers",  href: "/careers",                        kind: "route" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const onWaitlist = useOverlayTrigger("waitlist");
  const onIntro    = useOverlayTrigger("intro");

  // Close mobile menu on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close mobile menu on click outside the header
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    // ── Scroll progress ────────────────────────────────────────────────────
    // scaleX(0→1) on a full-width fixed bar. Computed once per scroll event;
    // the CSS transform runs on the compositor thread — no layout cost.
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      const max =
        document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? window.scrollY / max : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // ── Active section tracking (IntersectionObserver) ────────────────────
    // Only attach on the home page — the #mission section doesn't exist on
    // /pricing or /careers, so there's nothing to observe.
    // rootMargin "-40% 0px -55% 0px" creates a 5% horizontal band centred
    // at 40% from the top. A section is "active" when its top edge crosses
    // into that band — roughly when it owns the user's reading focus.
    const observers: (IntersectionObserver | null)[] = [];
    if (pathname === "/") {
      const hashSectionIds = ["mission"];
      hashSectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const obs = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) setActiveSection(id);
          },
          { rootMargin: "-40% 0px -55% 0px" }
        );
        obs.observe(el);
        observers.push(obs);
      });
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observers.forEach((obs) => obs?.disconnect());
    };
  }, [pathname]);

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 px-4 pt-3 sm:px-6">
      {/*
       * Scroll progress bar — full-width, sits behind the navbar pill (z:49).
       * scaleX runs on the compositor thread; no layout, no paint.
       * Opacity kept low (0.45) so it reads as ambient data, not a loading bar.
       */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "2px",
          background: "linear-gradient(to right, #A88DFF, #7C6BFF, #4FA3FF)",
          opacity: 0.65,
          zIndex: 49,
          transformOrigin: "left center",
          transform: `scaleX(${scrollProgress})`,
          willChange: "transform",
          pointerEvents: "none",
        }}
      />

      {/* Floating pill — warm off-white glass, editorial feel */}
      <nav
        className={[
          "relative mx-auto flex h-12 max-w-6xl items-center justify-between rounded-2xl px-4",
          "bg-[#F8F7FF]/82 backdrop-blur-md",
          "border transition-all duration-300",
          scrolled
            ? "border-[var(--border)] shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
            : "border-[var(--border)] shadow-[0_2px_8px_rgba(0,0,0,0.03)]",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]"
          onClick={() => setMenuOpen(false)}
        >
          <Image src="/Larryfulllogo.png" alt="Larry" width={120} height={46} className="object-contain -ml-1" />
        </Link>

        {/* Nav links — hidden on mobile */}
        <ul className="hidden items-center gap-0.5 md:flex" role="list">
          {NAV_LINKS.map(({ label, href, kind, sectionId }) => {
            const isActive =
              kind === "hash"
                ? !!sectionId && activeSection === sectionId
                : pathname === href;
            return (
              <li key={label}>
                <Link
                  href={href}
                  className={[
                    "group relative flex items-center gap-0.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150",
                    isActive
                      ? "text-[var(--text-1)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-1)]",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  {label}
                  {!isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-3 right-3 h-px rounded-full bg-gradient-to-r from-[#A88DFF] to-[#4FA3FF] scale-x-0 group-hover:scale-x-100 transition-transform duration-200 ease-out origin-left"
                    />
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-3 right-3 h-px rounded-full bg-[#8b5cf6] opacity-70"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right-side actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Sign in — hidden on small mobile */}
          <Link
            href="/login"
            className="hidden sm:inline text-sm text-[var(--text-muted)] hover:text-[var(--text-1)] transition-colors"
          >
            Sign in
          </Link>

          {/* Book an intro — hidden on small mobile */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onIntro}
            className="hidden sm:inline-flex"
          >
            Book an intro
          </Button>

          {/* Join Waitlist — always visible; shorter label on xs to avoid crowding hamburger */}
          <LiquidButton size="sm" onClick={onWaitlist}>
            <span className="sm:hidden">Join Waitlist</span>
            <span className="hidden sm:inline">Join the Waitlist</span>
          </LiquidButton>

          {/* Hamburger — only on mobile (below md) */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            className={[
              "ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg md:hidden",
              "text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-1)] focus-visible:ring-offset-1",
            ].join(" ")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <path d="M3 3L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <path d="M2 4.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M2 8h12"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M2 11.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile menu dropdown ─────────────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-nav-menu"
            role="dialog"
            aria-label="Navigation menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={[
              "mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl md:hidden",
              "border border-[var(--border)] bg-[#F8F7FF]/96 backdrop-blur-md",
              "shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
            ].join(" ")}
          >
            {/* Nav links */}
            <ul className="px-2 pt-2" role="list">
              {NAV_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[44px] items-center rounded-xl px-4 py-2.5 text-sm text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Bottom actions */}
            <div className="flex flex-col gap-2 border-t border-[var(--border)] px-4 py-4">
              {/* Sign in */}
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
              >
                Sign in
              </Link>
              {/* Book an intro */}
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={(e) => {
                  onIntro(e);
                  setMenuOpen(false);
                }}
              >
                Book an intro
              </Button>
              {/* Join Waitlist — div wrapper makes the inline-flex motion.div fill the row */}
              <div className="w-full">
                <LiquidButton
                  size="lg"
                  className="w-full"
                  onClick={(e) => {
                    onWaitlist(e);
                    setMenuOpen(false);
                  }}
                >
                  Join Waitlist
                </LiquidButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
