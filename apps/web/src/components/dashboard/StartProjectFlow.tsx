"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  MessageSquare,
  Video,
  Upload,
  ArrowRight,
  X,
  Mic,
  Check,
  Loader2,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface StartProjectFlowProps {
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ─── Step 1 — Welcome ──────────────────────────────────────────────────── */
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center text-center"
    >
      {/* Larry avatar */}
      <motion.div variants={item} className="mb-8 relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--color-brand)]">
          <span className="text-4xl font-bold text-white select-none">L</span>
        </div>
        {/* Online dot */}
        <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />
      </motion.div>

      {/* Text */}
      <motion.h1
        variants={item}
        className="text-3xl font-bold text-neutral-900 tracking-[-0.03em] leading-[1.1]"
       
      >
        Welcome! I&apos;m Larry,
        <br />
        your AI Project Manager
      </motion.h1>
      <motion.p
        variants={item}
        className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-500"
      >
        I track tasks, flag blockers, chase deadlines, and keep your team
        aligned — so you don&apos;t have to.
      </motion.p>

      {/* CTA */}
      <motion.button
        variants={item}
        onClick={onNext}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="mt-10 flex items-center gap-2 rounded-2xl bg-[var(--color-brand)] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.35)] hover:bg-[var(--color-brand-dark)] transition-colors"
      >
        Start a Project
        <ArrowRight size={16} />
      </motion.button>

      <motion.p variants={item} className="mt-4 text-[11px] text-neutral-400">
        No credit card needed &middot; Set up in under 2 minutes
      </motion.p>
    </motion.div>
  );
}

/* ─── Option cards ──────────────────────────────────────────────────────── */
const OPTIONS = [
  {
    id: "manual",
    icon: ClipboardList,
    title: "Manual Setup",
    description: "Create tasks, goals, and responsibilities manually",
    preview: null,
    accentColor: "text-neutral-600",
    accentBg: "bg-[var(--color-surface)]",
    borderHover: "hover:border-[var(--color-border)]",
    glow: "rgba(0,0,0,0.04)",
  },
  {
    id: "chat",
    icon: MessageSquare,
    title: "Chat with Larry",
    description: "Describe your project via text or voice",
    preview: "chat",
    accentColor: "text-neutral-600",
    accentBg: "bg-[var(--color-surface)]",
    borderHover: "hover:border-[var(--color-border)]",
    glow: "rgba(0,0,0,0.04)",
  },
  {
    id: "meeting",
    icon: Video,
    title: "Start from Meeting",
    description: "Larry extracts structure from a meeting",
    preview: "meeting",
    accentColor: "text-neutral-600",
    accentBg: "bg-[var(--color-surface)]",
    borderHover: "hover:border-[var(--color-border)]",
    glow: "rgba(0,0,0,0.04)",
  },
] as const;

type OptionId = (typeof OPTIONS)[number]["id"];

function ChatPreview() {
  return (
    <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-3 space-y-2">
      <div className="flex gap-2 items-start">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[8px] font-bold text-white">
          L
        </span>
        <p className="text-[10px] leading-relaxed text-neutral-500 bg-white rounded-xl rounded-tl-sm px-2.5 py-1.5 border border-neutral-100">
          Tell me about your project — what&apos;s the goal?
        </p>
      </div>
      <div className="flex gap-2 items-start flex-row-reverse">
        <p className="text-[10px] leading-relaxed text-white bg-[var(--color-brand)] rounded-xl rounded-tr-sm px-2.5 py-1.5">
          Launch a client portal by April…
        </p>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <button className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-[9px] text-neutral-500">
          <Mic size={8} /> Voice
        </button>
        <span className="text-[9px] text-neutral-400">or type below</span>
      </div>
    </div>
  );
}

function MeetingPreview() {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3 flex flex-col items-center gap-2 text-center">
      <Upload size={18} className="text-neutral-300" />
      <p className="text-[10px] text-neutral-400">
        Drop a recording or transcript
      </p>
      <div className="flex gap-1.5">
        <button className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[9px] font-medium text-neutral-600 hover:border-neutral-300 hover:text-neutral-800 transition-colors">
          Upload file
        </button>
        <button className="rounded-lg border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/8 px-2.5 py-1 text-[9px] font-medium text-[var(--color-brand)]">
          Start meeting
        </button>
      </div>
    </div>
  );
}

/* ─── Step 2 — Options ──────────────────────────────────────────────────── */
function StepOptions({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function handleSelect(id: OptionId) {
    setSelected(id);
    setError(null);
  }

  async function handleConfirm() {
    if (!selected) return;
    const projectName = name.trim() || `New Project`;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Failed to create project. Please try again.");
        return;
      }
      setConfirmed(true);
      setTimeout(() => {
        onCreated ? onCreated(data.id!) : onClose();
      }, 800);
    } catch {
      setError("Network error — is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center w-full"
    >
      <motion.div variants={item} className="text-center mb-8">
        <h2
          className="text-2xl font-bold text-neutral-900 tracking-[-0.03em]"
        >
          How would you like to start?
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Choose the setup method that works best for you
        </p>
      </motion.div>

      {/* Project name input */}
      <motion.div variants={item} className="w-full max-w-2xl mb-6">
        <input
          type="text"
          placeholder="Project name (e.g. Q2 Launch, Client Portal…)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 focus:border-[var(--color-brand)]"
        />
      </motion.div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 w-full max-w-2xl sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selected === opt.id;
          return (
            <motion.button
              key={opt.id}
              variants={item}
              onClick={() => handleSelect(opt.id)}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASE }}
              className={[
                "relative text-left rounded-2xl border bg-white p-5 transition-all duration-200",
                isSelected
                  ? "border-[var(--color-brand)] shadow-sm"
                  : "border-[var(--color-border)] hover:border-neutral-300 hover:shadow-sm",
              ].join(" ")}
            >
              {/* Selected check */}
              <AnimatePresence>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-white"
                  >
                    <Check size={10} strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Icon */}
              <span
                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${opt.accentBg}`}
              >
                <Icon size={17} className={opt.accentColor} />
              </span>

              <p className="text-sm font-semibold text-neutral-900 leading-snug">
                {opt.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                {opt.description}
              </p>

              {/* Inline previews */}
              {isSelected && opt.preview === "chat" && <ChatPreview />}
              {isSelected && opt.preview === "meeting" && <MeetingPreview />}
            </motion.button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-sm text-red-500"
        >
          {error}
        </motion.p>
      )}

      {/* Confirm CTA */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mt-8"
          >
            <motion.button
              onClick={() => void handleConfirm()}
              disabled={loading || confirmed}
              whileHover={!confirmed && !loading ? { scale: 1.03, y: -1 } : {}}
              whileTap={!confirmed && !loading ? { scale: 0.97 } : {}}
              transition={{ duration: 0.18, ease: EASE }}
              className={[
                "flex items-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-semibold text-white transition-all disabled:opacity-70",
                confirmed
                  ? "bg-emerald-500 shadow-[0_4px_16px_rgba(52,211,153,0.3)]"
                  : "bg-[var(--color-brand)] shadow-[0_4px_16px_rgba(139,92,246,0.35)] hover:bg-[var(--color-brand-dark)]",
              ].join(" ")}
            >
              {confirmed ? (
                <>
                  <Check size={15} strokeWidth={2.5} />
                  Project created!
                </>
              ) : loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create Project
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Step indicator ────────────────────────────────────────────────────── */
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2].map((n) => {
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center gap-2">
            <motion.div
              animate={{
                width: active ? 28 : 8,
                backgroundColor: done || active ? "var(--color-brand)" : "#e5e5e5",
              }}
              transition={{ duration: 0.3, ease: EASE }}
              className="h-2 rounded-full"
            />
          </div>
        );
      })}
      <span className="ml-1 text-[10px] font-medium text-neutral-400">
        Step {step} / 2
      </span>
    </div>
  );
}

/* ─── Root component ────────────────────────────────────────────────────── */
export function StartProjectFlow({ onClose, onCreated }: StartProjectFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    /* Full-screen overlay */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm px-4"
    >
      {/* Panel */}
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ duration: 0.32, ease: EASE }}
        className="relative w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-card-xl"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-xl text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Step indicator */}
        <div className="mb-8 flex justify-center">
          <StepIndicator step={step} />
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <StepWelcome onNext={() => setStep(2)} />
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <StepOptions onClose={onClose} onCreated={onCreated} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
