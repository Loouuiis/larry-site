"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, Users, Upload, ChevronRight,
  Mail, CalendarPlus, CheckSquare, AlertTriangle,
  Check, RefreshCw, Mic, X, FileText, Sparkles,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

interface ActionItem {
  owner: string;
  task: string;
  due: string;
  status: "pending" | "done" | "overdue";
}

interface Meeting {
  id: string;
  title: string;
  project: string;
  date: string;
  duration: string;
  attendees: string[];
  transcript: TranscriptLine[];
  summary: string;
  decisions: string[];
  actions: ActionItem[];
  risks: string[];
}

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const MEETINGS: Meeting[] = [
  {
    id: "m1",
    title: "Q3 Programme Weekly Sync",
    project: "Q3 Programme",
    date: "Today, 9:00am",
    duration: "45 min",
    attendees: ["SR", "LP", "AK", "ME"],
    summary: "Reviewed progress across all 3 workstreams. Client deliverables remain the critical path blocker — SR is chasing sign-off. LP to coordinate cross-team dependencies by EOD. March 28 deadline is at risk if sign-off isn't received by Mar 22.",
    decisions: [
      "Escalate client sign-off to account director if not received by Mar 22",
      "Add buffer to Workstream 2 timeline — 2 extra days approved",
      "Weekly cadence to remain on Thursdays 9am",
    ],
    actions: [
      { owner: "SR", task: "Chase client for deliverables sign-off",    due: "Today",  status: "pending" },
      { owner: "LP", task: "Resolve cross-team dependency conflicts",    due: "Today",  status: "pending" },
      { owner: "AK", task: "Update project tracker with latest status", due: "Mar 22", status: "done"    },
    ],
    risks: [
      "March 28 deadline at risk if sign-off not received by Mar 22",
      "Workstream 2 has zero buffer — any delay compounds",
    ],
    transcript: [
      { time: "09:00", speaker: "SR", text: "Good morning everyone. Let's kick off. Quick round — any blockers before we start?" },
      { time: "09:01", speaker: "LP", text: "Nothing from me upfront, but I do have a dependency issue to flag — Workstream 1 and 3 are now blocking each other." },
      { time: "09:02", speaker: "AK", text: "Tracker is fully up to date. I updated all tasks last night so we have a clean baseline." },
      { time: "09:03", speaker: "ME", text: "No blockers on my end this week. Progressing steadily." },
      { time: "09:04", speaker: "SR", text: "Client still hasn't come back on the deliverables. I've sent two follow-ups. I'll try calling them today — might need to escalate." },
      { time: "09:06", speaker: "LP", text: "On the dependency — I think a quick sync between workstream leads would sort it. Maybe 30 mins today?" },
      { time: "09:08", speaker: "SR", text: "Agreed. Let's do it. AK, can you pull together the conflict map from the tracker so we can walk through it?" },
      { time: "09:09", speaker: "AK", text: "On it. I'll have it ready before the sync." },
      { time: "09:12", speaker: "ME", text: "One thing to flag — if the client sign-off slips past Mar 22, we're going to be in trouble on the March 28 deadline. That's a real risk." },
      { time: "09:13", speaker: "SR", text: "Noted. If I don't hear back by EOD today, I'll escalate directly to the account director. Let's call that the contingency." },
      { time: "09:15", speaker: "LP", text: "Agreed. I'll notify the steering committee so they're not surprised." },
    ],
  },
  {
    id: "m2",
    title: "Alpha Launch — Engineering Review",
    project: "Alpha Launch",
    date: "Yesterday, 2:00pm",
    duration: "30 min",
    attendees: ["TK", "ME", "JP"],
    summary: "API spec is 95% complete — TK is finalising the auth error-handling section. Budget approval from Finance (JP) is the next gate. Architecture is signed off and sprint planning is ready to kick off once the spec is done.",
    decisions: [
      "API spec sign-off deadline confirmed: COB today",
      "Sprint planning starts immediately after sign-off",
      "Finance review meeting booked for Mar 24",
    ],
    actions: [
      { owner: "TK", task: "Complete API spec sign-off",             due: "Today",  status: "overdue" },
      { owner: "JP", task: "Submit budget for Finance approval",      due: "Mar 24", status: "pending" },
      { owner: "ME", task: "Kick off sprint planning after sign-off", due: "Mar 25", status: "pending" },
    ],
    risks: [
      "API sign-off delay blocks sprint start — risks Apr 5 go-live",
    ],
    transcript: [
      { time: "14:00", speaker: "ME", text: "Let's get started. TK, where are we on the API spec?" },
      { time: "14:01", speaker: "TK", text: "95% done. The main auth flow is solid — I'm just finalising the error-handling section. Should be done by COB today." },
      { time: "14:02", speaker: "JP", text: "Finance are ready to review once the spec is locked. I've got a slot booked on the 24th." },
      { time: "14:04", speaker: "ME", text: "Good. Once I have sign-off I can kick off sprint planning straight away — team is ready to go." },
      { time: "14:06", speaker: "TK", text: "Architecture is fully approved. No blockers there. It's just this last section of the spec." },
      { time: "14:08", speaker: "JP", text: "Budget deck is also ready. I'll submit it to Finance the moment the spec is signed." },
      { time: "14:10", speaker: "ME", text: "TK, any risk you won't make COB today?" },
      { time: "14:11", speaker: "TK", text: "Low risk. I'd say 90% confident. I'll flag immediately if anything changes." },
      { time: "14:12", speaker: "ME", text: "Perfect. Let's hold the Apr 5 go-live date for now. We'll reassess if sign-off slips past today." },
    ],
  },
  {
    id: "m3",
    title: "Platform Migration — Security Review",
    project: "Platform Migration",
    date: "Mar 18, 11:00am",
    duration: "60 min",
    attendees: ["ME", "LP", "TK"],
    summary: "Security review identified 2 critical gaps in the auth layer. ME to remediate before migration can proceed. Estimated 5-day delay to the overall timeline if gaps aren't resolved by Mar 22. Steering committee has been notified.",
    decisions: [
      "Migration paused until auth layer gaps are fully remediated",
      "ME to submit fix for review by Mar 22 — TK to review same day",
      "Ops team notified to hold the migration window",
    ],
    actions: [
      { owner: "ME", task: "Remediate auth layer security gaps",        due: "Mar 22", status: "overdue" },
      { owner: "LP", task: "Update steering committee on timeline",     due: "Mar 21", status: "done"    },
      { owner: "TK", task: "Review ME's remediation plan",             due: "Mar 23", status: "pending" },
    ],
    risks: [
      "5-day delay if auth gaps not resolved by Mar 22",
      "Migration window may need rescheduling — ops coordination required",
    ],
    transcript: [
      { time: "11:00", speaker: "ME", text: "Thanks for joining. I'll get straight to it — the security review flagged two critical gaps in the auth layer. Both need fixing before we proceed." },
      { time: "11:02", speaker: "TK", text: "Can you walk us through them? Are we talking about architecture issues or implementation bugs?" },
      { time: "11:03", speaker: "ME", text: "Implementation bugs, thankfully. The first is a session token handling issue — tokens are being stored in a way that doesn't meet our compliance requirements. The second is a missing rate-limit on the auth endpoint." },
      { time: "11:06", speaker: "LP", text: "How long will the fix take?" },
      { time: "11:07", speaker: "ME", text: "I'd estimate 3 to 4 days to fix and test both. If I start today, I can have it ready for review by the 22nd." },
      { time: "11:09", speaker: "TK", text: "I can do a same-day review once you submit. Fast-track it." },
      { time: "11:10", speaker: "LP", text: "I'll notify the steering committee this afternoon. They need to know about the timeline impact." },
      { time: "11:12", speaker: "ME", text: "Agreed. The migration window will need to shift. I'll coordinate with ops once the fix is confirmed." },
      { time: "11:14", speaker: "TK", text: "To be clear — the rest of the migration plan is solid. It's just this auth piece that's the blocker." },
      { time: "11:16", speaker: "LP", text: "Understood. Let's treat this as urgent. ME, you have full priority on this — anything you need from the team, just ask." },
    ],
  },
  {
    id: "m4",
    title: "Vendor Onboarding Kickoff",
    project: "Vendor Onboarding",
    date: "Mar 15, 10:00am",
    duration: "45 min",
    attendees: ["AK", "JP", "SR"],
    summary: "Kicked off the vendor onboarding programme with AK and JP. Due diligence framework agreed, contract review timeline set for Apr 2, and risk assessment assigned to AK. No blockers at this stage — project is on track.",
    decisions: [
      "AK owns the vendor relationship and contract finalisation",
      "Finance sign-off required from JP before contracts go live",
      "Risk assessment to be completed before integration begins",
    ],
    actions: [
      { owner: "AK", task: "Complete vendor risk assessment",  due: "Mar 19", status: "done" },
      { owner: "JP", task: "Finance review of vendor terms",  due: "Mar 22", status: "done" },
      { owner: "AK", task: "Finalise vendor contract",        due: "Apr 2",  status: "pending" },
    ],
    risks: [
      "Contract review may extend if legal requests revisions",
    ],
    transcript: [
      { time: "10:00", speaker: "SR", text: "Welcome everyone. This is the kickoff for the vendor onboarding programme. AK, you'll be leading this — want to take us through the plan?" },
      { time: "10:01", speaker: "AK", text: "Happy to. We've identified the vendor, done initial due diligence, and the main remaining steps are the risk assessment, contract review, and integration setup." },
      { time: "10:03", speaker: "JP", text: "Finance are ready to review the contract terms whenever you have a draft. I'd recommend getting a first version to us by end of next week." },
      { time: "10:05", speaker: "AK", text: "That works. I'll aim to have a draft ready by the 20th so you have time to review before the Apr 2 finalisation date." },
      { time: "10:07", speaker: "SR", text: "Any red flags from the initial due diligence?" },
      { time: "10:08", speaker: "AK", text: "Nothing significant. They're a well-established vendor. The main thing to watch is their SLA terms — I want to make sure we have clear remedies if they don't deliver." },
      { time: "10:10", speaker: "JP", text: "I'll flag that to legal when I pass the contract across. That's a standard ask." },
      { time: "10:12", speaker: "SR", text: "Great. This looks well set up. Let's check in again once the risk assessment is done." },
    ],
  },
];

/* ─── Config ─────────────────────────────────────────────────────────────── */

const SPEAKER_COLORS: Record<string, { bg: string; text: string }> = {
  SR: { bg: "bg-[#8b5cf6]/10", text: "text-[#8b5cf6]"    },
  LP: { bg: "bg-emerald-50",   text: "text-emerald-600"   },
  AK: { bg: "bg-indigo-50",    text: "text-indigo-500"    },
  ME: { bg: "bg-amber-50",     text: "text-amber-600"     },
  TK: { bg: "bg-blue-50",      text: "text-blue-500"      },
  JP: { bg: "bg-pink-50",      text: "text-pink-500"      },
};

const STATUS_STYLE: Record<ActionItem["status"], string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-100",
  done:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  overdue: "bg-red-50 text-red-500 border-red-100",
};

/* ─── Animation variants ────────────────────────────────────────────────── */

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/* ─── Suggested Action Card ─────────────────────────────────────────────── */

type ActionState = "idle" | "loading" | "done";

function SuggestedActionCard({
  icon: Icon, iconBg, iconColor, title, description, buttonLabel,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  buttonLabel: string;
}) {
  const [state, setState] = useState<ActionState>("idle");

  function execute() {
    if (state !== "idle") return;
    setState("loading");
    setTimeout(() => setState("done"), 1600);
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${state === "done" ? "border-emerald-100 bg-emerald-50/60" : "border-neutral-100 bg-white hover:border-neutral-200"}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${state === "done" ? "bg-emerald-100" : iconBg}`}>
        {state === "done"
          ? <Check size={14} className="text-emerald-500" strokeWidth={2.5} />
          : <Icon size={14} className={iconColor} />
        }
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold leading-snug ${state === "done" ? "text-emerald-700" : "text-neutral-800"}`}>{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-neutral-400">{description}</p>
      </div>
      <motion.button
        onClick={execute}
        whileHover={state === "idle" ? { scale: 1.04 } : {}}
        whileTap={state === "idle" ? { scale: 0.96 } : {}}
        transition={{ duration: 0.13 }}
        className={[
          "shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all",
          state === "done"
            ? "bg-emerald-100 text-emerald-600 cursor-default"
            : "bg-[#8b5cf6] text-white shadow-[0_2px_6px_rgba(139,92,246,0.25)] hover:bg-[#7c3aed]",
        ].join(" ")}
        disabled={state !== "idle"}
      >
        {state === "loading" && <RefreshCw size={10} className="animate-spin" />}
        {state === "done"    && <Check size={10} strokeWidth={2.5} />}
        {state === "idle"    && buttonLabel}
        {state === "loading" && "Working…"}
        {state === "done"    && "Done"}
      </motion.button>
    </div>
  );
}

/* ─── Upload button ─────────────────────────────────────────────────────── */

function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <button
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); }}
      className={[
        "flex w-full items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-xs font-medium transition-all duration-150",
        dragging
          ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/5 text-[#8b5cf6]"
          : "border-neutral-200 text-neutral-400 hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/4 hover:text-[#8b5cf6]",
      ].join(" ")}
    >
      <Upload size={13} className="shrink-0" />
      <span>Upload transcript or recording</span>
      <input ref={inputRef} type="file" className="sr-only" accept=".txt,.vtt,.srt,.mp3,.mp4,.m4a" />
    </button>
  );
}

/* ─── Meeting detail: transcript + summary ──────────────────────────────── */

function MeetingDetail({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript");

  return (
    <motion.div
      key={meeting.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.26, ease: EASE }}
      className="flex h-full flex-col"
    >
      {/* Detail header */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4 shrink-0">
        <div className="min-w-0">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#8b5cf6]">
            {meeting.project}
          </p>
          <h2 className="text-sm font-bold text-neutral-900 leading-snug" style={{ letterSpacing: "-0.02em" }}>
            {meeting.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-neutral-400">
            <span className="flex items-center gap-1"><Calendar size={10} />{meeting.date}</span>
            <span className="flex items-center gap-1"><Clock size={10} />{meeting.duration}</span>
            <span className="flex items-center gap-1"><Users size={10} />{meeting.attendees.join(", ")}</span>
          </div>
        </div>
        {/* AI badge */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[#8b5cf6]/5 border border-[#8b5cf6]/12 px-2.5 py-1.5 text-[10px] font-medium text-[#8b5cf6]">
            <Sparkles size={10} />
            AI Processed
          </span>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Mobile tabs (transcript vs summary) */}
      <div className="flex border-b border-neutral-100 lg:hidden">
        {(["transcript", "summary"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors relative ${activeTab === t ? "text-[#8b5cf6]" : "text-neutral-400 hover:text-neutral-600"}`}
          >
            {t === "transcript" ? "Transcript" : "Summary & Actions"}
            {activeTab === t && (
              <motion.div layoutId="meeting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8b5cf6]" />
            )}
          </button>
        ))}
      </div>

      {/* Split content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Transcript panel */}
        <div className={`flex flex-col border-r border-neutral-100 lg:flex lg:w-[55%] lg:shrink-0 ${activeTab === "transcript" ? "flex w-full" : "hidden"}`}>
          <div className="flex items-center gap-2 border-b border-neutral-50 px-4 py-2.5">
            <FileText size={12} className="text-neutral-300" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Transcript</span>
            <span className="ml-auto text-[10px] text-neutral-400">{meeting.transcript.length} lines</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {meeting.transcript.map((line, i) => {
              const sc = SPEAKER_COLORS[line.speaker] ?? { bg: "bg-neutral-100", text: "text-neutral-500" };
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.025, duration: 0.3 }}
                  className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50/80 transition-colors"
                >
                  <span className="mt-0.5 w-10 shrink-0 text-[10px] font-mono text-neutral-300 tabular-nums">
                    {line.time}
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${sc.bg} ${sc.text}`}>
                    {line.speaker}
                  </span>
                  <p className="flex-1 text-xs leading-relaxed text-neutral-600">{line.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Summary + actions panel */}
        <div className={`flex-1 overflow-y-auto lg:flex lg:flex-col ${activeTab === "summary" ? "flex flex-col w-full" : "hidden"}`}>
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="space-y-5 px-5 py-4"
          >

            {/* AI Summary */}
            <motion.div variants={item}>
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles size={11} className="text-[#8b5cf6]" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">AI Summary</p>
              </div>
              <p className="text-xs leading-relaxed text-neutral-600 bg-[#8b5cf6]/4 rounded-xl border border-[#8b5cf6]/10 px-4 py-3">
                {meeting.summary}
              </p>
            </motion.div>

            {/* Key decisions */}
            {meeting.decisions.length > 0 && (
              <motion.div variants={item}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Key Decisions</p>
                <ul className="space-y-1.5">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-neutral-600">
                      <Check size={11} className="mt-0.5 shrink-0 text-emerald-500" strokeWidth={2.5} />
                      {d}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Action items */}
            <motion.div variants={item}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Action Items</p>
                <span className="text-[10px] text-neutral-400">{meeting.actions.length} tasks</span>
              </div>
              <div className="space-y-2">
                {meeting.actions.map(({ owner, task, due, status }, i) => {
                  const sc = SPEAKER_COLORS[owner] ?? { bg: "bg-neutral-100", text: "text-neutral-500" };
                  return (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl border border-neutral-50 bg-neutral-50/70 px-3 py-2.5">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${sc.bg} ${sc.text}`}>
                        {owner}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-neutral-700 leading-snug">{task}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-neutral-400">Due {due}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_STYLE[status]}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Risks */}
            {meeting.risks.length > 0 && (
              <motion.div variants={item}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Flagged Risks</p>
                <div className="space-y-1.5">
                  {meeting.risks.map((risk, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-400" />
                      <p className="text-xs leading-relaxed text-neutral-600">{risk}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Divider */}
            <motion.div variants={item} className="border-t border-neutral-100" />

            {/* Suggested actions */}
            <motion.div variants={item}>
              <div className="mb-3 flex items-center gap-1.5">
                <Sparkles size={11} className="text-[#8b5cf6]" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Suggested Actions</p>
              </div>
              <div className="space-y-2">
                <SuggestedActionCard
                  icon={Mail}
                  iconBg="bg-blue-50"
                  iconColor="text-blue-500"
                  title="Send follow-up email"
                  description="Larry has drafted a summary email to all attendees with action items and decisions."
                  buttonLabel="Send email"
                />
                <SuggestedActionCard
                  icon={CalendarPlus}
                  iconBg="bg-[#8b5cf6]/8"
                  iconColor="text-[#8b5cf6]"
                  title="Schedule next meeting"
                  description={`Proposed: +7 days from today · Same attendees · 45 min`}
                  buttonLabel="Add to calendar"
                />
                <SuggestedActionCard
                  icon={CheckSquare}
                  iconBg="bg-emerald-50"
                  iconColor="text-emerald-500"
                  title="Update project tasks"
                  description={`${meeting.actions.length} new tasks ready to be added to ${meeting.project}.`}
                  buttonLabel="Add tasks"
                />
              </div>
            </motion.div>

          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export function MeetingNotesPage() {
  const [selected, setSelected] = useState<string>(MEETINGS[0].id);
  const meeting = MEETINGS.find((m) => m.id === selected) ?? null;

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">

      {/* Left: meeting list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-neutral-100">
        {/* List header */}
        <div className="flex items-center border-b border-neutral-100 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Mic size={13} className="text-[#8b5cf6]" />
            <p className="text-xs font-semibold text-neutral-800">Meetings</p>
          </div>
          <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
            {MEETINGS.length}
          </span>
        </div>

        {/* Meeting list */}
        <ul role="list" className="flex-1 overflow-y-auto divide-y divide-neutral-50">
          {MEETINGS.map((m) => {
            const isActive = m.id === selected;
            return (
              <motion.li key={m.id} whileHover={{ backgroundColor: isActive ? undefined : "rgba(139,92,246,0.02)" }}>
                <button
                  onClick={() => setSelected(m.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${isActive ? "bg-[#8b5cf6]/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className={`text-xs font-semibold leading-snug ${isActive ? "text-[#8b5cf6]" : "text-neutral-800"}`}>
                      {m.title}
                    </p>
                    <ChevronRight size={11} className={`mt-0.5 shrink-0 transition-colors ${isActive ? "text-[#8b5cf6]" : "text-neutral-200"}`} />
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium text-neutral-400">{m.project}</p>
                  <div className="mt-2 flex items-center gap-2.5 text-[10px] text-neutral-400">
                    <span className="flex items-center gap-1"><Calendar size={9} />{m.date}</span>
                    <span className="flex items-center gap-1"><Clock size={9} />{m.duration}</span>
                  </div>
                  <div className="mt-2 flex -space-x-1">
                    {m.attendees.slice(0, 4).map((a) => {
                      const sc = SPEAKER_COLORS[a] ?? { bg: "bg-neutral-100", text: "text-neutral-500" };
                      return (
                        <span key={a} className={`flex h-4 w-4 items-center justify-center rounded-full border border-white text-[7px] font-bold ${sc.bg} ${sc.text}`}>
                          {a}
                        </span>
                      );
                    })}
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>

        {/* Upload button */}
        <div className="border-t border-neutral-100 p-3">
          <UploadButton />
        </div>
      </div>

      {/* Right: meeting detail */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {meeting ? (
            <MeetingDetail
              key={meeting.id}
              meeting={meeting}
              onClose={() => setSelected("")}
            />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
                <Mic size={20} className="text-neutral-300" />
              </div>
              <p className="text-sm font-semibold text-neutral-700">Select a meeting</p>
              <p className="text-xs text-neutral-400">Choose a meeting from the list to view its transcript and AI summary.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
