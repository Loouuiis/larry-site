"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, Check, FileText, Loader2, MessageSquare, Layers, Upload } from "lucide-react";
import { triggerBoundedWorkspaceRefresh } from "@/app/workspace/refresh";

type IntakeMode = "manual" | "chat" | "meeting" | "import";
type IntakeDraftStatus = "draft" | "bootstrapped" | "finalized";
type MeetingTargetMode = "create" | "attach";

type IntakeBootstrapTask = {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeName?: string | null;
  priority?: "low" | "medium" | "high" | "critical";
};

type IntakeBootstrapAction = {
  type: string;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
};

type IntakeDraft = {
  id: string;
  mode: IntakeMode;
  status: IntakeDraftStatus;
  project: {
    name: string | null;
    description: string | null;
    startDate: string | null;
    targetDate: string | null;
    attachToProjectId: string | null;
  };
  chat: {
    answers: string[];
  };
  meeting: {
    meetingTitle: string | null;
    transcriptPresent: boolean;
  };
  bootstrap: {
    summary: string | null;
    tasks: IntakeBootstrapTask[];
    actions: IntakeBootstrapAction[];
    seedMessage: string | null;
  };
  finalized: {
    projectId: string | null;
    meetingNoteId: string | null;
    canonicalEventId: string | null;
    finalizedAt: string | null;
  };
};

type IntakeDraftResponse = {
  draft?: IntakeDraft;
  error?: string;
  message?: string;
};

type WorkspaceProjectOption = {
  id: string;
  name: string;
};

type WorkspaceProjectListResponse = {
  items?: WorkspaceProjectOption[];
};

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

type UpsertDraftPayload = {
  draftId?: string;
  mode: IntakeMode;
  project?: {
    name?: string | null;
    description?: string | null;
    startDate?: string | null;
    targetDate?: string | null;
    attachToProjectId?: string | null;
  };
  chat?: {
    answers?: string[];
  };
  meeting?: {
    meetingTitle?: string | null;
    transcript?: string | null;
  };
};

function handleAuthRedirect(response: Response): void {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

async function upsertIntakeDraft(payload: UpsertDraftPayload): Promise<IntakeDraft> {
  const response = await fetch("/api/workspace/projects/intake/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  handleAuthRedirect(response);
  const data = await readJson<IntakeDraftResponse>(response);
  if (!response.ok || !data.draft) {
    throw new Error(data.message ?? data.error ?? "Failed to save intake draft.");
  }
  return data.draft;
}

async function bootstrapIntakeDraft(draftId: string): Promise<IntakeDraft> {
  const response = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftId)}/bootstrap`, {
    method: "POST",
  });
  handleAuthRedirect(response);
  const data = await readJson<IntakeDraftResponse>(response);
  if (!response.ok || !data.draft) {
    throw new Error(data.message ?? data.error ?? "Failed to generate bootstrap preview.");
  }
  return data.draft;
}

async function finalizeIntakeDraft(draftId: string): Promise<IntakeDraft> {
  const response = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftId)}/finalize`, {
    method: "POST",
  });
  handleAuthRedirect(response);
  const data = await readJson<IntakeDraftResponse>(response);
  if (!response.ok || !data.draft) {
    throw new Error(data.message ?? data.error ?? "Failed to finalize intake draft.");
  }
  return data.draft;
}

const MODE_META: Record<IntakeMode, { label: string; title: string; description: string; icon: typeof Layers }> = {
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
  import: {
    label: "Import",
    title: "Start from a document",
    description: "Let Larry extract and structure your project from a PDF, Word document, or spreadsheet.",
    icon: Upload,
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
  const [projects, setProjects] = useState<WorkspaceProjectOption[]>([]);

  const [manualDraftId, setManualDraftId] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualTargetDate, setManualTargetDate] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [chatDraft, setChatDraft] = useState<IntakeDraft | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "larry" | "user"; text: string }>>([
    { id: "q0", role: "larry", text: CHAT_QUESTIONS[0] },
  ]);
  const [chatQuestionIndex, setChatQuestionIndex] = useState(0);
  const [chatAnswers, setChatAnswers] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFinalizeBusy, setChatFinalizeBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatCreatedProjectId, setChatCreatedProjectId] = useState<string | null>(null);
  const [chatCreatedProjectName, setChatCreatedProjectName] = useState<string | null>(null);

  const [meetingDraftId, setMeetingDraftId] = useState<string | null>(null);
  const [meetingTargetMode, setMeetingTargetMode] = useState<MeetingTargetMode>("create");
  const [meetingName, setMeetingName] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingStartDate, setMeetingStartDate] = useState("");
  const [meetingTargetDate, setMeetingTargetDate] = useState("");
  const [meetingAttachProjectId, setMeetingAttachProjectId] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingFinalizeBusy, setMeetingFinalizeBusy] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [meetingBootstrappedDraft, setMeetingBootstrappedDraft] = useState<IntakeDraft | null>(null);
  const [meetingCreatedProjectId, setMeetingCreatedProjectId] = useState<string | null>(null);
  const [meetingNoteId, setMeetingNoteId] = useState<string | null>(null);
  const [meetingCanonicalEventId, setMeetingCanonicalEventId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatProgress = useMemo(() => ((chatQuestionIndex + 1) / CHAT_QUESTIONS.length) * 100, [chatQuestionIndex]);
  const chatBootstrapReady = Boolean(chatDraft?.bootstrap.tasks.length || chatDraft?.bootstrap.actions.length);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await fetch("/api/workspace/projects", { cache: "no-store" });
        const payload = await readJson<WorkspaceProjectListResponse>(response);
        if (cancelled || !response.ok) return;
        const nextProjects = Array.isArray(payload.items) ? payload.items : [];
        setProjects(nextProjects.map((project) => ({ id: project.id, name: project.name })));
      } catch {
        if (!cancelled) setProjects([]);
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const draft = await upsertIntakeDraft({
        draftId: manualDraftId ?? undefined,
        mode: "manual",
        project: {
          name: manualName.trim(),
          description: manualDescription.trim() || null,
          startDate: manualStartDate || null,
          targetDate: manualTargetDate || null,
          attachToProjectId: null,
        },
      });
      setManualDraftId(draft.id);

      const finalized = await finalizeIntakeDraft(draft.id);
      const projectId = finalized.finalized.projectId;
      if (!projectId) {
        throw new Error("Draft finalized but no project id was returned.");
      }

      triggerBoundedWorkspaceRefresh();
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
    const nextAnswers = chatAnswers.concat(answer);

    try {
      setChatMessages((current) => current.concat({ id: crypto.randomUUID(), role: "user", text: answer }));
      setChatAnswers(nextAnswers);
      setChatInput("");

      if (chatQuestionIndex < CHAT_QUESTIONS.length - 1) {
        const nextIndex = chatQuestionIndex + 1;
        const nextPrompt = CHAT_QUESTIONS[nextIndex];
        setChatMessages((current) => current.concat({ id: `q${nextIndex}`, role: "larry", text: nextPrompt }));
        setChatQuestionIndex(nextIndex);
        return;
      }

      setChatMessages((current) =>
        current.concat({
          id: "processing",
          role: "larry",
          text: "Saving the draft and generating a bootstrap preview...",
        }),
      );

      const projectName = nextAnswers[0]?.trim() || "New Project";
      const description = buildProjectIntake(nextAnswers);
      const draft = await upsertIntakeDraft({
        draftId: chatDraft?.id ?? undefined,
        mode: "chat",
        project: {
          name: projectName,
          description,
          attachToProjectId: null,
        },
        chat: { answers: nextAnswers },
      });
      const bootstrappedDraft = await bootstrapIntakeDraft(draft.id);
      setChatDraft(bootstrappedDraft);

      setChatMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({
          id: crypto.randomUUID(),
          role: "larry",
          text: "Bootstrap preview is ready. Review starter tasks and suggested actions, then finalize.",
        }),
      );
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to prepare chat intake.";
      setChatMessages((current) =>
        current.filter((entry) => entry.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: message }),
      );
      setChatError(message);
    } finally {
      setChatBusy(false);
    }
  }

  async function handleChatFinalize() {
    if (!chatDraft?.id || chatFinalizeBusy) return;

    setChatFinalizeBusy(true);
    setChatError(null);
    try {
      const finalized = await finalizeIntakeDraft(chatDraft.id);
      const projectId = finalized.finalized.projectId;
      if (!projectId) {
        throw new Error("Draft finalized but no project id was returned.");
      }

      setChatDraft(finalized);
      setChatCreatedProjectId(projectId);
      setChatCreatedProjectName(finalized.project.name ?? (chatAnswers[0]?.trim() || "New Project"));
      triggerBoundedWorkspaceRefresh();
    } catch (submitError) {
      setChatError(submitError instanceof Error ? submitError.message : "Failed to finalize chat intake.");
    } finally {
      setChatFinalizeBusy(false);
    }
  }

  async function handleMeetingSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (meetingTranscript.trim().length < 20) {
      setMeetingError("Transcript must include at least 20 characters.");
      return;
    }
    if (meetingTargetMode === "create" && meetingName.trim().length < 2) {
      setMeetingError("Project name is required for create-new mode.");
      return;
    }
    if (meetingTargetMode === "attach" && !meetingAttachProjectId) {
      setMeetingError("Select an existing project to attach this transcript.");
      return;
    }

    setMeetingBusy(true);
    setMeetingError(null);
    setMeetingBootstrappedDraft(null);

    try {
      const draft = await upsertIntakeDraft({
        draftId: meetingDraftId ?? undefined,
        mode: "meeting",
        project:
          meetingTargetMode === "create"
            ? {
                name: meetingName.trim(),
                description: meetingDescription.trim() || null,
                startDate: meetingStartDate || null,
                targetDate: meetingTargetDate || null,
                attachToProjectId: null,
              }
            : {
                name: null,
                description: null,
                startDate: null,
                targetDate: null,
                attachToProjectId: meetingAttachProjectId,
              },
        meeting: {
          meetingTitle: meetingTitle.trim() || null,
          transcript: meetingTranscript.trim(),
        },
      });
      setMeetingDraftId(draft.id);
      const bootstrapped = await bootstrapIntakeDraft(draft.id);
      setMeetingBootstrappedDraft(bootstrapped);
    } catch (submitError) {
      setMeetingError(submitError instanceof Error ? submitError.message : "Failed to generate bootstrap preview.");
    } finally {
      setMeetingBusy(false);
    }
  }

  async function handleMeetingFinalize() {
    if (!meetingBootstrappedDraft?.id || meetingFinalizeBusy) return;

    setMeetingFinalizeBusy(true);
    setMeetingError(null);
    setMeetingCreatedProjectId(null);
    setMeetingNoteId(null);
    setMeetingCanonicalEventId(null);

    try {
      const finalized = await finalizeIntakeDraft(meetingBootstrappedDraft.id);
      const projectId = finalized.finalized.projectId;
      if (!projectId) {
        throw new Error("Draft finalized but no project id was returned.");
      }

      setMeetingDraftId(finalized.id);
      setMeetingCreatedProjectId(projectId);
      setMeetingNoteId(finalized.finalized.meetingNoteId);
      setMeetingCanonicalEventId(finalized.finalized.canonicalEventId);
      triggerBoundedWorkspaceRefresh();
    } catch (submitError) {
      setMeetingError(submitError instanceof Error ? submitError.message : "Failed to finalize meeting intake.");
    } finally {
      setMeetingFinalizeBusy(false);
    }
  }

  async function handleImportSubmit() {
    if (!file) return;
    setImportBusy(true);
    setManualError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const draftRes = await fetch("/api/workspace/projects/intake/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import" }),
      });
      const draftData = await readJson<IntakeDraftResponse>(draftRes);
      if (!draftRes.ok) {
        setManualError(draftData.message ?? draftData.error ?? "Failed to start import.");
        return;
      }

      const draftId = draftData.draft?.id;
      if (!draftId) {
        setManualError("Failed to create intake draft.");
        return;
      }

      const bootstrapRes = await fetch(
        `/api/workspace/projects/intake/drafts/${draftId}/bootstrap`,
        { method: "POST", body: formData }
      );
      const bootstrapData = await readJson<IntakeDraftResponse>(bootstrapRes);
      if (!bootstrapRes.ok) {
        setManualError(bootstrapData.message ?? bootstrapData.error ?? "Failed to process document.");
        return;
      }

      if (bootstrapData.draft) {
        setChatDraft(bootstrapData.draft);
      }
    } catch {
      setManualError("Upload failed. Please try again.");
    } finally {
      setImportBusy(false);
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

          <section className="grid gap-4 md:grid-cols-4">
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
                    {manualBusy ? "Finalizing..." : "Finalize and create project"}
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

              {!chatBootstrapReady && !chatCreatedProjectId && (
                <form onSubmit={handleChatSubmit} className="mt-5 space-y-4">
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    rows={4}
                    placeholder="Type your answer here..."
                    className="w-full rounded-[22px] border px-4 py-3 text-[14px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={chatBusy || chatInput.trim().length < 2}
                      className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                      style={{ background: "var(--cta)", opacity: chatBusy || chatInput.trim().length < 2 ? 0.7 : 1 }}
                    >
                      {chatBusy ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
                      {chatQuestionIndex === CHAT_QUESTIONS.length - 1 ? "Generate bootstrap preview" : "Next answer"}
                    </button>
                  </div>
                </form>
              )}

              {chatBootstrapReady && chatDraft && (
                <div className="mt-5 space-y-4 rounded-[24px] border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                      Bootstrap preview
                    </p>
                    <p className="mt-2 text-[14px] leading-7" style={{ color: "var(--text-1)" }}>
                      {chatDraft.bootstrap.summary ?? "Starter tasks and suggested actions are ready."}
                    </p>
                  </div>

                  {chatDraft.bootstrap.tasks.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Starter tasks
                      </p>
                      <div className="mt-2 space-y-2">
                        {chatDraft.bootstrap.tasks.map((task, index) => (
                          <div key={`${task.title}-${index}`} className="rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                            <p className="font-medium" style={{ color: "var(--text-1)" }}>
                              {task.title}
                            </p>
                            {task.dueDate && (
                              <p className="mt-1" style={{ color: "var(--text-2)" }}>
                                Due: {task.dueDate}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatDraft.bootstrap.actions.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Suggested actions
                      </p>
                      <div className="mt-2 space-y-2">
                        {chatDraft.bootstrap.actions.map((action, index) => (
                          <div key={`${action.type}-${index}`} className="rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                            <p className="font-medium" style={{ color: "var(--text-1)" }}>
                              {action.displayText}
                            </p>
                            <p className="mt-1" style={{ color: "var(--text-2)" }}>
                              {action.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!chatCreatedProjectId && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleChatFinalize()}
                        disabled={chatFinalizeBusy}
                        className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                        style={{ background: "var(--cta)", opacity: chatFinalizeBusy ? 0.7 : 1 }}
                      >
                        {chatFinalizeBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {chatFinalizeBusy ? "Finalizing..." : "Finalize and create project"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {chatCreatedProjectId && chatCreatedProjectName && (
                <div className="mt-5 rounded-2xl border px-4 py-4" style={{ borderColor: "#bbf7d0", background: "#f0fdf4" }}>
                  <p className="text-[14px] font-semibold" style={{ color: "#166534" }}>
                    {chatCreatedProjectName} is ready
                  </p>
                  <p className="mt-2 text-[13px]" style={{ color: "#166534" }}>
                    Project created from the intake draft with bootstrap tasks and suggestions persisted.
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

              {chatError && (
                <div className="mt-5 rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                  {chatError}
                </div>
              )}
            </SectionCard>
          )}

          {mode === "meeting" && (
            <SectionCard
              title="Meeting-led intake"
              description="Use one durable meeting draft with Create New or Attach Existing, then finalize to enqueue canonical transcript ingest."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMeetingTargetMode("create")}
                  style={{
                    borderRadius: "14px",
                    border: meetingTargetMode === "create" ? "1px solid var(--cta)" : "1px solid var(--border)",
                    background: meetingTargetMode === "create" ? "#ebf5ff" : "var(--surface-2)",
                    padding: "12px",
                    textAlign: "left",
                  }}
                >
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                    Create new project
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                    Finalize by creating a new project, then enqueue transcript ingest.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingTargetMode("attach")}
                  style={{
                    borderRadius: "14px",
                    border: meetingTargetMode === "attach" ? "1px solid var(--cta)" : "1px solid var(--border)",
                    background: meetingTargetMode === "attach" ? "#ebf5ff" : "var(--surface-2)",
                    padding: "12px",
                    textAlign: "left",
                  }}
                >
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                    Attach existing project
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                    Pick an existing project and enqueue transcript ingest without creating a new project.
                  </p>
                </button>
              </div>

              <form onSubmit={handleMeetingSubmit} className="mt-5 grid gap-4 md:grid-cols-2" style={{ display: meetingBootstrappedDraft || meetingCreatedProjectId ? "none" : undefined }}>
                {meetingTargetMode === "create" ? (
                  <>
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

                    <label className="block">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Start date
                      </span>
                      <input
                        type="date"
                        value={meetingStartDate}
                        onChange={(event) => setMeetingStartDate(event.target.value)}
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
                        value={meetingTargetDate}
                        onChange={(event) => setMeetingTargetDate(event.target.value)}
                        className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                        style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                      />
                    </label>
                  </>
                ) : (
                  <label className="block md:col-span-2">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                      Project to attach
                    </span>
                    <select
                      required
                      value={meetingAttachProjectId}
                      onChange={(event) => setMeetingAttachProjectId(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    >
                      <option value="">Select a project...</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block md:col-span-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Meeting title (optional)
                  </span>
                  <input
                    value={meetingTitle}
                    onChange={(event) => setMeetingTitle(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[15px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    placeholder="Weekly team sync"
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

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      meetingBusy ||
                      meetingTranscript.trim().length < 20 ||
                      (meetingTargetMode === "create" ? meetingName.trim().length < 2 : !meetingAttachProjectId)
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                    style={{
                      background: "var(--cta)",
                      opacity:
                        meetingBusy ||
                        meetingTranscript.trim().length < 20 ||
                        (meetingTargetMode === "create" ? meetingName.trim().length < 2 : !meetingAttachProjectId)
                          ? 0.7
                          : 1,
                    }}
                  >
                    {meetingBusy ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
                    {meetingBusy ? "Generating preview..." : "Preview action items"}
                  </button>
                </div>
              </form>

              {meetingBootstrappedDraft && !meetingCreatedProjectId && (
                <div className="mt-5 space-y-4 rounded-[24px] border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                      Bootstrap preview
                    </p>
                    <p className="mt-2 text-[14px] leading-7" style={{ color: "var(--text-1)" }}>
                      {meetingBootstrappedDraft.bootstrap.summary ?? "Action items extracted from the meeting transcript."}
                    </p>
                  </div>

                  {meetingBootstrappedDraft.bootstrap.tasks.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Starter tasks
                      </p>
                      <div className="mt-2 space-y-2">
                        {meetingBootstrappedDraft.bootstrap.tasks.map((task, index) => (
                          <div key={`${task.title}-${index}`} className="rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                            <p className="font-medium" style={{ color: "var(--text-1)" }}>
                              {task.title}
                            </p>
                            {task.dueDate && (
                              <p className="mt-1" style={{ color: "var(--text-2)" }}>
                                Due: {task.dueDate}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {meetingBootstrappedDraft.bootstrap.actions.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Suggested actions
                      </p>
                      <div className="mt-2 space-y-2">
                        {meetingBootstrappedDraft.bootstrap.actions.map((action, index) => (
                          <div key={`${action.type}-${index}`} className="rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                            <p className="font-medium" style={{ color: "var(--text-1)" }}>
                              {action.displayText}
                            </p>
                            <p className="mt-1" style={{ color: "var(--text-2)" }}>
                              {action.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {meetingError && (
                    <div className="rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                      {meetingError}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => { setMeetingBootstrappedDraft(null); setMeetingError(null); }}
                      disabled={meetingFinalizeBusy}
                      className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
                    >
                      Edit transcript
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMeetingFinalize()}
                      disabled={meetingFinalizeBusy}
                      className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
                      style={{ background: "var(--cta)", opacity: meetingFinalizeBusy ? 0.7 : 1 }}
                    >
                      {meetingFinalizeBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {meetingFinalizeBusy ? "Finalizing..." : "Confirm and create project"}
                    </button>
                  </div>
                </div>
              )}

              {meetingCreatedProjectId && (
                <div className="mt-5 rounded-2xl border px-4 py-4" style={{ borderColor: "#bbf7d0", background: "#f0fdf4" }}>
                  <p className="text-[14px] font-semibold" style={{ color: "#166534" }}>
                    Transcript queued on canonical intake path
                  </p>
                  <p className="mt-2 text-[13px]" style={{ color: "#166534" }}>
                    Project {meetingTargetMode === "attach" ? "attached" : "created"}, action items bootstrapped, and transcript ingest enqueued.
                  </p>
                  <p className="mt-2 text-[12px]" style={{ color: "#166534" }}>
                    Meeting note: {meetingNoteId ?? "pending"} | Canonical event: {meetingCanonicalEventId ?? "pending"}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/workspace/projects/${meetingCreatedProjectId}`)}
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                    style={{ background: "#16a34a" }}
                  >
                    Open project
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </SectionCard>
          )}

          {mode === "import" && (
            <SectionCard
              title="Start from a document"
              description="Upload a PDF, Word document, or Excel file. Larry will extract the project structure."
            >
              <div className="space-y-4">
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors"
                  style={{ borderColor: file ? "var(--brand)" : "var(--border)" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const droppedFile = e.dataTransfer.files[0];
                    if (droppedFile) setFile(droppedFile);
                  }}
                >
                  <Upload size={28} style={{ color: file ? "var(--brand)" : "var(--text-disabled)" }} />
                  {file ? (
                    <p className="text-[14px] font-medium" style={{ color: "var(--text-1)" }}>
                      {file.name}
                    </p>
                  ) : (
                    <p className="text-[13px]" style={{ color: "var(--text-disabled)" }}>
                      Drop a file here or click to browse
                    </p>
                  )}
                  <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
                    Supports .pdf, .docx, .xlsx
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) setFile(selected);
                    }}
                  />
                </div>

                {manualError && (
                  <p className="text-[13px]" style={{ color: "#be123c" }}>{manualError}</p>
                )}

                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!file || importBusy}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--cta)" }}
                >
                  {importBusy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Larry is reading your document...
                    </>
                  ) : (
                    "Process with Larry"
                  )}
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
