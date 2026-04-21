"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type SignalSrc = "slack" | "email" | "meeting" | "calendar" | "scan";

type ActionKind =
  | "risk_flag"
  | "reminder_send"
  | "task_create"
  | "status_update"
  | "deadline_change"
  | "email_draft"
  | "slack_message_draft"
  | "project_note_send";

type Tone = "suggested" | "accepted" | "auto";

type Beat = {
  src: SignalSrc;
  project: string;
  signal: string;
  action: {
    kind: ActionKind;
    tone: Tone;
    toneLabel: string;
    display: string;
    reason: string;
    meta: string;
  };
};

const ICON: Record<SignalSrc, string> = {
  slack: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4.5 12.5a1.5 1.5 0 1 1 0-3h1.5v3H4.5Zm3.75 0a1.5 1.5 0 0 1 3 0v3.75a1.5 1.5 0 0 1-3 0V12.5ZM8.25 4.5a1.5 1.5 0 0 1 3 0v4.5h-3V4.5ZM15.5 8.25a1.5 1.5 0 0 1 0-3h.25a1.5 1.5 0 0 1 0 3H15.5ZM15.5 11.75a1.5 1.5 0 0 1 3 0v.25a1.5 1.5 0 0 1-3 0v-.25Zm-3.75 3.75a1.5 1.5 0 0 1-3 0V15a1.5 1.5 0 0 1 3 0v.5Z"/></svg>`,
  email: `<svg viewBox="0 0 20 20" fill="none"><rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M3 6l7 5 7-5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  meeting: `<svg viewBox="0 0 20 20" fill="none"><rect x="2.5" y="5" width="11" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M14 9l4-2v6l-4-2V9Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  calendar: `<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  scan: `<svg viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

const KIND: Record<ActionKind, { label: string; color: string }> = {
  risk_flag: { label: "Risk Flag", color: "#dc2626" },
  reminder_send: { label: "Reminder", color: "#b45309" },
  task_create: { label: "Create Task", color: "#6c44f6" },
  status_update: { label: "Status Update", color: "#0891b2" },
  deadline_change: { label: "Deadline Change", color: "#c2410c" },
  email_draft: { label: "Email Draft", color: "#4f46e5" },
  slack_message_draft: { label: "Slack Draft", color: "#be185d" },
  project_note_send: { label: "Project Note", color: "#0f766e" },
};

const BEATS: Beat[] = [
  {
    src: "slack",
    project: "Platform migration",
    signal: `#eng-q3 · "vendor SLA confirm still not back — cutover is Thursday"`,
    action: {
      kind: "risk_flag",
      tone: "suggested",
      toneLabel: "Pending approval",
      display: `Flag "Migration dry-run" as at-risk and notify the portfolio owner.`,
      reason:
        "Vendor SLA confirmation is 3 days overdue; production cutover can't start without it.",
      meta: "Risk flag · requested by Larry · 2s ago",
    },
  },
  {
    src: "email",
    project: "Onboarding v4",
    signal: `hello@acme → "Can we get a Loom of the 4-screen flow before Fri?"`,
    action: {
      kind: "email_draft",
      tone: "suggested",
      toneLabel: "Pending approval",
      display: "Drafted reply to Priya with Loom attached and Friday EOD delivery.",
      reason:
        "Standard external follow-up. Larry pulled the latest Loom from the project channel.",
      meta: "Email draft · awaits send · 4s ago",
    },
  },
  {
    src: "meeting",
    project: "Q3 programme",
    signal: `Tues stand-up transcript · "Marcus said he's blocked on design review"`,
    action: {
      kind: "task_create",
      tone: "auto",
      toneLabel: "Auto executed",
      display: `Added subtask "Design review unblock" owned by @lena, due Thu.`,
      reason:
        "Speaker attribution + explicit blocker → owner-mapped via prior review cadence.",
      meta: "Create task · executed by Larry · just now",
    },
  },
  {
    src: "calendar",
    project: "Launch · GA",
    signal: `invite · "Launch comms sync · Thu 15:00" moved to Fri 09:00`,
    action: {
      kind: "deadline_change",
      tone: "auto",
      toneLabel: "Auto executed",
      display: `Shifted "Comms calendar" milestone to Fri and re-stacked dependents.`,
      reason:
        "Cascades: 3 tasks moved, 1 owner re-notified. No external stakeholder impact.",
      meta: "Deadline change · executed by Larry · just now",
    },
  },
  {
    src: "scan",
    project: "Platform migration",
    signal:
      "scheduled scan · 6/6 cutover runbook checks green in Slack between 14:02–14:18",
    action: {
      kind: "status_update",
      tone: "accepted",
      toneLabel: "Accepted",
      display: `Moved "Staging cutover" to Completed. Rolled up Infra to 80%.`,
      reason: "All six checks green in #ops-cutover. No open blockers in linked chat.",
      meta: "Status update · accepted by Mo · 1m ago",
    },
  },
  {
    src: "slack",
    project: "Onboarding v4",
    signal: `DM · "@marcus any update on the 4-screen collapse? deadline Fri."`,
    action: {
      kind: "reminder_send",
      tone: "suggested",
      toneLabel: "Pending approval",
      display: `Send gentle nudge to @marcus on "Collapse to 4 screens."`,
      reason: "Due in 48h. Last activity was Thursday's mock review; no commits since.",
      meta: "Reminder · in your voice · 3s ago",
    },
  },
  {
    src: "email",
    project: "Q3 programme",
    signal: `exec@acme → "Give me the blockers this week in two lines."`,
    action: {
      kind: "project_note_send",
      tone: "auto",
      toneLabel: "Auto executed",
      display: "Sent 2-line blockers digest to the exec thread.",
      reason:
        "Exec-threshold request. Two blockers pulled from action ledger + linked owners.",
      meta: "Project note · executed by Larry · just now",
    },
  },
];

const DROP_MAP: Record<"slack" | "email" | "meeting" | "calendar", number> = {
  slack: 5,
  email: 1,
  meeting: 2,
  calendar: 3,
};

const SRC_LABEL: Record<SignalSrc, string> = {
  slack: "Slack",
  email: "Email",
  meeting: "Meeting",
  calendar: "Calendar",
  scan: "Scan",
};

export function SituationRoom() {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const boltsRef = useRef<SVGSVGElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const statSigRef = useRef<HTMLSpanElement>(null);
  const statActRef = useRef<HTMLSpanElement>(null);
  const statPendRef = useRef<HTMLSpanElement>(null);

  // Imperative beat-engine state, kept out of React render cycle.
  const runtimeRef = useRef({
    beatIdx: 0,
    actionsTaken: 0,
    pendingCount: 0,
    autoTimer: null as ReturnType<typeof setTimeout> | null,
    visible: true,
    running: false,
  });

  useEffect(() => {
    const runtime = runtimeRef.current;
    const STAGE = stageRef.current!;
    const TRACK = trackRef.current!;
    const STACK = stackRef.current!;
    const SEAL = sealRef.current!;
    const BOLTS = boltsRef.current!;
    const STATUS = statusRef.current!;
    const LABEL = labelRef.current!;
    const STAT_SIG = statSigRef.current!;
    const STAT_ACT = statActRef.current!;
    const STAT_PEND = statPendRef.current!;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    const hexLighten = (h: string, pct: number) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(h);
      if (!m) return h;
      const r = parseInt(m[1].slice(0, 2), 16);
      const g = parseInt(m[1].slice(2, 4), 16);
      const b = parseInt(m[1].slice(4, 6), 16);
      const x = (c: number) => Math.round(c + (255 - c) * (pct / 100));
      return `rgb(${x(r)},${x(g)},${x(b)})`;
    };

    const hexDarken = (h: string, pct: number) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(h);
      if (!m) return h;
      const r = parseInt(m[1].slice(0, 2), 16);
      const g = parseInt(m[1].slice(2, 4), 16);
      const b = parseInt(m[1].slice(4, 6), 16);
      const x = (c: number) => Math.round(c * (1 - pct / 100));
      return `rgb(${x(r)},${x(g)},${x(b)})`;
    };

    const el = (h: string) => {
      const t = document.createElement("template");
      t.innerHTML = h.trim();
      return t.content.firstElementChild as HTMLElement;
    };

    const formatSignal = (b: Beat) => {
      const L = SRC_LABEL[b.src];
      return `<div class="lv3-signal lv3-signal--${b.src}"><div class="lv3-signal__ico">${ICON[b.src]}</div><div class="lv3-signal__body"><div class="lv3-signal__src">${L} · ${b.project}</div><div class="lv3-signal__txt">${b.signal}</div></div></div>`;
    };

    const formatAction = (b: Beat) => {
      const k = KIND[b.action.kind];
      const kindBg = hexLighten(k.color, 88);
      const kindFg = hexDarken(k.color, 10);
      const kindBorder = hexLighten(k.color, 65);
      return `<div class="lv3-act"><div class="lv3-act__head"><span class="lv3-act__proj"><svg viewBox="0 0 14 14" fill="none"><path d="M2 4a1 1 0 0 1 1-1h3l1 1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" stroke="currentColor" stroke-width="1.2"/></svg>${b.project}</span><span class="lv3-act__tone lv3-act__tone--${b.action.tone}">${b.action.toneLabel}</span><span class="lv3-act__kind" style="background:${kindBg};color:${kindFg};border:1px solid ${kindBorder}">${k.label}</span></div><div class="lv3-act__display">${b.action.display}</div><div class="lv3-act__reason">${b.action.reason}</div><div class="lv3-act__meta">${b.action.meta}</div></div>`;
    };

    const ensureGrad = (w: number) => {
      if (BOLTS.querySelector("#lv3-bolt-grad")) return;
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.innerHTML = `<linearGradient id="lv3-bolt-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0"><stop offset="0" stop-color="#8b5cf6" stop-opacity="0"/><stop offset="0.5" stop-color="#6c44f6" stop-opacity="0.9"/><stop offset="1" stop-color="#6c44f6" stop-opacity="0.2"/></linearGradient>`;
      BOLTS.appendChild(defs);
    };

    const fireBolt = (fromEl: HTMLElement) => {
      const sr = STAGE.getBoundingClientRect();
      const fr = fromEl.getBoundingClientRect();
      const sealR = SEAL.getBoundingClientRect();
      const ax = fr.right - sr.left;
      const ay = fr.top + fr.height / 2 - sr.top;
      const bx = sealR.left + sealR.width / 2 - sr.left;
      const by = sealR.top + sealR.height / 2 - sr.top;
      const d = `M ${ax},${ay} C ${(ax + bx) / 2},${ay} ${(ax + bx) / 2},${by} ${bx},${by}`;
      BOLTS.setAttribute("width", String(sr.width));
      BOLTS.setAttribute("height", String(sr.height));
      BOLTS.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
      ensureGrad(sr.width);
      const existing = BOLTS.querySelectorAll("path");
      if (existing.length > 3) {
        existing.forEach((n, i) => {
          if (i < existing.length - 2) n.remove();
        });
      }
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "url(#lv3-bolt-grad)");
      p.setAttribute("stroke-width", "1.4");
      p.setAttribute("stroke-linecap", "round");
      BOLTS.appendChild(p);
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 600, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" }
      );
      schedule(() => {
        p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" });
        schedule(() => {
          if (p.parentNode) p.remove();
        }, 550);
      }, 550);
      schedule(firePulse, 540);
    };

    const firePulse = () => {
      const p = document.createElement("div");
      p.className = "lv3-pulse lv3-pulse--fire";
      SEAL.parentElement!.appendChild(p);
      schedule(() => p.remove(), 1500);
    };

    const setStatus = (t: string, active = true) => {
      LABEL.textContent = t;
      STATUS.classList.toggle("is-active", active);
    };

    const repositionSignals = () => {
      Array.from(TRACK.children).forEach((s, i) => {
        (s as HTMLElement).style.top = i * 70 + "px";
      });
    };

    const runBeat = (b: Beat) => {
      const sig = el(formatSignal(b));
      TRACK.prepend(sig);
      requestAnimationFrame(() => {
        sig.classList.add("is-in");
        repositionSignals();
      });
      const trackOverflow = TRACK.children.length - 6;
      for (let i = 0; i < trackOverflow; i++) {
        const idx = TRACK.children.length - 1 - i;
        const old = TRACK.children[idx] as HTMLElement | undefined;
        if (!old || old.dataset.leaving === "1") continue;
        old.dataset.leaving = "1";
        old.classList.add("is-absorb");
        schedule(() => old.remove(), 900);
      }

      schedule(() => {
        setStatus("Parsing " + b.src + " signal");
        sig.classList.add("is-absorb");
        fireBolt(sig);
        SEAL.classList.add("is-thinking");
        schedule(() => SEAL.classList.remove("is-thinking"), 1200);
      }, 900);

      schedule(
        () => setStatus("Drafting " + KIND[b.action.kind].label.toLowerCase()),
        1600
      );

      schedule(() => {
        const a = el(formatAction(b));
        STACK.prepend(a);
        requestAnimationFrame(() => a.classList.add("is-in"));
        sig.remove();
        const stackOverflow = STACK.children.length - 4;
        for (let i = 0; i < stackOverflow; i++) {
          const idx = STACK.children.length - 1 - i;
          const o = STACK.children[idx] as HTMLElement | undefined;
          if (!o || o.dataset.leaving === "1") continue;
          o.dataset.leaving = "1";
          o.style.transition = "opacity .6s, transform .6s";
          o.style.opacity = "0";
          o.style.transform = "translateY(20px) scale(0.96)";
          schedule(() => o.remove(), 650);
        }
        runtime.actionsTaken += 1;
        STAT_ACT.textContent = String(runtime.actionsTaken);
        if (b.action.tone === "suggested") {
          runtime.pendingCount += 1;
          STAT_PEND.textContent = String(runtime.pendingCount);
        }
        if (b.action.tone === "auto" || b.action.tone === "accepted") {
          schedule(() => a.classList.add("is-complete"), 1200);
        }
        setStatus("Listening", false);
      }, 2200);
    };

    const scheduleNext = (delay: number) => {
      if (runtime.autoTimer) {
        clearTimeout(runtime.autoTimer);
        runtime.autoTimer = null;
      }
      if (!runtime.visible) return;
      runtime.autoTimer = setTimeout(tick, delay);
    };

    const tick = () => {
      runtime.autoTimer = null;
      if (runtime.running || !runtime.visible || document.hidden) {
        scheduleNext(1500);
        return;
      }
      runtime.running = true;
      runBeat(BEATS[runtime.beatIdx % BEATS.length]);
      runtime.beatIdx += 1;
      schedule(() => {
        runtime.running = false;
        scheduleNext(1000);
      }, 2400);
    };

    // Drop handler exposed via window-scoped custom event so chip buttons can call into us.
    const onDrop = (evt: Event) => {
      const which = (evt as CustomEvent<"slack" | "email" | "meeting" | "calendar">).detail;
      const idx = DROP_MAP[which];
      if (idx == null) return;
      if (runtime.running) return;
      if (runtime.autoTimer) {
        clearTimeout(runtime.autoTimer);
        runtime.autoTimer = null;
      }
      runtime.running = true;
      runBeat(BEATS[idx]);
      schedule(() => {
        runtime.running = false;
        scheduleNext(1200);
      }, 2400);
    };
    window.addEventListener("lv3:drop", onDrop as EventListener);

    // Statistics ticker.
    let n = 42;
    const statInterval = setInterval(() => {
      if (document.hidden) return;
      n += Math.round((Math.random() - 0.5) * 6);
      n = Math.max(28, Math.min(68, n));
      STAT_SIG.textContent = String(n);
    }, 1800);

    // IntersectionObserver gates auto-play to on-screen visibility.
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          runtime.visible = entry.isIntersecting;
          if (!runtime.visible) {
            if (runtime.autoTimer) {
              clearTimeout(runtime.autoTimer);
              runtime.autoTimer = null;
            }
          } else if (!runtime.autoTimer && !runtime.running && runtime.beatIdx > 0) {
            scheduleNext(1500);
          }
        }),
      { threshold: 0.1 }
    );
    io.observe(STAGE);

    const onVisibility = () => {
      if (document.hidden) {
        if (runtime.autoTimer) {
          clearTimeout(runtime.autoTimer);
          runtime.autoTimer = null;
        }
      } else if (
        runtime.visible &&
        !runtime.running &&
        !runtime.autoTimer &&
        runtime.beatIdx > 0
      ) {
        scheduleNext(1200);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Kick it off.
    schedule(() => {
      setStatus("Listening", false);
      tick();
    }, 700);

    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      if (runtime.autoTimer) clearTimeout(runtime.autoTimer);
      runtime.autoTimer = null;
      clearInterval(statInterval);
      io.disconnect();
      window.removeEventListener("lv3:drop", onDrop as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section className="lv3-room" aria-label="Larry situation room — live">
      <div className="lv3-room__chrome">
        <div className="lv3-room__chrome-left">
          <span className="lv3-room__seal">
            <Image src="/Larry_logos.png" alt="" width={20} height={20} />
          </span>
          <span className="lv3-room__live">Situation room</span>
          <span className="lv3-room__ws">Workspace · Acme · 14 projects</span>
        </div>
        <div className="lv3-room__chrome-right">
          <span className="lv3-room__stat">
            Signals/min <b ref={statSigRef}>—</b>
          </span>
          <span className="lv3-room__stat">
            Actions taken <b ref={statActRef}>0</b>
          </span>
          <span className="lv3-room__stat">
            Pending review <b ref={statPendRef}>0</b>
          </span>
        </div>
      </div>

      <div className="lv3-stage" ref={stageRef}>
        <div className="lv3-col lv3-col--signals">
          <div className="lv3-col__head">Signals in</div>
          <div className="lv3-signal-track" ref={trackRef} />
        </div>

        <div className="lv3-col lv3-col--core">
          <div className="lv3-core-wrap">
            <div className="lv3-ring lv3-ring--r4" />
            <div className="lv3-ring lv3-ring--r3" />
            <div className="lv3-ring lv3-ring--r2" />
            <div className="lv3-ring lv3-ring--r1" />
            <div className="lv3-seal" ref={sealRef}>
              <Image src="/Larry_logos.png" alt="Larry" width={60} height={60} />
            </div>
            <div className="lv3-core-status" ref={statusRef}>
              <span className="lv3-core-status__dots">
                <i />
                <i />
                <i />
              </span>
              <span ref={labelRef}>Listening</span>
            </div>
          </div>
        </div>

        <div className="lv3-col lv3-col--actions">
          <div className="lv3-col__head">Actions out</div>
          <div className="lv3-act-stack" ref={stackRef} />
        </div>

        <svg className="lv3-bolts" ref={boltsRef} xmlns="http://www.w3.org/2000/svg" />
      </div>

      <DropPanel />
    </section>
  );
}

function DropPanel() {
  const dispatch = (which: "slack" | "email" | "meeting" | "calendar") => {
    window.dispatchEvent(new CustomEvent("lv3:drop", { detail: which }));
  };

  const chips: {
    key: "slack" | "email" | "meeting" | "calendar";
    label: string;
    svg: React.ReactNode;
  }[] = [
    {
      key: "slack",
      label: "Slack thread",
      svg: (
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M4.5 12.5a1.5 1.5 0 1 1 0-3h1.5v3H4.5Zm3.75 0a1.5 1.5 0 0 1 3 0v3.75a1.5 1.5 0 0 1-3 0V12.5ZM8.25 4.5a1.5 1.5 0 0 1 3 0v4.5h-3V4.5ZM15.5 8.25a1.5 1.5 0 0 1 0-3h.25a1.5 1.5 0 0 1 0 3H15.5ZM15.5 11.75a1.5 1.5 0 0 1 3 0v.25a1.5 1.5 0 0 1-3 0v-.25Zm-3.75 3.75a1.5 1.5 0 0 1-3 0V15a1.5 1.5 0 0 1 3 0v.5Z" />
        </svg>
      ),
    },
    {
      key: "email",
      label: "Email",
      svg: (
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 6l7 5 7-5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
    {
      key: "meeting",
      label: "Meeting transcript",
      svg: (
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="2.5" y="5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M14 9l4-2v6l-4-2V9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: "calendar",
      label: "Calendar invite",
      svg: (
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="lv3-drop">
      <div className="lv3-drop__intro">
        <h3>Drop in a signal. Watch Larry act.</h3>
        <p>
          Pick a source and Larry will parse it, draft the right action, and
          execute — live, in the room above.
        </p>
      </div>
      <div className="lv3-drop__chips">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`lv3-chip lv3-chip--${c.key}`}
            onClick={() => dispatch(c.key)}
          >
            {c.svg}
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
