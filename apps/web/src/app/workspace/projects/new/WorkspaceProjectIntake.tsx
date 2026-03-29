"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, Check, FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { createLarryConversation, saveLarryMessage } from "@/lib/larry";
import { triggerBoundedWorkspaceRefresh } from "@/app/workspace/refresh";

type IntakeMode = "manual" | "chat" | "meeting";

type CreateProjectResponse = { id?: string; error?: string };
type TranscriptResponse = { error?: string; meetingNoteId?: string };

const CHAT_QUESTIONS = [
  "What is the working name of this project?",
  "What outcome are you trying to deliver?",
  "What deadline, launch date, or milestone are you aiming for?",
  "What are the first 3-5 deliverables or workstreams Larry should set up?",
  "What risks, constraints, or dependencies should Larry keep in view?",
] as const;

function buildProjectIntake(answers: string[]) {
  const [name = "", outcome = "", milestone = "", deliverables = "", risks = ""] = answers;
  return [
    `Project name: ${name}`,
    `Outcome: ${outcome}`,
    `Milestone: ${milestone}`,
    `Deliverables or workstreams: ${deliverables}`,
    `Risks, constraints, and dependencies: ${risks}`,
  ].join("\n");
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

const MODE_META: Record<IntakeMode, { label: string; title: string; description: string; icon: typeof Sparkles }> = {
  manual: {
    label: "Manual",
    title: "Create a project directly",
    description: "Set up the project now with dates, summary, and a clean workspace entry.",
    icon: CalendarRange,
  },
  chat: {
    label: "Chat",
    title: "Build the project with Larry",
    description: "Answer guided questions and let Larry turn them into the first project brief.",
    icon: MessageSquare,
  },
  meeting: {
    label: "Meeting",
    title: "Create from a meeting transcript",
    description: "Create the project first, then run the transcript into that project so context starts attached to the right workspace.",
    icon: FileText,
  },
};

function ModeButton({
  mode,
  active,
  onSelect,
}: {
  mode: IntakeMode;
  active: boolean;
  onSelect: (mode: IntakeMode) => void;
}) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      style={{
        borderRadius: "var(--radius-card)",
        border: active ? "1px solid var(--cta)" : "1px solid var(--border)",
        background: active ? "#ebf5ff" : "var(--surface)",
        padding: "18px",
        textAlign: "left",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "40px",
          borderRadius: "14px",
          background: active ? "var(--cta)" : "var(--surface-2)",
          color: active ? "#fff" : "var(--text-2)",
        }}
      >
        <Icon size={18} />
      </div>
      <p className="mt-4 text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>
        {meta.title}
      </p>
      <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
        {meta.description}
      </p>
    </button>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "24px",
      }}
    >
      <div>
        <p className="text-[22px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text-1)" }}>
          {title}
        </p>
        <p className="mt-2 max-w-[680px] text-[14px] leading-7" style={{ color: "var(--text-2)" }}>
          {description}
        </p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function WorkspaceProjectIntake() {
  const router = useRouter();
  const [mode, setMode] = useState<IntakeMode>("manual");

  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualTargetDate, setManualTargetDate] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "larry" | "user"; text: string }>>([
    { id: "q0", role: "larry", text: CHAT_QUESTIONS[0] },
  ]);
  const [chatQuestionIndex, setChatQuestionIndex] = useState(0);
  const [chatAnswers, setChatAnswers] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatCreatedProjectId, setChatCreatedProjectId] = useState<string | null>(null);
  const [chatCreatedProjectName, setChatCreatedProjectName] = useState<string | null>(null);

  const [meetingName, setMeetingName] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [meetingCreatedProjectId, setMeetingCreatedProjectId] = useState<string | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<"created" | "queued" | "partial" | null>(null);

  const chatProgress = useMemo(() => ((chatQuestionIndex + 1) / CHAT_QUESTIONS.length) * 100, [chatQuestionIndex]);

  async function createProject(payload: {
    name: string;
    description?: string;
    startDate?: string;
    targetDate?: string;
  }) {
    const response = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJson<CreateProjectResponse>(response);
    if (!response.ok || !data.id) {
      throw new Error(data.error ?? "Failed to create the project.");
    }
    return data.id;
  }

  async function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!manualName.trim()) return;
    if (manualStartDate && manualTargetDate && manualStartDate > manualTargetDate) {
      setManualError("Target date must be on or after the start date.");
      return;
    }

    setManualBusy(true);
    setManualError(null);
    try {
      const projectId = await createProject({
        name: manualName.trim(),
        description: manualDescription.trim() || undefined,
        startDate: manualStartDate || undefined,
        targetDate: manualTargetDate || undefined,
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      router.push(`/workspace/projects/${projectId}`);
    } catch (submitError) {
      setManualError(submitError instanceof Error ? submitError.message : "Failed to create the project.");
    } finally {
      setManualBusy(false);
    }
  }

  async function handleChatSubmit(event: React.FormEvent) {
    event.preventDefault();
    const answer = chatInput.trim();
    if (answer.length < 2 || chatBusy || chatCreatedProjectId) return;

    setChatBusy(true);
    setChatError(null);
    let activeConversationId = chatConversationId;
    const nextAnswers = chatAnswers.concat(answer);

    try {
      if (!activeConversationId) {
        const created = await createLarryConversation({ title: `Project intake: ${answer.slice(0, 60)}` });
        activeConversationId = created.id;
        setChatConversationId(created.id);
        await saveLarryMessage(created.id, "larry", CHAT_QUESTIONS[0]).catch(() => undefined);
      }

      await saveLarryMessage(activeConversationId, "user", answer).catch(() => undefined);
      setChatMessages((current) => current.concat({ id: crypto.randomUUID(), role: "user", text: answer }));
      setChatAnswers(nextAnswers);
      setChatInput("");

      if (chatQuestionIndex < CHAT_QUESTIONS.length - 1) {
        const nextIndex = chatQuestionIndex + 1;
        const nextPrompt = CHAT_QUESTIONS[nextIndex];
        setChatMessages((current) => current.concat({ id: `q${nextIndex}`, role: "larry", text: nextPrompt }));
        setChatQuestionIndex(nextIndex);
        await saveLarryMessage(activeConversationId, "larry", nextPrompt).catch(() => undefined);
        return;
      }

      setChatMessages((current) => current.concat({ id: "processing", role: "larry", text: "Creating the project..." }));
      const projectName = nextAnswers[0]?.trim() || "New Project";
      const description = buildProjectIntake(nextAnswers);
      const projectId = await createProject({ name: projectName, description });
      const replyText = `Project created. Open ${projectName} and keep building with Larry from the project workspace.`;
      setChatMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: replyText }),
      );
      await saveLarryMessage(activeConversationId, "larry", replyText).catch(() => undefined);
      setChatCreatedProjectId(projectId);
      setChatCreatedProjectName(projectName);
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to create the project via chat.";
      setChatMessages((current) =>
        current.filter((entry) => entry.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: message }),
      );
      setChatError(message);
    } finally {
      setChatBusy(false);
    }
  }

  async function handleMeetingSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!meetingName.trim() || meetingTranscript.trim().length < 20) return;

    setMeetingBusy(true);
    setMeetingError(null);
    setMeetingCreatedProjectId(null);
    setMeetingStatus(null);

    try {
      const projectId = await createProject({
        name: meetingName.trim(),
        description: meetingDescription.trim() || undefined,
      });
      setMeetingCreatedProjectId(projectId);
      setMeetingStatus("created");

      const transcriptResponse = await fetch("/api/workspace/meetings/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: meetingTranscript.trim(), projectId }),
      });
      const transcriptData = await readJson<TranscriptResponse>(transcriptResponse);

      if (!transcriptResponse.ok) {
        setMeetingStatus("partial");
        throw new Error(transcriptData.error ?? "Project created, but transcript processing failed.");
      }

      setMeetingStatus("queued");
      triggerBoundedWorkspaceRefresh();
    } catch (submitError) {
      setMeetingError(submitError instanceof Error ? submitError.message : "Failed to create the project from the meeting.");
    } finally {
      setMeetingBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="space-y-6">
          <section
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "28px",
            }}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
              Canonical intake route
            </p>
            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.05em]" style={{ color: "var(--text-1)" }}>
              Start a project on the workspace path
            </h1>
            <p className="mt-3 max-w-[760px] text-[15px] leading-7" style={{ color: "var(--text-2)" }}>
              This intake page replaces the reused legacy modal flow. Pick the route that matches how the project starts, then land in the real workspace with project context already attached.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {(Object.keys(MODE_META) as IntakeMode[]).map((entry) => (
              <ModeButton key={entry} mode={entry} active={mode === entry} onSelect={setMode} />
            ))}
          </section>

          {mode === "manual" && (
            <SectionCard
              title="Manual setup"
              description="Create the project immediately with a clean brief, start date, and target date."
            >
              <form onSubmit={handleManualSubmit} className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Project name
                  </span>
                  <input
                    required
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="EMEA launch readiness"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Project brief
                  </span>
                  <textarea
                    value={manualDescription}
                    onChange={(event) => setManualDescription(event.target.value)}
                    rows={5}
                    className="mt-2 w-full rounded-[22px] border px-4 py-3 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="What is this project trying to deliver, and what should Larry keep in view from day one?"
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Start date
                  </span>
                  <input
                    type="date"
                    value={manualStartDate}
                    onChange={(event) => setManualStartDate(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Target date
                  </span>
                  <input
                    type="date"
                    value={manualTargetDate}
                    onChange={(event) => setManualTargetDate(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                  />
                </label>

                {manualError && (
                  <div className="md:col-span-2 rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {manualError}
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={manualBusy || manualName.trim().length < 2}
                    className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                    style={{ background: "var(--cta)", opacity: manualBusy || manualName.trim().length < 2 ? 0.7 : 1 }}
                  >
                    {manualBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {manualBusy ? "Creating..." : "Create project"}
                  </button>
                </div>
              </form>
            </SectionCard>
          )}

          {mode === "chat" && (
            <SectionCard
              title="Chat intake"
              description="Let Larry shape the first project brief through a guided conversation, then create the project directly from that intake."
            >
              <div className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Progress
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                    Question {chatQuestionIndex + 1} of {CHAT_QUESTIONS.length}
                  </p>
                </div>
                <div style={{ height: "8px", width: "220px", borderRadius: "9999px", background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${chatProgress}%`, background: "var(--cta)" }} />
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <div className="space-y-4">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === "larry" ? "justify-start" : "justify-end"}`}>
                      <div
                        className="max-w-[85%] rounded-[22px] px-4 py-3 text-[13px] leading-relaxed"
                        style={{
                          background: message.role === "larry" ? "var(--surface)" : "var(--cta)",
                          color: message.role === "larry" ? "var(--text-1)" : "#fff",
                        }}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleChatSubmit} className="mt-5 space-y-4">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  rows={4}
                  placeholder="Type your answer here..."
                  className="w-full rounded-[22px] border px-4 py-3 text-[14px] outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                />

                {chatError && (
                  <div className="rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {chatError}
                  </div>
                )}

                {chatCreatedProjectId && chatCreatedProjectName && (
                  <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "#bbf7d0", background: "#f0fdf4" }}>
                    <p className="text-[14px] font-semibold" style={{ color: "#166534" }}>
                      {chatCreatedProjectName} is ready
                    </p>
                    <p className="mt-2 text-[13px]" style={{ color: "#166534" }}>
                      The project is now live on the workspace path with Larry chat ready inside the project.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/projects/${chatCreatedProjectId}`)}
                      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                      style={{ background: "#16a34a" }}
                    >
                      Open project
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}

                {!chatCreatedProjectId && (
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={chatBusy || chatInput.trim().length < 2}
                      className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                      style={{ background: "var(--cta)", opacity: chatBusy || chatInput.trim().length < 2 ? 0.7 : 1 }}
                    >
                      {chatBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {chatQuestionIndex === CHAT_QUESTIONS.length - 1 ? "Create project" : "Next answer"}
                    </button>
                  </div>
                )}
              </form>
            </SectionCard>
          )}

          {mode === "meeting" && (
            <SectionCard
              title="Meeting-led intake"
              description="Create the project on the workspace path first, then process the transcript straight into that project so Larry starts with the right context."
            >
              <form onSubmit={handleMeetingSubmit} className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Project name
                  </span>
                  <input
                    required
                    value={meetingName}
                    onChange={(event) => setMeetingName(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="Q3 board prep"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Initial project brief
                  </span>
                  <textarea
                    value={meetingDescription}
                    onChange={(event) => setMeetingDescription(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-[22px] border px-4 py-3 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="Optional summary that should sit on the project before transcript processing finishes."
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Meeting transcript
                  </span>
                  <textarea
                    value={meetingTranscript}
                    onChange={(event) => setMeetingTranscript(event.target.value)}
                    rows={10}
                    className="mt-2 w-full rounded-[22px] border px-4 py-3 text-[14px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="Paste transcript text here..."
                  />
                </label>

                {meetingError && (
                  <div className="md:col-span-2 rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {meetingError}
                  </div>
                )}

                {meetingCreatedProjectId && meetingStatus && (
                  <div className="md:col-span-2 rounded-2xl border px-4 py-4" style={{ borderColor: meetingStatus === "queued" ? "#bbf7d0" : "#fde68a", background: meetingStatus === "queued" ? "#f0fdf4" : "#fffbeb" }}>
                    <p className="text-[14px] font-semibold" style={{ color: meetingStatus === "queued" ? "#166534" : "#92400e" }}>
                      {meetingStatus === "queued"
                        ? "Project created and transcript queued"
                        : meetingStatus === "partial"
                          ? "Project created, transcript still needs attention"
                        : "Project created"}
                    </p>
                    <p className="mt-2 text-[13px]" style={{ color: meetingStatus === "queued" ? "#166534" : "#92400e" }}>
                      {meetingStatus === "queued"
                        ? "Larry saved the transcript and queued background processing. The project context and Action Centre will update shortly."
                        : meetingStatus === "created"
                          ? "The project exists on the workspace path and the transcript is being queued now."
                          : "The project exists on the workspace path even though transcript processing did not finish cleanly yet."}
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/projects/${meetingCreatedProjectId}`)}
                      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                      style={{ background: meetingStatus === "queued" ? "#16a34a" : "#d97706" }}
                    >
                      Open project
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={meetingBusy || meetingName.trim().length < 2 || meetingTranscript.trim().length < 20}
                    className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                    style={{ background: "var(--cta)", opacity: meetingBusy || meetingName.trim().length < 2 || meetingTranscript.trim().length < 20 ? 0.7 : 1 }}
                  >
                    {meetingBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    {meetingBusy ? "Creating project..." : "Create and queue transcript"}
                  </button>
                </div>
              </form>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
