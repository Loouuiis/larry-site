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
import Image from "next/image";
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
  { id: "manual", icon: ClipboardList, title: "Manual setup", description: "Create tasks, goals, and responsibilities manually." },
  { id: "chat", icon: MessageSquare, title: "Chat with Larry", description: "Describe your project and Larry will build it for you." },
  { id: "transcript", icon: FileText, title: "Start from meeting", description: "Larry extracts structure from a meeting recording or transcript." },
];

const CHAT_QUESTIONS = [
  "What is the working name of this project?",
  "What outcome are you trying to deliver?",
  "What deadline, launch date, or milestone are you aiming for?",
  "What are the first 3-5 deliverables or workstreams Larry should set up?",
  "What risks, constraints, or dependencies should Larry keep in view?",
] as const;


function StepIndicator({ step }: { step: FlowStep }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((item) => (
        <motion.div
          key={item}
          animate={{
            width: item === step ? 28 : 10,
            backgroundColor: item <= step ? "#6c44f6" : "#bdb7d0",
          }}
          transition={{ duration: 0.24, ease: EASE }}
          className="h-2 rounded-full"
        />
      ))}
      <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--text-disabled)" }}>Step {step} / 3</span>
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
      <div className="mb-6">
        <Image
          src="/icon.png"
          alt="Larry"
          width={80}
          height={80}
          className="object-contain"
        />
      </div>
      <p className="text-caption" style={{ color: "var(--brand)" }}>NEW PROJECT</p>
      <h1 className="text-h1 mt-3" style={{ color: "var(--text-1)" }}>
        Start a project with Larry
      </h1>
      <p className="text-body mt-4 max-w-lg leading-relaxed" style={{ color: "var(--text-2)" }}>
        Pick the intake path that fits your team. Every option here is wired to the live project, Larry, and transcript routes.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="pm-btn pm-btn-primary mt-10 gap-2 px-7"
        style={{ height: 42 }}
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
        <h2 className="text-h1" style={{ color: "var(--text-1)" }}>
          How would you like to start?
        </h2>
        <p className="text-body mt-2" style={{ color: "var(--text-2)" }}>
          Manual creates immediately, chat lets Larry guide you, and transcript runs the real extraction flow.
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
              className="p-5 text-left transition"
              style={{
                borderRadius: "var(--radius-card)",
                border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                background: active ? "var(--surface-2)" : "var(--surface)",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = "var(--border-2)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = active ? "var(--brand)" : "var(--border)"; }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--surface-2)", color: "var(--brand)" }}>
                <Icon size={18} />
              </span>
              <p className="text-h3 mt-4" style={{ color: "var(--text-1)" }}>{option.title}</p>
              <p className="text-body-sm mt-2 leading-relaxed">{option.description}</p>
              {active && (
                <div className="mt-3 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "var(--brand)" }}>
                  <Check size={14} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedMode}
          className="pm-btn pm-btn-primary gap-2 px-6"
          style={{ height: 42 }}
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
      <div className="p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-soft)" }}>
        <h2 className="text-h1" style={{ color: "var(--text-1)" }}>Manual setup</h2>
        <p className="text-body mt-2" style={{ color: "var(--text-2)" }}>
          Create your project directly with a name, description, and dates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          aria-label="Project name"
          className="h-12 rounded-lg px-4 text-sm outline-none"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="Description"
          aria-label="Project description"
          className="rounded-lg px-4 py-3 text-sm outline-none"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="relative">
            <CalendarRange size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-disabled)" }} />
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-label="Project start date"
              className="h-12 w-full pl-11 pr-4 text-sm outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </label>
          <label className="relative">
            <CalendarRange size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-disabled)" }} />
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              aria-label="Project target date"
              className="h-12 w-full pl-11 pr-4 text-sm outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </label>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || name.trim().length === 0}
            className="pm-btn pm-btn-primary gap-2"
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
  onSuccess,
  showToast,
}: {
  onSuccess: (projectId: string) => void;
  showToast: (toast: ToastState) => void;
}) {
  const [messages, setMessages] = useState<Array<{ id: string; role: "larry" | "user"; text: string }>>([
    { id: "q0", role: "larry", text: CHAT_QUESTIONS[0] },
  ]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ projectName: string; projectId: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const answer = input.trim();
    if (answer.length < 2 || busy || success) return;

    setBusy(true);
    setError(null);
    const nextAnswers = answers.concat(answer);

    try {
      setMessages((current) => current.concat({ id: crypto.randomUUID(), role: "user", text: answer }));
      setAnswers(nextAnswers);
      setInput("");

      if (questionIndex < CHAT_QUESTIONS.length - 1) {
        const nextIndex = questionIndex + 1;
        const nextPrompt = CHAT_QUESTIONS[nextIndex];
        setMessages((current) => current.concat({ id: `q${nextIndex}`, role: "larry", text: nextPrompt }));
        setQuestionIndex(nextIndex);
        return;
      }

      setMessages((current) => current.concat({ id: "processing", role: "larry", text: "Creating the project..." }));
      const projectName = nextAnswers[0]?.trim() || "New Project";

      // Step 1: create intake draft with all chat answers
      const draftResponse = await fetch("/api/workspace/projects/intake/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          project: { name: projectName },
          chat: { answers: nextAnswers },
        }),
      });
      const draftData = await draftResponse.json() as { draft?: { id: string }; error?: string };
      if (!draftResponse.ok || !draftData.draft?.id) {
        throw new Error(draftData.error ?? "Failed to create project.");
      }

      // Step 2: finalize — runs AI bootstrap (generateBootstrapTasks) and creates the project
      const finalizeResponse = await fetch(`/api/workspace/projects/intake/drafts/${draftData.draft.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const finalizeData = await finalizeResponse.json() as { draft?: { finalized?: { projectId?: string } }; error?: string };
      if (!finalizeResponse.ok || !finalizeData.draft?.finalized?.projectId) {
        throw new Error(finalizeData.error ?? "Failed to finalize project.");
      }

      const projectId = finalizeData.draft.finalized.projectId;

      setMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: `Done — "${projectName}" is created. Open the project when you're ready.` })
      );

      setSuccess({ projectName, projectId });
      showToast({ tone: "success", message: `"${projectName}" created.` });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error. Please try again.";
      setMessages((current) =>
        current.filter((message) => message.id !== "processing").concat({ id: crypto.randomUUID(), role: "larry", text: message })
      );
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-5">
        <div className="border border-emerald-200 bg-emerald-50 p-5" style={{ borderRadius: "var(--radius-card)" }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Check size={18} />
          </div>
          <h2 className="text-h1 mt-4" style={{ color: "var(--text-1)" }}>{success.projectName} is ready</h2>
          <p className="text-body mt-2" style={{ color: "var(--text-2)" }}>
            Open the project and continue from there.
          </p>
          <button
            type="button"
            onClick={() => onSuccess(success.projectId)}
            className="pm-btn pm-btn-primary mt-5 gap-2"
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
      <div className="p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-soft)" }}>
        <h2 className="text-h1" style={{ color: "var(--text-1)" }}>Chat with Larry</h2>
        <p className="text-body mt-2" style={{ color: "var(--text-2)" }}>
          Answer five guided questions and Larry will create your project with full context.
        </p>
      </div>

      <div className="p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-caption">
            Question {questionIndex + 1} / {CHAT_QUESTIONS.length}
          </p>
          <div className="h-2 w-32 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${((questionIndex + 1) / CHAT_QUESTIONS.length) * 100}%`, background: "var(--brand)" }} />
          </div>
        </div>
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "larry" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[88%] px-4 py-3 text-[13px] leading-relaxed ${
                  message.role === "larry"
                    ? "rounded-lg rounded-tl-sm text-neutral-800"
                    : "rounded-lg rounded-tr-sm text-white"
                }`}
                style={message.role === "user" ? { background: "var(--brand)" } : { background: "var(--surface-2)" }}
              >
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

      <form onSubmit={handleSubmit} className="space-y-4 p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)" }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder="Type your answer here..."
          aria-label="Current chat intake answer"
          className="w-full px-4 py-3 text-sm outline-none"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)", background: "var(--bg-soft)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        <div className="flex items-center justify-between gap-4">
          <p className="text-body-sm">Intake answers stay local until project creation.</p>
          <button
            type="submit"
            disabled={busy || input.trim().length < 2}
            className="pm-btn pm-btn-primary gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {questionIndex === CHAT_QUESTIONS.length - 1 ? "Create project" : "Next answer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TranscriptPane({
  onSuccess,
  showToast,
}: {
  onSuccess: (projectId: string) => void;
  showToast: (toast: ToastState) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [projectName, setProjectName] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
    if (!projectName.trim()) {
      setError("Give the project a name.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Step 1 — create intake draft
      const draftRes = await fetch("/api/workspace/projects/intake/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "meeting",
          project: { name: projectName.trim(), description: null, startDate: null, targetDate: null, attachToProjectId: null },
          meeting: { meetingTitle: null, transcript: transcript.trim() },
        }),
      });
      const draftData = (await draftRes.json()) as { draft?: { id: string }; error?: string; message?: string };
      if (!draftRes.ok || !draftData.draft?.id) {
        setError(draftData.message ?? draftData.error ?? "Failed to create intake draft.");
        return;
      }

      // Step 2 — bootstrap (AI extraction)
      const bootstrapRes = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftData.draft.id)}/bootstrap`, {
        method: "POST",
      });
      const bootstrapData = (await bootstrapRes.json()) as { draft?: { id: string }; error?: string; message?: string };
      if (!bootstrapRes.ok || !bootstrapData.draft) {
        setError(bootstrapData.message ?? bootstrapData.error ?? "Failed to extract actions from transcript.");
        return;
      }

      // Step 3 — finalize (create project)
      const finalizeRes = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftData.draft.id)}/finalize`, {
        method: "POST",
      });
      const finalizeData = (await finalizeRes.json()) as { draft?: { id: string; projectId?: string }; error?: string; message?: string };
      if (!finalizeRes.ok || !finalizeData.draft) {
        setError(finalizeData.message ?? finalizeData.error ?? "Failed to finalize the project.");
        return;
      }

      setDone(true);
      showToast({ tone: "success", message: `"${projectName.trim()}" created from transcript.` });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));

      if (finalizeData.draft.projectId) {
        onSuccess(finalizeData.draft.projectId);
      }
    } catch {
      setError("Network error while processing the transcript.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-soft)" }}>
        <h2 className="text-h1" style={{ color: "var(--text-1)" }}>Start from meeting</h2>
        <p className="text-body mt-2" style={{ color: "var(--text-2)" }}>
          Paste transcript text or upload a .txt file. Larry will extract actions and structure your project.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5" style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)" }}>
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
          aria-label="Project name"
          className="h-12 w-full px-4 text-sm outline-none"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={10}
          placeholder="Paste meeting notes or transcript text here..."
          aria-label="Transcript text"
          className="w-full px-4 py-3 text-sm outline-none"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-input)", background: "var(--bg-soft)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-4 py-3" style={{ border: "1px dashed var(--border-2)", background: "var(--bg-soft)" }}>
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>{fileName ? `Loaded ${fileName}` : "Upload a .txt transcript file"}</p>
          <label className="pm-btn pm-btn-secondary pm-btn-sm cursor-pointer gap-2">
            <Upload size={14} />
            Choose file
            <input type="file" accept=".txt,text/plain" onChange={handleFileChange} className="sr-only" />
          </label>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        {done && (
          <div className="border border-emerald-200 bg-emerald-50 px-4 py-4" style={{ borderRadius: "var(--radius-card)" }}>
            <p className="text-h3" style={{ color: "var(--text-1)" }}>Project created from transcript</p>
            <p className="text-body-sm mt-1">Larry extracted actions and bootstrapped your project.</p>
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || transcript.trim().length < 20 || !projectName.trim() || done}
            className="pm-btn pm-btn-primary gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? "Processing..." : "Extract & create project"}
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
    onClose();
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
      return <ChatPane onSuccess={handleProjectCreated} showToast={setToast} />;
    }
    if (selectedMode === "transcript") {
      return <TranscriptPane onSuccess={handleProjectCreated} showToast={setToast} />;
    }
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm"
      style={{ background: "rgba(15,23,42,0.55)" }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.28, ease: EASE }}
        className="relative w-full max-w-4xl overflow-y-auto bg-white p-8"
        style={{ maxHeight: "90vh", borderRadius: "var(--radius-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-3)" }}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step === 3 ? 2 : 1)}
                className="pm-btn pm-btn-secondary pm-btn-sm"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator step={step} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new project flow"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <X size={16} />
            </button>
          </div>
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
                "pointer-events-none absolute bottom-6 right-6 max-w-sm rounded-lg px-4 py-3 text-[13px] font-medium",
                toast.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-rose-200 bg-rose-50 text-rose-700",
              ].join(" ")}
              style={{ boxShadow: "var(--shadow-2)" }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
