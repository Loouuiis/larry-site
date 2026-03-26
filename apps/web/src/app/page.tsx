import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { RequestAccessForm } from "@/components/landing/RequestAccessForm";

export const metadata: Metadata = {
  title: "Larry | Autonomous Project Execution",
  description:
    "Turn meetings, Slack, and calendar into tracked, approved action with Larry.",
};

const stats = [
  { value: "03", label: "live inputs", detail: "Meetings, Slack, calendar" },
  { value: "01", label: "approval rail", detail: "Every action stays reviewable" },
  { value: "04", label: "launch surfaces", detail: "Landing, dashboard, board, action centre" },
];

const steps = [
  {
    title: "Capture the signal",
    body: "Larry absorbs meeting notes, Slack threads, and calendar events so execution context starts in the same place the work actually happens.",
    icon: MessageSquare,
  },
  {
    title: "Propose the action",
    body: "Follow-ups, ownership changes, and email drafts land with source context attached, so the team can see what changed and why.",
    icon: Sparkles,
  },
  {
    title: "Keep the board live",
    body: "Approved actions turn into tracked work inside the workspace instead of becoming another disconnected summary nobody trusts.",
    icon: FolderKanban,
  },
];

const pillars = [
  {
    title: "Source-linked execution",
    body: "Actions show the meeting, thread, or transcript fragment they came from before anyone approves them.",
  },
  {
    title: "Approval-aware by default",
    body: "Larry does not blur suggestion and execution. Teams can edit, approve, or reject proposed work in the same flow.",
  },
  {
    title: "Built for live delivery teams",
    body: "The dashboard is organised around task movement, blockers, and follow-up pressure instead of passive reporting.",
  },
];

const connectors = [
  { label: "Slack", status: "Live", enabled: true },
  { label: "Calendar", status: "Live", enabled: true },
  { label: "Meeting notes", status: "Live", enabled: true },
  { label: "Email", status: "Coming soon", enabled: false },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03101a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,169,255,0.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(75,94,255,0.18),transparent_26%),linear-gradient(180deg,#041018_0%,#071726_46%,#09111a_100%)]" />
      <div className="hero-gradient-drift absolute left-[-14rem] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-[#103b63]/40 blur-3xl" />
      <div className="hero-glow absolute bottom-[-16rem] right-[-12rem] h-[28rem] w-[28rem] rounded-full bg-[#3a6cff]/20 blur-3xl" />

      <div className="relative z-10">
        <header className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-[15px] font-semibold">
              L
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em]">Larry</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                Autonomous PM layer
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/workspace"
              className="hidden rounded-full border border-white/12 px-4 py-2 text-[13px] font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white sm:inline-flex"
            >
              Enter workspace
            </Link>
            <a
              href="#request-access"
              className="inline-flex items-center gap-2 rounded-full bg-[#4aa3ff] px-4 py-2 text-[13px] font-semibold text-[#05111c] transition-transform hover:scale-[1.01]"
            >
              Request access
              <ArrowRight size={14} />
            </a>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1240px] gap-14 px-6 pb-16 pt-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:pb-24 lg:pt-16">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#17324a] bg-[#081927]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9bc6ee]">
              <CheckCircle2 size={13} />
              Launch surface preview
            </div>

            <h1 className="mt-8 text-[52px] font-semibold leading-[0.95] tracking-[-0.06em] text-[#f5f8fc] md:text-[72px]">
              The autonomous execution layer for project management.
            </h1>

            <p className="mt-8 max-w-[620px] text-[19px] leading-8 text-[#b7c7d9] md:text-[21px]">
              Turn meetings, Slack, and calendar into tracked, approved action.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="#request-access"
                className="inline-flex items-center gap-2 rounded-full bg-[#f4f7fb] px-5 py-3 text-[14px] font-semibold text-[#08111c] transition-transform hover:scale-[1.01]"
              >
                Start request
                <ArrowRight size={15} />
              </a>
              <Link
                href="/workspace/actions"
                className="inline-flex items-center gap-2 rounded-full border border-[#1f3b54] bg-[#071826] px-5 py-3 text-[14px] font-semibold text-[#dce8f3] transition-colors hover:border-[#335777] hover:bg-[#0a1d2d]"
              >
                See the action centre
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-[#143049] bg-[#071827]/85 px-5 py-4 backdrop-blur"
                >
                  <p className="text-[32px] font-semibold tracking-[-0.05em] text-[#f4f7fb]">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8db4d7]">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-[13px] leading-6 text-[#8fa5ba]">
                    {stat.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[620px]">
            <div className="absolute inset-0 rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,27,40,0.98),rgba(6,15,22,0.96))] shadow-[0_32px_120px_rgba(2,8,16,0.55)]" />
            <div className="absolute left-6 right-6 top-6 rounded-[26px] border border-[#18324a] bg-[#08131d] p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[#122333] pb-4">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.2em] text-[#7da5c7]">
                    Workspace pulse
                  </p>
                  <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#f2f6fb]">
                    Weekly delivery board
                  </p>
                </div>
                <div className="rounded-full border border-[#1c3a54] bg-[#0b1d2a] px-3 py-1 text-[12px] text-[#b9d0e5]">
                  6 open tasks
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  {
                    title: "Follow up on delayed sign-off",
                    owner: "Morgan",
                    status: "Blocked",
                    tone: "bg-[#E2445C]",
                  },
                  {
                    title: "Prepare steering update draft",
                    owner: "Ava",
                    status: "In Progress",
                    tone: "bg-[#FDAB3D] text-[#231500]",
                  },
                  {
                    title: "Confirm meeting actions from planning sync",
                    owner: "Noah",
                    status: "Not Started",
                    tone: "bg-[#676879]",
                  },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="grid grid-cols-[minmax(0,1fr)_88px_114px] items-center gap-3 rounded-[20px] border border-[#142636] bg-[#0c1824] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#eff4fb]">
                        {row.title}
                      </p>
                      <p className="mt-1 text-[12px] text-[#7c95ac]">{row.owner}</p>
                    </div>
                    <span className="text-[12px] text-[#b5c7d8]">Apr 2</span>
                    <span className={`rounded-full px-3 py-1 text-center text-[11px] font-semibold ${row.tone}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute left-[-1.5rem] top-[14rem] w-[320px] rotate-[-4deg] rounded-[26px] border border-[#17364f] bg-[#071521]/95 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-2 text-[#9bc6ee]">
                <MessageSquare size={16} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em]">
                  Meeting captured
                </p>
              </div>
              <p className="mt-4 text-[15px] leading-7 text-[#d7e4ef]">
                "Finance approval is still waiting on the revised scope. Morgan to send updated deck before Friday."
              </p>
              <div className="mt-4 flex items-center gap-2 text-[12px] text-[#7d95ab]">
                <CalendarDays size={14} />
                Planning sync - today
              </div>
            </div>

            <div className="absolute bottom-10 right-[-0.8rem] w-[330px] rotate-[5deg] rounded-[26px] border border-[#17405f] bg-[#0a1b28]/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#90b9db]">
                    Action proposed
                  </p>
                  <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#f2f6fb]">
                    Update owner + draft follow-up
                  </p>
                </div>
                <ShieldCheck className="text-[#6fc1ff]" size={22} />
              </div>

              <div className="mt-5 rounded-[20px] border border-[#17364f] bg-[#071521] p-4">
                <div className="flex items-center justify-between text-[12px] text-[#9cb4c9]">
                  <span>Source</span>
                  <span>Slack thread</span>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-[#d2dfeb]">
                  Larry suggests reassigning scope review to Morgan and preparing an approval-ready email draft for Finance.
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <div className="flex-1 rounded-full bg-[#4aa3ff] px-4 py-2 text-center text-[13px] font-semibold text-[#05111c]">
                  Approve
                </div>
                <div className="flex-1 rounded-full border border-[#26445d] px-4 py-2 text-center text-[13px] font-semibold text-[#dce8f3]">
                  Edit
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
          <div className="rounded-[34px] border border-[#13314a] bg-[#071724]/88 p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-[620px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8db4d7]">
                  How it works
                </p>
                <h2 className="mt-4 text-[38px] font-semibold tracking-[-0.05em] text-[#f5f8fc] md:text-[48px]">
                  Larry connects the signal to the board, not to another summary deck.
                </h2>
              </div>
              <p className="max-w-[360px] text-[15px] leading-7 text-[#a3b7ca]">
                The operating principle is simple: capture context where it happens, propose actions with evidence, then move the work where the team already tracks delivery.
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.title}
                    className="rounded-[26px] border border-[#143049] bg-[#091b29] p-6"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#1a3d59] bg-[#0e2536] text-[#8dc3ef]">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.03em] text-[#f4f7fb]">
                      {step.title}
                    </h3>
                    <p className="mt-4 text-[15px] leading-7 text-[#a8bdcf]">
                      {step.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[32px] border border-[#13314a] bg-[#071724]/88 p-6 md:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8db4d7]">
                Feature pillars
              </p>
              <h2 className="mt-4 text-[36px] font-semibold tracking-[-0.05em] text-[#f5f8fc] md:text-[44px]">
                Built for teams that need execution signal, not more project theatre.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {pillars.map((pillar) => (
                <article
                  key={pillar.title}
                  className="rounded-[28px] border border-[#143049] bg-[#091b29] p-6"
                >
                  <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[#f4f7fb]">
                    {pillar.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-7 text-[#a8bdcf]">
                    {pillar.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
          <div className="rounded-[34px] border border-[#13314a] bg-[#071724]/88 p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8db4d7]">
                  Connectors
                </p>
                <h2 className="mt-4 text-[36px] font-semibold tracking-[-0.05em] text-[#f5f8fc] md:text-[44px]">
                  Connect the operating system your team already uses.
                </h2>
              </div>
              <p className="max-w-[360px] text-[15px] leading-7 text-[#a3b7ca]">
                The launch stack keeps input scope narrow on purpose so the execution loop stays legible from day one.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {connectors.map((connector) => (
                <div
                  key={connector.label}
                  className={`rounded-[24px] border px-5 py-5 ${
                    connector.enabled
                      ? "border-[#1a3d59] bg-[#0a1b29]"
                      : "border-dashed border-[#2d3945] bg-[#0a1117] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/4">
                      {connector.label === "Slack" ? (
                        <MessageSquare size={18} className="text-[#9ec8eb]" />
                      ) : connector.label === "Calendar" ? (
                        <CalendarDays size={18} className="text-[#9ec8eb]" />
                      ) : connector.label === "Email" ? (
                        <Mail size={18} className="text-[#9ec8eb]" />
                      ) : (
                        <Users size={18} className="text-[#9ec8eb]" />
                      )}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        connector.enabled
                          ? "bg-[#103149] text-[#9fd0f8]"
                          : "bg-[#121b24] text-[#7b8b99]"
                      }`}
                    >
                      {connector.status}
                    </span>
                  </div>
                  <p className="mt-5 text-[20px] font-semibold tracking-[-0.03em] text-[#f2f6fb]">
                    {connector.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-10 lg:px-10 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-[34px] border border-[#13314a] bg-[#071724]/88 p-6 md:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8db4d7]">
                Launch posture
              </p>
              <h2 className="mt-4 text-[38px] font-semibold tracking-[-0.05em] text-[#f5f8fc] md:text-[48px]">
                Ask for access when the work is already moving.
              </h2>
              <p className="mt-5 text-[16px] leading-8 text-[#a7bbcf]">
                Larry is strongest when there is already real coordination pressure: follow-ups slipping after meetings, ownership drifting between channels, and approvals getting buried in side threads.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  {
                    title: "Source context stays attached",
                    body: "Approvals are grounded in the signal that created them, not in a black-box summary.",
                  },
                  {
                    title: "The board becomes the execution system",
                    body: "Tasks and updates land in the workspace so the team can inspect and continue the work immediately.",
                  },
                  {
                    title: "The initial access loop is operational",
                    body: "Requests now feed a real admin approval flow that provisions the first tenant and admin user.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[22px] border border-[#16324a] bg-[#091b29] p-5"
                  >
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-1 text-[#8ec4ef]" size={18} />
                      <div>
                        <p className="text-[16px] font-semibold text-[#f4f7fb]">{item.title}</p>
                        <p className="mt-2 text-[14px] leading-7 text-[#a7bbcf]">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <RequestAccessForm />
          </div>
        </section>

        <footer className="mx-auto flex max-w-[1240px] flex-col gap-4 border-t border-white/8 px-6 py-8 text-[13px] text-white/55 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>Larry turns coordination signal into accountable action.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/workspace" className="transition-colors hover:text-white">
              Workspace
            </Link>
            <a href="#request-access" className="transition-colors hover:text-white">
              Request access
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
