import {
  ArrowRight,
  CalendarClock,
  FileStack,
  ListChecks,
  Mic,
  Orbit,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-preview-sans" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-preview-mono",
});

const stats = [
  ["Executed autonomously", "12", "#2BC48A"],
  ["Prepared for approval", "4", "#6B4EFF"],
  ["Signals interpreted", "38", "#1EA7FD"],
  ["Risks escalated", "2", "#FF6B57"],
] as const;

const decisions = [
  "Move onboarding workshop to Tuesday 14:00",
  "Draft follow-up to legal on the missing data note",
  "Escalate reporting dependency to programme lead",
];

const runways = [
  ["Meeting", "Larry extracted rollout workstreams from the kickoff meeting", "Completed", "#2BC48A"],
  ["Slack", "Regional owners confirming readiness notes", "Running", "#6B4EFF"],
  ["Email", "Legal memo missing for DACH launch package", "Needs decision", "#FF6B57"],
] as const;

const setupModes = [
  ["Manual setup", "Define goals, owners, and the first structure by hand.", ListChecks],
  ["Tell Larry", "Describe the project by text or voice and let Larry propose the operating model.", WandSparkles],
  ["Live meeting", "Start from a meeting or transcript so Larry can extract the project as it is discussed.", CalendarClock],
  ["Import a source", "Use a deck, email thread, document, or image as the handoff into Larry.", FileStack],
] as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-[var(--font-preview-mono)] text-[11px] uppercase tracking-[0.18em] text-[#6B7285]">
      {children}
    </p>
  );
}

function Panel({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      className={`rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(17,24,39,0.08)] lg:p-7 ${
        dark
          ? "border-[#1E2644] bg-[#101628] text-white shadow-[0_24px_90px_rgba(9,14,26,0.32)]"
          : "border-[#D9D2C4] bg-white/92 text-[#101525]"
      }`}
    >
      {children}
    </section>
  );
}

export default function PreviewPage() {
  return (
    <div
      className={`${manrope.variable} ${plexMono.variable} min-h-screen bg-[#F4F0E8] text-[#101525]`}
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(107,78,255,0.14), transparent 28%), radial-gradient(circle at top right, rgba(30,167,253,0.10), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.65), rgba(244,240,232,0.96))",
      }}
    >
      <div className="mx-auto max-w-[1560px] px-4 py-4 md:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[118px_minmax(0,1fr)]">
          <aside className="rounded-[30px] border border-[#1E2644] bg-[#101628] px-4 py-5 text-white shadow-[0_24px_80px_rgba(9,14,26,0.35)]">
            <div className="flex h-full flex-col justify-between gap-8">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6B4EFF] shadow-[0_0_30px_rgba(107,78,255,0.45)]">
                    <Orbit size={20} />
                  </div>
                  <div>
                    <p className="text-[17px] font-semibold tracking-[-0.03em]">Larry</p>
                    <p className="font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.24em] text-white/55">
                      live brief
                    </p>
                  </div>
                </div>

                <div className="mt-8 space-y-2">
                  {[
                    ["Brief", Sparkles],
                    ["Projects", Workflow],
                    ["Decisions", ShieldCheck],
                    ["Memory", FileStack],
                  ].map(([label, Icon], index) => {
                    const labelText = label as string;
                    const IconComponent = Icon as typeof Sparkles;
                    return (
                      <div
                        key={labelText}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
                          index === 0 ? "bg-white/9" : "bg-transparent"
                        }`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${index === 0 ? "bg-[#6B4EFF]" : "bg-white/6"}`}>
                          <IconComponent size={16} />
                        </div>
                        <span className="text-[13px] text-white/84">{labelText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/12 bg-white/6 p-3">
                <p className="font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.2em] text-white/55">
                  autopilot
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#2BC48A]" />
                  <span className="text-[13px] font-medium">Active and watching</span>
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            <Panel>
              <Label>Preview concept</Label>
              <h1 className="mt-2 max-w-4xl text-[34px] font-semibold leading-[1.02] tracking-[-0.06em] text-[#101525] md:text-[48px]">
                Larry runs coordination. You steer the mission.
              </h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#495163] md:text-[16px]">
                This concept turns Larry from a floating assistant into the live operating layer of
                the workspace: one place to brief, decide, trace evidence, and keep execution moving.
              </p>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
              <Panel dark>
                <Label>larry brief</Label>
                <p className="mt-3 max-w-2xl text-[28px] font-semibold leading-[1.05] tracking-[-0.05em] text-white">
                  Since 08:00 Larry has already moved the project forward.
                </p>
                <p className="mt-3 max-w-2xl text-[14px] leading-7 text-white/68">
                  The homepage stops being a project directory. It becomes the operating briefing:
                  what changed, what Larry did, what needs steering, and where the truth came from.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map(([label, value, tone]) => (
                    <div key={label} className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                      <p className="font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.18em] text-white/48">
                        {label}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <span className="text-[34px] font-semibold tracking-[-0.05em]">{value}</span>
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: tone }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[26px] border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>command deck</Label>
                      <p className="mt-2 text-[15px] font-medium text-white/88">
                        Persistent composer instead of a separate chat room.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-white/14 bg-white/8 px-4 text-[13px] font-medium text-white/85"
                      >
                        <Mic size={14} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#101628]"
                      >
                        Ask Larry
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-[#0C1222] px-4 py-4">
                    <p className="text-[15px] leading-7 text-white/84">
                      “Pull the EMEA launch into shape from the kickoff meeting, chase missing
                      owners, and prepare anything risky for approval.”
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel>
                <Label>prepared for your approval</Label>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-[#101525]">
                  Decision rail
                </h2>
                <p className="mt-2 max-w-lg text-[14px] leading-7 text-[#5A6273]">
                  Approval is the steering mechanism between human judgment and autonomous execution.
                </p>

                <div className="mt-5 space-y-3">
                  {decisions.map((item, index) => (
                    <div key={item} className="rounded-[24px] border border-[#E4DECF] bg-[#FBF9F4] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.18em] text-white"
                          style={{ background: index === 2 ? "#FF6B57" : "#6B4EFF" }}
                        >
                          {index === 2 ? "High impact" : "Prepared"}
                        </span>
                      </div>
                      <p className="mt-4 text-[17px] font-semibold leading-7 tracking-[-0.03em] text-[#101525]">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Panel>
                <Label>project canvas</Label>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-[#101525]">
                  One execution surface, not six disconnected pages
                </h2>
                <p className="mt-2 max-w-3xl text-[14px] leading-7 text-[#5A6273]">
                  The project view should merge timeline, state, evidence, and pending decisions
                  into one continuous canvas. Every row carries provenance.
                </p>

                <div className="mt-5 rounded-[26px] border border-[#E4DECF] bg-[#FBF9F4] p-4">
                  <div className="grid gap-2 border-b border-[#E8E1D4] pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7285] md:grid-cols-[92px_minmax(0,1.7fr)_140px]">
                    <span>Origin</span>
                    <span>Execution item</span>
                    <span>Status</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {runways.map(([origin, task, status, tone]) => (
                      <div
                        key={task}
                        className="grid gap-3 rounded-[22px] border border-[#E8E1D4] bg-white px-4 py-4 md:grid-cols-[92px_minmax(0,1.7fr)_140px]"
                      >
                        <span className="rounded-full bg-[#F2EEE5] px-3 py-1 font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.16em] text-[#5A6273]">
                          {origin}
                        </span>
                        <p className="text-[15px] font-semibold leading-6 text-[#101525]">{task}</p>
                        <span
                          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-[var(--font-preview-mono)] text-[10px] uppercase tracking-[0.16em] text-white"
                          style={{ background: tone }}
                        >
                          <span className="h-2 w-2 rounded-full bg-white/85" />
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel>
                <Label>memory stream</Label>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#101525]">
                  One place for evidence
                </h2>
                <p className="mt-2 text-[14px] leading-7 text-[#5A6273]">
                  Meetings, email, Slack, and documents stop living in separate pages. They become
                  project memory that explains every change.
                </p>
              </Panel>
            </div>

            <Panel>
              <Label>project start launchpad</Label>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-[#101525]">
                Four ways to hand Larry a project
              </h2>
              <p className="mt-2 max-w-3xl text-[14px] leading-7 text-[#5A6273]">
                Starting a project should feel like handing over coordination, not filling in one
                more SaaS form.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {setupModes.map(([title, body, Icon]) => (
                  <div key={title} className="rounded-[26px] border border-[#E4DECF] bg-[#FBF9F4] p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white">
                      <Icon size={20} className="text-[#101525]" />
                    </div>
                    <p className="mt-5 text-[18px] font-semibold tracking-[-0.03em] text-[#101525]">
                      {title}
                    </p>
                    <p className="mt-3 text-[14px] leading-7 text-[#5A6273]">{body}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </main>
        </div>
      </div>
    </div>
  );
}
