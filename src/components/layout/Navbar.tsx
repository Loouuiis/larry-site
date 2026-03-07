"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

interface NavLink {
  label: string;
  href: string;
  sectionId?: string;
}

// sectionId maps each anchor link to its corresponding section element.
// Non-anchor links (Blog) have no sectionId and are never highlighted.
const NAV_LINKS: NavLink[] = [
  { label: "How It Works",  href: "#solution",      sectionId: "solution"      },
  { label: "Why Larry",     href: "#differentiator", sectionId: "differentiator" },
  { label: "Who It's For",  href: "#audience",       sectionId: "audience"      },
  { label: "Pricing",       href: "#pricing",        sectionId: "pricing"       },
  { label: "Blog",          href: "/blog"                                        },
];


export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("");
  const openWaitlist = useOverlayTrigger("waitlist");

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
    // rootMargin "-40% 0px -55% 0px" creates a 5% horizontal band centred
    // at 40% from the top. A section is "active" when its top edge crosses
    // into that band — roughly when it owns the user's reading focus.
    const sectionIds = NAV_LINKS.map((l) => l.sectionId).filter(Boolean) as string[];
    const observers = sectionIds.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: "-40% 0px -55% 0px" }
      );
      obs.observe(el);
      return obs;
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      observers.forEach((obs) => obs?.disconnect());
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-3 sm:px-6">
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
          "bg-[#F7F7F4]/82 backdrop-blur-md",
          "border transition-all duration-300",
          scrolled
            ? "border-neutral-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
            : "border-neutral-200/50 shadow-[0_2px_8px_rgba(0,0,0,0.03)]",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-neutral-900"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[#2e7d4f] text-white text-xs font-bold select-none">
            L
          </span>
          Larry
        </Link>

        {/* Nav links — hidden on mobile */}
        <ul className="hidden items-center gap-0.5 md:flex" role="list">
          {NAV_LINKS.map(({ label, href, sectionId }) => {
            const isActive = !!sectionId && activeSection === sectionId;
            return (
              <li key={label}>
                <Link
                  href={href}
                  className={[
                    "group relative flex items-center gap-0.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150",
                    isActive
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  {label}
                  {/*
                   * Hover underline — accent gradient, slides in from left via
                   * scaleX. origin-left ensures it grows in the reading direction.
                   * Only shown when the link is not already active.
                   */}
                  {!isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-3 right-3 h-px rounded-full bg-gradient-to-r from-[#A88DFF] to-[#4FA3FF] scale-x-0 group-hover:scale-x-100 transition-transform duration-200 ease-out origin-left"
                    />
                  )}
                  {/*
                   * Active underline — brand green, always visible when the section
                   * is in the reading viewport.
                   */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-3 right-3 h-px rounded-full bg-[#2e7d4f] opacity-70"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Auth actions */}
        <div className="flex items-center gap-1">
          <Link
            href="/login"
            className="group relative hidden rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors duration-150 hover:text-neutral-900 sm:block"
          >
            Log in
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-3 right-3 h-px rounded-full bg-gradient-to-r from-[#A88DFF] to-[#4FA3FF] scale-x-0 group-hover:scale-x-100 transition-transform duration-200 ease-out origin-left"
            />
          </Link>
          <Button size="sm" onClick={openWaitlist}>Join the Waitlist</Button>
        </div>
      </nav>
    </header>
  );
}
