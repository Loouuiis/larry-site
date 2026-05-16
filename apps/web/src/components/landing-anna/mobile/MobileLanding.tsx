"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openWaitlist } from "../waitlist-bus";

/* ─────────────────────────────────────────────────────────────────
   Shared content (kept identical to desktop sections.tsx)
   ─────────────────────────────────────────────────────────────── */
const PARTNERS = [
  "Nordic Capital",
  "Northvolt",
  "Stark Group",
  "Coordinaire",
  "Ramboll",
  "TCS",
  "Hyperion",
  "Atlas Copco",
  "Mercell",
  "Polestar",
];

const WITHOUT = [
  "Chasing updates across teams, email, Slack, and spreadsheets",
  "Sending reminders and following up on tasks and deadlines",
  "Running status meetings that create more confusion than progress",
  "Updating project plans and reports manually",
  "Limited visibility into progress and risks",
  "Fragmented communication and costly delays",
];

const WITH = [
  "A real-time, fully updated project state with clear priorities",
  "Automatically aligned stakeholders, timelines, and tools",
  "Automation of task execution, follow-ups, and progress tracking",
  "Full project context with immediate, informed responses via chat",
  "Faster, better-informed decisions and full work traceability",
  "Teams focused on outcomes, not updates",
];

const ROLES = [
  { num: "01", name: "Project Managers" },
  { num: "02", name: "PMO Leads" },
  { num: "03", name: "Consultants & Professional Services Teams" },
  { num: "04", name: "Operations & Delivery Leaders" },
  { num: "05", name: "Engineering & Technical Leaders" },
];

const INDUSTRIES = [
  "Consulting",
  "IT Services",
  "Engineering",
  "Construction & Infrastructure",
  "Energy & Renewables",
  "SaaS",
];

const TYPING_LINES = [
  "Hours spent updating spreadsheets and trackers",
  "Team is never aligned on tasks",
  "We always run over budget",
  "Updates scattered across tools",
  "Deadlines shift without warning",
  "Hard to know what's actually blocked",
  "Critical risks surface too late",
  "Constantly chasing progress updates",
];

/* ─────────────────────────────────────────────────────────────────
   NAV
   ─────────────────────────────────────────────────────────────── */
function MobileNav({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (drawerRef.current?.contains(t)) return;
      if (burgerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <div className="mnav-wrap">
        <nav className="mnav" data-screen-label="00 Nav">
          <Link href="#top" className="mnav__logo" aria-label="Larry — home">
            <Image
              src="/Larryfulllogo.png"
              alt="Larry"
              width={120}
              height={32}
              priority
              style={{ height: 24, width: "auto", display: "block" }}
            />
          </Link>
          <div className="mnav__right">
            <button
              type="button"
              className="mnav__cta"
              onClick={() => {
                close();
                onJoinWaitlist();
              }}
            >
              Join waitlist
            </button>
            <button
              ref={burgerRef}
              type="button"
              className={`mnav__burger${open ? " is-open" : ""}`}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </div>

      <div
        ref={drawerRef}
        className={`mdrawer${open ? " is-open" : ""}`}
        aria-hidden={!open}
        role="dialog"
        aria-label="Navigation menu"
      >
        <Link href="#solution" onClick={close}>
          <span>Solution</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
        <Link href="#how" onClick={close}>
          <span>How it works</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
        <Link href="#pricing" onClick={close}>
          <span>Pricing</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
        <Link href="#career" onClick={close}>
          <span>Career</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
        <div className="mdrawer__divider" />
        <Link href="/login" onClick={close}>
          <span>Sign in</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
        </Link>
        <Link href="/book-a-demo" onClick={close}>
          <span>Book a demo</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   HERO
   ─────────────────────────────────────────────────────────────── */
function MobileHero({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  const barsRef = useRef<HTMLDivElement>(null);

  // Bars cycle — mirrors mobile.html script
  useEffect(() => {
    const stage = barsRef.current;
    if (!stage) return;
    if (stage.dataset.hydrated === "1") return;
    stage.dataset.hydrated = "1";

    const ROWS = 5;
    const BARS_PER_ROW = 4;
    const shades = ["shade-1", "shade-2", "shade-3", "shade-4"];
    const rand = (min: number, max: number) => Math.random() * (max - min) + min;
    const makeBar = () => {
      const el = document.createElement("div");
      el.className = "mbar";
      el.classList.add(shades[Math.floor(Math.random() * shades.length)]);
      if (Math.random() < 0.33) el.classList.add("fade");
      el.style.width = `${Math.round(rand(80, 200))}px`;
      return el;
    };

    const rows: HTMLDivElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "mbars-row";
      for (let i = 0; i < BARS_PER_ROW; i++) row.appendChild(makeBar());
      stage.appendChild(row);
      rows.push(row);
    }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const handle = window.setInterval(() => {
      if (document.hidden) return;
      const row = rows[Math.floor(Math.random() * rows.length)];
      const bars = Array.from(row.children) as HTMLElement[];
      if (!bars.length) return;
      const old = bars[Math.floor(Math.random() * bars.length)];
      old.classList.add("leaving");
      window.setTimeout(() => {
        const fresh = makeBar();
        fresh.style.opacity = "0";
        fresh.style.transform = "translateX(-18px) scaleX(0.7)";
        row.replaceChild(fresh, old);
        window.setTimeout(() => {
          fresh.style.opacity = "";
          fresh.style.transform = "";
        }, 32);
      }, 600);
    }, 1700);

    return () => {
      window.clearInterval(handle);
      delete stage.dataset.hydrated;
      while (stage.firstChild) stage.removeChild(stage.firstChild);
    };
  }, []);

  const phrase = "Making projects run themselves";
  const copies = Array.from({ length: 8 });

  return (
    <header id="top" className="mhero" data-screen-label="01 Hero">
      <div className="mhero__top">
        <div className="mhero__eyebrow">
          The autonomous execution layer for project management
        </div>
      </div>

      <div className="mhero__marquee" aria-label={`${phrase}.`}>
        <div className="mhero__marquee-track">
          {copies.map((_, i) => (
            <span key={i}>
              {phrase} <span className="mhero__marquee-dot" />
            </span>
          ))}
        </div>
      </div>

      <p className="mhero__sub">
        so that teams can focus on <b>outcomes</b> instead of updates
      </p>

      <div ref={barsRef} className="mbars-stage" aria-hidden="true" />

      <div className="mhero__cta-row">
        <button type="button" className="btn-primary" onClick={onJoinWaitlist}>
          Join the waitlist
        </button>
        <Link href="/book-a-demo" className="btn-secondary">
          Book a demo →
        </Link>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MISSION (swipe carousel)
   ─────────────────────────────────────────────────────────────── */
const MISSION_BOXES = [
  {
    title: "Alignment",
    body:
      "Aligns stakeholders, timelines, and work across fragmented systems, tools, and individuals.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M5 12h14" />
        <path d="M7 18h10" />
        <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Source of truth",
    body: "Creates a real-time, single source of truth for all work in flight.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="8" ry="2.5" />
        <path d="M4 5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5" />
        <path d="M4 11v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6" />
      </svg>
    ),
  },
  {
    title: "Coordination",
    body: "Eliminates manual coordination and constant status chasing.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Autonomous execution",
    body: "Automatically executes actions end-to-end — tasks, follow-ups, escalations.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12a8 8 0 1 1-3.5-6.6" />
        <path d="M21 4v4h-4" />
        <circle cx="12" cy="12" r="2.2" />
      </svg>
    ),
  },
  {
    title: "Project context",
    body: "Maintains full project knowledge and delivers instant, informed responses.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8 3 3 0 0 0 2 2.8V15a3 3 0 0 0 3 3 3 3 0 0 0 3-3V5a3 3 0 0 0-3-1Z" />
        <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8 3 3 0 0 1-2 2.8V15a3 3 0 0 1-3 3 3 3 0 0 1-3-3V5a3 3 0 0 1 3-1Z" />
      </svg>
    ),
  },
];

function MobileMission() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const card = scroller.querySelector(".mbox") as HTMLElement | null;
      if (!card) return;
      const cardW = card.offsetWidth + 12;
      const i = Math.round(scroller.scrollLeft / cardW);
      setActiveDot(Math.min(i, MISSION_BOXES.length - 1));
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const partnersDoubled = [...PARTNERS, ...PARTNERS];

  return (
    <section id="solution" className="msection" data-screen-label="02 Solution">
      <span className="mark-L">Larry</span>
      <h2>Aligns stakeholders, timelines, and work through autonomous execution</h2>
      <p className="msection__sub">So teams can focus on outcomes instead of updates.</p>

      <div className="mboxes" ref={scrollerRef}>
        {MISSION_BOXES.map((b) => (
          <div key={b.title} className="mbox">
            <div className="mbox__icon" aria-hidden="true">{b.icon}</div>
            <div className="mbox__hd">{b.title}</div>
            <div className="mbox__divider" />
            <div className="mbox__txt">{b.body}</div>
          </div>
        ))}
      </div>

      <div className="mboxes-dots" aria-hidden="true">
        {MISSION_BOXES.map((_, i) => (
          <span key={i} className={i === activeDot ? "is-active" : undefined} />
        ))}
      </div>

      <div className="mlogos">
        <div className="mlogos__label">Developed with teams from</div>
        <div className="mlogos__track-wrap">
          <div className="mlogos__track">
            {partnersDoubled.map((n, i) => (
              <span key={`${n}-${i}`} className="mlogo">
                <span className="dot" />
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   COMPARE
   ─────────────────────────────────────────────────────────────── */
function MobileCompare() {
  return (
    <section className="msection msection--soft" data-screen-label="03 Compare">
      <h2>Project management workflows, transformed</h2>
      <p className="msection__sub">Save time, budget, and eliminate unnecessary friction.</p>

      <div className="mcompare__grid">
        <div className="mcompare-card mcompare-card--bad">
          <div className="mcompare-card__head">
            <h3>
              Work <b>without</b> Larry
            </h3>
            <span className="mcompare__star" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 2 21h20L12 3Z" />
                <path d="M12 10v5" />
                <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </div>
          <div className="mcompare__lead">Project teams spend hours on:</div>
          <ul className="mcompare__list mcompare__list--bad">
            {WITHOUT.map((t) => (
              <li key={t}>
                <span className="dash">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mcompare-card mcompare-card--good">
          <div className="mcompare-card__head">
            <h3>
              Work <b>with</b> Larry
            </h3>
            <span className="mcompare__star" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2 14.6 8.6 21.5 9.2l-5.3 4.7L18 21l-6-3.7L6 21l1.8-7.1L2.5 9.2l6.9-.6L12 2Z" />
              </svg>
            </span>
          </div>
          <div className="mcompare__lead">Project teams experience:</div>
          <ul className="mcompare__list mcompare__list--good">
            {WITH.map((t) => (
              <li key={t}>
                <span className="check">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l5 5L20 7" />
                  </svg>
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   HOW IT WORKS — timeline
   ─────────────────────────────────────────────────────────────── */
const HOW_STEPS = [
  {
    num: "01",
    title: "Integrates",
    body:
      "Connects to Teams, email, Slack, and your existing stack — no migration, no new process.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3v5M15 3v5" />
        <rect x="7" y="8" width="10" height="6" rx="2" />
        <path d="M12 14v4" />
        <path d="M9 18a3 3 0 0 0 6 0" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Extracts",
    body:
      "Pulls actions, owners, and deadlines from emails, ticket comments, and meeting notes automatically.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14V8a6 6 0 0 1 12 0v6" />
        <path d="M4 14a3 3 0 0 0 6 0V8" />
        <path d="M10 14a3 3 0 0 0 6 0V8" />
        <path d="M18 4l2 2M18 8l2-2" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Executes",
    body: "Creates tasks, sends reminders, escalates blockers, and updates status — without you asking.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "Monitors",
    body: "Compiles standups, proactively flags risks, and surfaces key insights for leadership.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20V8" />
        <path d="M2 20h20" />
      </svg>
    ),
  },
];

function MobileHowItWorks() {
  return (
    <section id="how" className="msection" data-screen-label="04 How it works">
      <span className="mark-L">L</span>
      <h2>Project management that runs itself</h2>
      <p className="msection__sub">
        End-to-end project management that integrates, extracts, and executes.
      </p>

      <div className="mhowit">
        {HOW_STEPS.map((s) => (
          <div className="mstep" key={s.num}>
            <div className="mstep__icon-wrap">
              <div className="mstep__icon">
                {s.icon}
                <span className="mstep__num">{s.num}</span>
              </div>
            </div>
            <div className="mstep__body">
              <div className="mstep__hd">{s.title}</div>
              <div className="mstep__divider" />
              <div className="mstep__txt">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   AUDIENCE
   ─────────────────────────────────────────────────────────────── */
function MobileAudience() {
  return (
    <section className="msection msection--soft maudience" data-screen-label="05 Audience">
      <h2>
        Built for the people who own <span className="em">execution</span>
      </h2>
      <p className="msection__sub">Larry fits where the work actually gets coordinated and delivered.</p>

      <div className="mgroup-label">Roles</div>
      <div className="mroles">
        {ROLES.map((r) => (
          <div className="mrole" key={r.num}>
            <div className="mrole__num">{r.num}</div>
            <div className="mrole__name">{r.name}</div>
          </div>
        ))}
      </div>

      <div className="mgroup-label">Built for teams in</div>
      <div className="mindustries">
        {INDUSTRIES.map((n) => (
          <div className="mchip" key={n}>
            <span className="mchip__bullet" />
            {n}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   CAREER + PRICING
   ─────────────────────────────────────────────────────────────── */
function MobileCareer() {
  return (
    <section id="career" className="mpcs" data-screen-label="06 Careers">
      <div className="mpcs__inner">
        <div className="mtrojan">
          {/* Same artwork the desktop careers slot uses for continuity. */}
          <Image
            src="/tintoretto-miracle.webp"
            alt=""
            fill
            sizes="(max-width: 720px) 320px, 320px"
            style={{ objectFit: "cover" }}
          />
        </div>
        <h2>
          Join the team.
          <br />
          <span className="accent">Build the next era of execution.</span>
        </h2>
        <p className="mpcs__lede">
          We don&apos;t hire for fixed roles. We look for exceptional engineers and brilliant people with a strong skillset and character.
        </p>
        <div className="mpcs__cta-wrap">
          <Link className="btn-primary" href="/careers">
            Reach out
          </Link>
        </div>
      </div>
    </section>
  );
}

function MobilePricing() {
  return (
    <section id="pricing" className="mpcs" data-screen-label="07 Pricing">
      <div className="mpcs__inner">
        <h2>
          Pricing tailored to <span className="em">your team.</span>
        </h2>
        <p className="mpcs__lede">
          Book a demo call and we&apos;ll walk you through pricing for your team.
        </p>
        <div className="mpcs__cta-wrap">
          <Link className="btn-primary" href="/book-a-demo">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   CONTACT (typing bar)
   ─────────────────────────────────────────────────────────────── */
function MobileContact() {
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"typing" | "input">("typing");
  const [inputValue, setInputValue] = useState("");
  const stateRef = useRef({ li: 0, ci: 0, deleting: false, paused: false });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setTyped(TYPING_LINES[0]);
      return;
    }
    let t: number | undefined;
    const tick = () => {
      const s = stateRef.current;
      if (s.paused) return;
      const line = TYPING_LINES[s.li];
      if (!s.deleting) {
        s.ci++;
        setTyped(line.slice(0, s.ci));
        if (s.ci === line.length) {
          s.deleting = true;
          t = window.setTimeout(tick, 1900);
          return;
        }
        t = window.setTimeout(tick, 38 + Math.random() * 30);
      } else {
        s.ci--;
        setTyped(line.slice(0, s.ci));
        if (s.ci === 0) {
          s.deleting = false;
          s.li = (s.li + 1) % TYPING_LINES.length;
          t = window.setTimeout(tick, 250);
          return;
        }
        t = window.setTimeout(tick, 14);
      }
    };
    t = window.setTimeout(tick, 600);
    return () => {
      stateRef.current.paused = true;
      if (t) window.clearTimeout(t);
    };
  }, []);

  const switchToInput = () => {
    if (mode === "input") return;
    stateRef.current.paused = true;
    setMode("input");
    setInputValue(typed);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const msg = mode === "input" ? inputValue : typed;
    const qs = msg ? `?msg=${encodeURIComponent(msg)}` : "";
    window.location.href = `/book-a-demo${qs}`;
  };

  return (
    <section className="mcontact" data-screen-label="08 Contact">
      <div className="mcontact__inner">
        <div className="mcontact__L">L</div>
        <h2>Tell us what&apos;s slowing your team down.</h2>

        <form className="mcontact__bar" autoComplete="off" onSubmit={onSubmit}>
          {mode === "typing" ? (
            <div
              className="mcontact__type-line"
              role="button"
              tabIndex={0}
              onClick={switchToInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  switchToInput();
                }
              }}
            >
              <span>{typed}</span>
              <span className="mcontact__type-caret">|</span>
            </div>
          ) : (
            <input
              ref={inputRef}
              className="mcontact__input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tell us what's slowing your team down…"
            />
          )}
          <button type="submit" className="mcontact__send" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </form>

        <p className="mcontact__footnote">We read every message and will be in touch.</p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   FOOTER
   ─────────────────────────────────────────────────────────────── */
function MobileFooter() {
  return (
    <footer className="mfooter">
      <div className="mfooter__brand">
        <Image
          src="/Larryfulllogo.png"
          alt="Larry"
          width={160}
          height={40}
          style={{ height: 32, width: "auto", display: "block" }}
        />
      </div>
      <div className="mfooter__cols">
        <div>
          <div className="mfooter__col-label">Product</div>
          <ul className="mfooter__list">
            <li>
              <Link href="#solution">Overview</Link>
            </li>
            <li>
              <Link href="#how">How it works</Link>
            </li>
            <li>
              <Link href="#pricing">Pricing</Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mfooter__col-label">Company</div>
          <ul className="mfooter__list">
            <li>
              <Link href="/book-a-demo">Contact</Link>
            </li>
            <li>
              <Link href="/careers">Careers</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="mfooter__bottom">
        <span>© 2026 Larry. Making projects run themselves.</span>
        <span>larry-pm.com</span>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ROOT
   ─────────────────────────────────────────────────────────────── */
export function MobileLanding() {
  const onJoin = () => openWaitlist();

  return (
    <div className="landing-anna-mobile">
      <MobileNav onJoinWaitlist={onJoin} />
      <MobileHero onJoinWaitlist={onJoin} />
      <hr className="mdivider" />
      <MobileMission />
      <hr className="mdivider" />
      <MobileCompare />
      <hr className="mdivider" />
      <MobileHowItWorks />
      <hr className="mdivider" />
      <MobileAudience />
      <hr className="mdivider" />
      <MobileCareer />
      <hr className="mdivider" />
      <MobilePricing />
      <MobileContact />
      <MobileFooter />
    </div>
  );
}
