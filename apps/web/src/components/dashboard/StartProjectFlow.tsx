"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type ElementType,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  ClipboardList,
  FileText,
  Loader2,
  MessageSquare,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  createLarryConversation,
  saveLarryMessage,
} from "@/lib/larry";

const EASE = [0.22, 1, 0.36, 1] as const;

type FlowStep = 1 | 2 | 3;
type StartMode = "manual" | "chat" | "transcript";

interface StartProjectFlowProps {
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

interface ToastState {
  tone: "success" | "error";
  message: string;
}

const MODE_OPTIONS: Array<{
  id: StartMode;
  icon: ElementType;
  title: string;
  description: string;
}> = [
  { id: "manual", icon: ClipboardList, title: "Manual setup", description: "Create the project directly with dates and description." },
  { id: "chat", icon: MessageSquare, title: "Chat intake", description: "Answer five guided questions and create a pending project draft." },
  { id: "transcript", icon: FileText, title: "Transcript import", description: "Paste notes or upload a .txt transcript for extraction." },
];

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

function buildTranscriptToast(actionCount: number, pendingApprovals: number) {
  const label = `${actionCount} action${actionCount === 1 ? "" : "s"} extracted`;
  return pendingApprovals > 0
    ? `${label}. ${pendingApprovals} awaiting approval in the Action Center.`
    : `${label}. Larry finished processing the transcript.`;
}

function StepIndicator({ step }: { step: FlowStep }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((item) => (
        <motion.div
          key={item}
          animate={{
            width: item === step ? 28 : 10,
            backgroundColor: item <= step ? "#0f62fe" : "#d6dde8",
          }}
          transition={{ duration: 0.24, ease: EASE }}
          className="h-2 rounded-full"
        />
      ))}
      <span className="ml-2 text-[11px] font-medium text-neutral-400">Step {step} / 3</span>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="flex flex-col items-center text-center"
    >
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,_#0f62fe_0%,_#4589ff_100%)] text-4xl font-bold text-white shadow-[0_20px_40px_rgba(15,98,254,0.22)]">
        L
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0f62fe]">New Project</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-neutral-900">
        Start a project with a real Larry workflow.
      </h1>
      <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-neutral-500">
        Pick the intake path that fits your team. Every option here is wired to the live project, Larry, and transcript routes.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-[#0f62fe] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#0043ce]"
      >
        Choose a setup path
        <ArrowRight size={16} />
      </button>
    </motion.div>
  );
}

function ModeSelectionStep({
  selectedMode,
  onSelect,
  onContinue,
}: {
  selectedMode: StartMode | null;
  onSelect: (mode: StartMode) => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-900">
          Pick the intake mode
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Manual creates immediately, chat creates a pending project draft, and transcript runs the real extraction flow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = selectedMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={[
                "rounded-[24px] border p-5 text-left transition",
                active ? "border-[#0f62fe] bg-[#edf4ff]" : "border-[#dbe3ef] bg-white hover:border-[#adc6ff]",
              ].join(" ")}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#0f62fe]">
                <Icon size={18} />
              </span>
              <p className="mt-4 text-[16px] font-semibold text-neutral-900">{option.title}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedMode}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#0f62fe] px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0043ce]"
        >
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  );
}

function ManualPane({
  onSuccess,
  showToast,
}: {
  onSuccess: (projectId: string) => void;
  showToast: (toast: ToastState) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName) return;
    if (startDate && targetDate && startDate > targetDate) {
      setError("Target date must be on or after the start date.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          targetDate: targetDate || undefined,
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Failed to create the project.");
        return;
      }
      showToast({ tone: "success", message: "Project created. Opening workspace..." });
      onSuccess(data.id);
    } catch {
      setError("Network error while creating the project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-[#dbe3ef] bg-[#f8fbff] p-5">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-900">Manual setup</h2>
        <p className="mt-2 text-[14px] text-neutral-500">
          This calls the live project API with name, description, start date, and target date.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          aria-label="Project name"
          className="h-12 rounded-2xl border border-[#dbe3ef] px-4 text-sm outline-none focus:border-[#0f62fe]"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="Description"
          aria-label="Project description"
          className="rounded-2xl border border-[#dbe3ef] px-4 py-3 text-sm outline-none focus:border-[#0f62fe]"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="relative">
            <CalendarRange size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-label="Project start date"
              className="h-12 w-full rounded-2xl border border-[#dbe3ef] pl-11 pr-4 text-sm outline-none focus:border-[#0f62fe]"
            />
          </label>
          <label className="relative">
            <CalendarRange size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              aria-label="Project target date"
              className="h-12 w-full rounded-2xl border border-[#dbe3ef] pl-11 pr-4 text-sm outline-none focus:border-[#0f62fe]"
            />
          </label>
        </div>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || name.trim().length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0043ce]"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {loading ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatPane({
  onReviewActions,
  showToast,
}: {
  onReviewActions: () => void;
  showToast: (toast: ToastState) => void;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; role: "larry" | "user"; text: string }>>([
    { id: "q0", role: "larry", text: CHAT_QUESTIONS[0] },
  ]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ projectName: string; taskCount: number; actionId?: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const answer = input.trim();
    if (answer.length < 2 || busy || success) return;

    setBusy(true);
    setError(null);
    let activeConversationId = conversationId;
    const nextAnswers = answers.concat(answer);

    try {
      if (!activeConversationId) {
        const created = await createLarryConversation({ title: `Project intake: ${answer.slice(0, 60)}` });
        activeConversationId = created.id;
        setConversationId(created.id);
        await saveLarryMessage(created.id, "larry", CHAT_QUESTIONS[0]).catch(() => undefined);
      }

      await saveLarryMessage(activeConversationId, "user", answer).catch(() => undefined);
      setMessages((current) => current.concat({ id: crypto.randomUUID(), role: "user", text: answer }));
      setAnswers(nextAnswers);
      setInput("");

      if (questionIndex < CHAT_QUESTIONS.length - 1) {
        const nextIndex = questionIndex + 1;
        const nextPrompt = CHAT_QUESTIONS[nextIndex];
        setMessages((current) => current.concat({ id: `q${nextIndex}`, role: "larry", text: nextPrompt }));
        setQuestionIndex(nextIndex);
        await saveLarryMessage(activeConversationId, "larry", nextPrompt).catch(() => undefined);
        return;
      }

      setMessages((current) => current.concat({ id: "processing", role: "larry", text: "Creating the project..." }));
      const projectName = nextAnswers[0]?.trim() || "New Project";
      const description = buildProjectIntake(nextAnswers);

      const response = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, description }),
      });
      const data = await response.json() as { id?: string; error?: string };

      if (!response.ok || !data.id) {
        const replyText = data.error ?? "Failed to create project.";
        setMessages((current) =>
          current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: replyText })
        );
        await saveLarryMessage(activeConversationId, "larry", replyText).catch(() => undefined);
        setError(replyText);
        return;
      }

      const replyText = `Done — "${projectName}" is created. Open it and tell Larry what to set up first.`;
      setMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: replyText })
      );
      await saveLarryMessage(activeConversationId, "larry", replyText).catch(() => undefined);

      setSuccess({
        projectName,
        taskCount: 0,
        actionId: undefined,
      });
      showToast({ tone: "success", message: `"${projectName}" created.` });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: "Network error. Please try again." })
      );
      setError("Network error while creating the project draft.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-5">
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <Check size={18} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-neutral-900">{success.projectName} is ready</h2>
          <p className="mt-2 text-[14px] text-neutral-600">
            Open the project and tell Larry what tasks to set up — it will act immediately.
          </p>
          <button
            type="button"
            onClick={onReviewActions}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-sm font-semibold text-white transition hover:bg-[#0043ce]"
          >
            Open Project
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-[#dbe3ef] bg-[#f8fbff] p-5">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-900">Chat intake</h2>
        <p className="mt-2 text-[14px] text-neutral-500">
          Five fixed questions, persisted as a Larry conversation, ending in a pending `create_project` command.
        </p>
      </div>

      <div className="rounded-[24px] border border-[#dbe3ef] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Question {questionIndex + 1} / {CHAT_QUESTIONS.length}
          </p>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-[#0f62fe] transition-all" style={{ width: `${((questionIndex + 1) / CHAT_QUESTIONS.length) * 100}%` }} />
          </div>
        </div>
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "larry" ? "justify-start" : "justify-end"}`}>
              <div className={["max-w-[88%] rounded-[22px] px-4 py-3 text-[13px] leading-relaxed", message.role === "larry" ? "rounded-tl-md bg-[#eef4ff] text-neutral-800" : "rounded-tr-md bg-[#0f62fe] text-white"].join(" ")}>
                {busy && message.id === "processing" ? (
                  <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{message.text}</span>
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[24px] border border-[#dbe3ef] bg-white p-5">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder="Type your answer here..."
          aria-label="Current chat intake answer"
          className="w-full rounded-2xl border border-[#dbe3ef] bg-[#f8fbff] px-4 py-3 text-sm outline-none focus:border-[#0f62fe]"
        />
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[12px] text-neutral-500">Larry will save this intake and create a pending review action at the end.</p>
          <button
            type="submit"
            disabled={busy || input.trim().length < 2}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0043ce]"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {questionIndex === CHAT_QUESTIONS.length - 1 ? "Draft project" : "Next answer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TranscriptPane({
  onReviewActions,
  showToast,
}: {
  onReviewActions: () => void;
  showToast: (toast: ToastState) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ actionCount: number; pendingApprovals: number } | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt transcript uploads are supported in this flow.");
      event.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      setTranscript(text);
      setFileName(file.name);
      setError(null);
    } catch {
      setError("Could not read that transcript file.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (transcript.trim().length < 20) {
      setError("Paste a fuller transcript or upload a .txt file with at least 20 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/meetings/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() }),
      });
      const data = (await response.json()) as { actionCount?: number; pendingApprovals?: number; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to process the transcript.");
        return;
      }
      const actionCount = data.actionCount ?? 0;
      const pendingApprovals = data.pendingApprovals ?? 0;
      setResult({ actionCount, pendingApprovals });
      showToast({ tone: "success", message: buildTranscriptToast(actionCount, pendingApprovals) });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch {
      setError("Network error while processing the transcript.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-[#dbe3ef] bg-[#f8fbff] p-5">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-900">Transcript import</h2>
        <p className="mt-2 text-[14px] text-neutral-500">
          Paste transcript text or upload a `.txt` file. Larry will run the live transcript pipeline and report extracted action counts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[24px] border border-[#dbe3ef] bg-white p-5">
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={10}
          placeholder="Paste meeting notes or transcript text here..."
          aria-label="Transcript text"
          className="w-full rounded-2xl border border-[#dbe3ef] bg-[#f8fbff] px-4 py-3 text-sm outline-none focus:border-[#0f62fe]"
        />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-[#c8d4e6] bg-[#f8fbff] px-4 py-3">
          <p className="text-[13px] text-neutral-600">{fileName ? `Loaded ${fileName}` : "Upload a .txt transcript file"}</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe3ef] bg-white px-4 py-2 text-[12px] font-semibold text-neutral-700">
            <Upload size={14} />
            Choose file
            <input type="file" accept=".txt,text/plain" onChange={handleFileChange} className="sr-only" />
          </label>
        </div>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        {result && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <p className="text-[14px] font-semibold text-neutral-900">Transcript processed</p>
            <p className="mt-1 text-[13px] text-neutral-600">{buildTranscriptToast(result.actionCount, result.pendingApprovals)}</p>
            <button
              type="button"
              onClick={onReviewActions}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl bg-[#0f62fe] px-4 text-[13px] font-semibold text-white transition hover:bg-[#0043ce]"
            >
              Review extracted actions
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || transcript.trim().length < 20}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0043ce]"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? "Processing..." : "Extract actions"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function StartProjectFlow({ onClose, onCreated }: StartProjectFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>(1);
  const [selectedMode, setSelectedMode] = useState<StartMode | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function handleProjectCreated(projectId: string) {
    if (onCreated) {
      onCreated(projectId);
      return;
    }
    router.push(`/workspace/projects/${projectId}`);
  }

  function renderPane() {
    if (selectedMode === "manual") {
      return <ManualPane onSuccess={handleProjectCreated} showToast={setToast} />;
    }
    if (selectedMode === "chat") {
      return <ChatPane onReviewActions={() => router.push("/workspace")} showToast={setToast} />;
    }
    if (selectedMode === "transcript") {
      return <TranscriptPane onReviewActions={() => router.push("/workspace")} showToast={setToast} />;
    }
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.55)] px-4 py-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.28, ease: EASE }}
        className="relative w-full max-w-4xl rounded-[32px] border border-[#dbe3ef] bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.2)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close new project flow"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X size={18} />
        </button>

        <div className="mb-8 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step === 3 ? 2 : 1)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#dbe3ef] px-4 text-[13px] font-semibold text-neutral-600 transition hover:border-[#adc6ff] hover:text-[#0f62fe]"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>
          <StepIndicator step={step} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && <WelcomeStep key="welcome" onNext={() => setStep(2)} />}
          {step === 2 && (
            <ModeSelectionStep
              key="modes"
              selectedMode={selectedMode}
              onSelect={setSelectedMode}
              onContinue={() => selectedMode && setStep(3)}
            />
          )}
          {step === 3 && selectedMode && (
            <motion.div
              key={selectedMode}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {renderPane()}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={[
                "pointer-events-none absolute bottom-6 right-6 max-w-sm rounded-2xl px-4 py-3 text-[13px] shadow-lg",
                toast.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-rose-200 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
