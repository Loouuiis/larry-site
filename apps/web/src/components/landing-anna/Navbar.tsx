"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openWaitlist } from "./waitlist-bus";

type Props = {
  /** Anchor links on the landing page are in-page (#solution); on sub-pages
   *  they need to point back to "/#solution". */
  basePath?: "" | "/";
};

export function Navbar({ basePath = "" }: Props) {
  const link = (hash: string) => `${basePath}${hash}`;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  // Close on Esc.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close on click outside the drawer + button.
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDrawer = drawerRef.current?.contains(target);
      const insideBurger = burgerRef.current?.contains(target);
      if (!insideDrawer && !insideBurger) setDrawerOpen(false);
    };
    // Defer one tick so the click that opened the drawer doesn't immediately close it.
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="nav-wrap">
      <nav className="nav" data-screen-label="00 Nav" data-comment-anchor="nav">
        <Link href={basePath === "/" ? "/" : "#top"} className="nav__logo" aria-label="Larry — home">
          <Image
            src="/Larryfulllogo.png"
            alt="Larry"
            width={144}
            height={38}
            priority
            style={{ height: 38, width: "auto", display: "block" }}
          />
        </Link>
        <div className="nav__links">
          <Link href={link("#solution")} className="nav__link">
            Solution
          </Link>
          <Link href={link("#pricing")} className="nav__link">
            Pricing
          </Link>
          <Link href={link("#career")} className="nav__link">
            Career
          </Link>
        </div>
        <div className="nav__right">
          <Link href="/login" className="nav__signin">
            Sign in
          </Link>
          <Link href="/book-a-demo" className="nav__bookdemo">
            Book a demo
          </Link>
          <button type="button" className="nav__cta" onClick={() => openWaitlist()}>
            Join Waitlist
          </button>
          <button
            ref={burgerRef}
            type="button"
            className="nav__burger"
            aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={drawerOpen}
            aria-controls="landing-mobile-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {drawerOpen ? (
                <>
                  <path d="M4 4L16 16" />
                  <path d="M16 4L4 16" />
                </>
              ) : (
                <>
                  <path d="M3 6h14" />
                  <path d="M3 10h14" />
                  <path d="M3 14h14" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      <div
        ref={drawerRef}
        id="landing-mobile-drawer"
        className={`nav__drawer ${drawerOpen ? "is-open" : ""}`}
        role="dialog"
        aria-label="Navigation menu"
        aria-hidden={!drawerOpen}
      >
        <Link href={link("#solution")} className="nav__drawer-link" onClick={closeDrawer}>
          Solution
        </Link>
        <Link href={link("#pricing")} className="nav__drawer-link" onClick={closeDrawer}>
          Pricing
        </Link>
        <Link href={link("#career")} className="nav__drawer-link" onClick={closeDrawer}>
          Career
        </Link>
        <div className="nav__drawer-divider" />
        <Link href="/login" className="nav__drawer-link" onClick={closeDrawer}>
          Sign in
        </Link>
        <Link href="/book-a-demo" className="nav__drawer-link" onClick={closeDrawer}>
          Book a demo
        </Link>
      </div>
    </div>
  );
}
