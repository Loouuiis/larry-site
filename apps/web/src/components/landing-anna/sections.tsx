import Image from "next/image";
import Link from "next/link";
import { HeroMarquee } from "./HeroMarquee";
import { HeroBars } from "./HeroBars";
import { LogosStrip } from "./LogosStrip";
import { TrojanRubric } from "./TrojanRubric";
import { TypingContactBar } from "./TypingContactBar";

/* ─────────────────────────────────────────────────────────────────
   HERO
   ─────────────────────────────────────────────────────────────── */
export function HeroSection() {
  return (
    <header id="top" className="hero" data-screen-label="01 Hero">
      <div className="hero__top">
        <div className="hero__eyebrow">
          The autonomous execution layer for project management
        </div>
      </div>
      <HeroMarquee />
      <div className="hero__top">
        <p className="hero__sub">
          so that teams can focus on <b>outcomes</b> instead of updates
        </p>
      </div>
      <HeroBars />
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MISSION / SOLUTION
   ─────────────────────────────────────────────────────────────── */
function MissionBox({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="box">
      <div className="box__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="box__hd">{title}</div>
      <div className="box__divider" />
      <div className="box__txt">{body}</div>
    </div>
  );
}

export function MissionSection() {
  return (
    <section id="solution" className="section mission" data-screen-label="02 Solution">
      <div className="section-inner">
        <div className="mission__topmark">
          <Image
            src="/Larry_logos.png"
            alt="Larry"
            width={260}
            height={88}
            style={{ height: 88, width: "auto", display: "block", margin: "0 auto" }}
          />
        </div>
        <h2>
          Making projects run themselves by aligning stakeholders,
          <br />
          timelines, and work through autonomous execution
        </h2>
        <p className="mission__sub">
          so that teams can focus on outcomes instead of updates.
        </p>

        <div className="boxes-5">
          <MissionBox
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M5 12h14" />
                <path d="M7 18h10" />
                <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            }
            title="Alignment"
            body="Aligns stakeholders, timelines, and work across fragmented systems, tools, and individuals."
          />
          <MissionBox
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="8" ry="2.5" />
                <path d="M4 5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5" />
                <path d="M4 11v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6" />
              </svg>
            }
            title="Source of truth"
            body="Creates a real-time, single source of truth for all work in flight."
          />
          <MissionBox
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="6" r="2" />
                <circle cx="6" cy="18" r="2" />
                <circle cx="18" cy="18" r="2" />
                <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            }
            title="Coordination"
            body="Eliminates manual coordination and constant status chasing."
          />
          <MissionBox
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12a8 8 0 1 1-3.5-6.6" />
                <path d="M21 4v4h-4" />
                <circle cx="12" cy="12" r="2.2" />
              </svg>
            }
            title="Autonomous Execution"
            body="Automatically executes actions end-to-end — tasks, follow-ups, escalations."
          />
          <MissionBox
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8v0a3 3 0 0 0 2 2.8V15a3 3 0 0 0 3 3v0a3 3 0 0 0 3-3V5a3 3 0 0 0-3-1Z" />
                <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8 3 3 0 0 1-2 2.8V15a3 3 0 0 1-3 3 3 3 0 0 1-3-3V5a3 3 0 0 1 3-1Z" />
              </svg>
            }
            title="Project Context"
            body="Maintains full project knowledge and delivers instant, informed responses."
          />
        </div>

        <LogosStrip />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   COMPARISON — Without / With Larry
   ─────────────────────────────────────────────────────────────── */
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

export function CompareSection() {
  return (
    <section className="section section--soft compare" data-screen-label="03 Compare">
      <div className="section-inner">
        <h2>
          Larry transforms project management workflows
          <br />
          from planning to execution
        </h2>
        <p className="compare__sub">
          Save your team time, budget and eliminate unnecessary friction.
        </p>

        <div className="compare__grid">
          <div className="compare-card compare-card--bad" data-comment-anchor="without-larry">
            <div className="compare-card__reveal" />
            <div className="compare-card__head">
              <h3>
                Work <b>without</b> Larry
              </h3>
              <span className="compare__star" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 2 21h20L12 3Z" />
                  <path d="M12 10v5" />
                  <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </span>
            </div>
            <div className="compare__lead">Project teams spend hours on:</div>
            <ul className="compare__list compare__list--bad">
              {WITHOUT.map((item) => (
                <li key={item}>
                  <span className="dash">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare-card compare-card--good" data-comment-anchor="with-larry">
            <div className="compare-card__reveal" />
            <div className="compare-card__head">
              <h3>
                Work <b>with</b> Larry
              </h3>
              <span className="compare__star" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M12 2 14.6 8.6 21.5 9.2l-5.3 4.7L18 21l-6-3.7L6 21l1.8-7.1L2.5 9.2l6.9-.6L12 2Z" />
                </svg>
              </span>
            </div>
            <div className="compare__lead">Project teams experience:</div>
            <ul className="compare__list compare__list--good">
              {WITH.map((item) => (
                <li key={item}>
                  <span className="check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l5 5L20 7" />
                    </svg>
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   HOW IT WORKS
   ─────────────────────────────────────────────────────────────── */
function Step({
  num,
  icon,
  title,
  body,
}: {
  num: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="step">
      <div className="step__num">{num}</div>
      <div className="step__icon">{icon}</div>
      <div className="step__hd">{title}</div>
      <div className="step__divider" />
      <div className="step__txt">{body}</div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section className="section howit" data-screen-label="04 How it works">
      <div className="section-inner">
        <div className="howit__l">
          <Image
            src="/Larry_logo.png"
            alt="Larry"
            width={120}
            height={120}
            style={{ height: 120, width: "auto", display: "block", margin: "0 auto" }}
          />
        </div>
        <h2>Project management that runs itself</h2>
        <p className="howit__sub">
          End-to-end project management that integrates, extracts and executes — turning scattered work into structured execution.
        </p>

        <div className="howit__steps">
          <Step
            num="01"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3v5M15 3v5" />
                <rect x="7" y="8" width="10" height="6" rx="2" />
                <path d="M12 14v4" />
                <path d="M9 18a3 3 0 0 0 6 0" />
              </svg>
            }
            title="Integrates"
            body="Integrates with Teams, email, Slack and your existing stack of tools — no migration, no new process."
          />
          <Step
            num="02"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14V8a6 6 0 0 1 12 0v6" />
                <path d="M4 14a3 3 0 0 0 6 0V8" />
                <path d="M10 14a3 3 0 0 0 6 0V8" />
                <path d="M18 4l2 2M18 8l2-2" />
              </svg>
            }
            title="Extracts"
            body="Extracts actions, owners, and deadlines from emails, ticket comments, and meeting notes automatically."
          />
          <Step
            num="03"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
              </svg>
            }
            title="Executes"
            body="Creates tasks, sends reminders, escalates blockers, and updates status based on real activity — without you asking."
          />
          <Step
            num="04"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V10" />
                <path d="M10 20V4" />
                <path d="M16 20v-7" />
                <path d="M22 20V8" />
                <path d="M2 20h20" />
              </svg>
            }
            title="Monitors"
            body="Compiles standups, proactively flags risks, and surfaces key insights for leadership to ensure timely execution and delivery."
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   AUDIENCE
   ─────────────────────────────────────────────────────────────── */
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

export function AudienceSection() {
  return (
    <section className="section section--soft audience" data-screen-label="05 Audience">
      <div className="section-inner">
        <h2>
          Built for the people who own
          <br />
          project management <span className="em">and execution</span>
        </h2>
        <p className="audience__sub">
          Larry fits where the work actually gets coordinated and delivered.
        </p>

        <div className="audience__group-label">Roles</div>
        <div className="roles">
          {ROLES.map((r) => (
            <div className="role" key={r.num}>
              <div className="role__num">{r.num}</div>
              <div className="role__name">{r.name}</div>
            </div>
          ))}
        </div>

        <div className="audience__group-label">Built for teams in</div>
        <div className="industries">
          {INDUSTRIES.map((name) => (
            <div className="chip" key={name}>
              <span className="chip__bullet" />
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   CAREERS SLOT (on landing page — the dedicated reach-out page lives at /careers)
   ─────────────────────────────────────────────────────────────── */
export function CareersSlot() {
  return (
    <section id="career" className="pcs pcs--career" data-screen-label="06 Careers">
      <div className="pcs__inner">
        <div>
          <h2>
            Join the team.
            <br />
            <span className="accent">
              Build the next era
              <br />
              of project execution.
            </span>
          </h2>
          <p className="pcs__lede">
            We don&apos;t hire for fixed team roles. Instead, we look for exceptional engineers and brilliant people with a strong skillset and character. Join the founding team and help shape the future of how work gets done.
          </p>
          <Link className="btn-primary" href="/careers">
            Reach out
          </Link>
        </div>
        {/* Anna is sourcing the final image for this slot — the Tintoretto
            also used on the /careers page is a placeholder for now. */}
        <TrojanRubric src="/tintoretto-miracle.webp" alt="" />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PRICING SLOT
   ─────────────────────────────────────────────────────────────── */
export function PricingSlot() {
  return (
    <section id="pricing" className="pcs pcs--pricing" data-screen-label="07 Pricing">
      <div className="pcs__inner">
        <div>
          <h2>
            Pricing tailored to <span className="accent">your team.</span>
          </h2>
          <p className="pcs__lede">
            Get pricing tailored to your needs — book a demo call and we&apos;ll walk you through it.
          </p>
          <Link className="btn-primary" href="/book-a-demo">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   CONTACT (dark panel + typing bar)
   ─────────────────────────────────────────────────────────────── */
export function ContactSection() {
  return (
    <section className="contact" data-screen-label="08 Contact">
      <div className="contact__inner">
        <div className="contact__L">
          <Image
            src="/Larry_logo.png"
            alt="Larry"
            width={64}
            height={64}
            style={{ height: 64, width: "auto", display: "block", margin: "0 auto" }}
          />
        </div>
        <h2>Tell us what&apos;s slowing your team down.</h2>
        <TypingContactBar />
        <p className="contact__footnote">We read every message and will be in touch.</p>
      </div>
    </section>
  );
}
