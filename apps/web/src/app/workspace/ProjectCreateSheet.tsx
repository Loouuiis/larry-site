"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, LoaderCircle, X } from "lucide-react";

interface ProjectCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
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

export function ProjectCreateSheet({
  open,
  onClose,
  onCreated,
}: ProjectCreateSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setTargetDate("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate || undefined,
        }),
      });

      const payload = await readJson<{ id?: string; error?: string; message?: string }>(response);
      if (!response.ok || !payload.id) {
        // Fastify error bodies look like { statusCode, error: "Forbidden", message: "..." }
        // The human sentence lives in `message`; `error` is just the HTTP reason phrase.
        throw new Error(payload.message ?? payload.error ?? "Could not create project.");
      }

      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      onCreated(payload.id);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create project."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-[#040b12]/55 backdrop-blur-[3px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-[#dce5ef] bg-[#f6f8fb] shadow-[0_24px_80px_rgba(8,20,35,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
          >
            <div className="flex items-center justify-between border-b border-[#dce5ef] px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#73839a]">
                  New project
                </p>
                <h2
                  id="new-project-title"
                  className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#182332]"
                >
                  Start a live workspace
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d2dce7] bg-white text-[#4d5c70] transition-colors hover:border-[#b8c6d6] hover:text-[#182332]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-6 py-6">
              <div className="space-y-5">
                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                    Project name
                  </span>
                  <input
                    required
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-[#d2dce7] bg-white px-4 text-[15px] text-[#182332] outline-none transition-colors placeholder:text-[#8b99ab] focus:border-[#4aa3ff]"
                    placeholder="EMEA launch readiness"
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                    Short brief
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                    className="mt-2 w-full rounded-[22px] border border-[#d2dce7] bg-white px-4 py-3 text-[15px] text-[#182332] outline-none transition-colors placeholder:text-[#8b99ab] focus:border-[#4aa3ff]"
                    placeholder="What does Larry need to keep moving, and what should the team see first?"
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                    Target date
                  </span>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-[#d2dce7] bg-white px-4 text-[15px] text-[#182332] outline-none transition-colors focus:border-[#4aa3ff]"
                  />
                </label>
              </div>

              <div className="mt-6 rounded-[24px] border border-[#d2dce7] bg-white p-5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#73839a]">
                  What happens next
                </p>
                <p className="mt-3 text-[14px] leading-7 text-[#4b5a6f]">
                  Larry creates the project immediately, then the workspace can start receiving tasks, meeting notes, and approval-driven actions.
                </p>
              </div>

              <div className="mt-auto pt-6">
                {error && (
                  <p aria-live="polite" className="mb-4 text-[13px] text-[#b42336]">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-[#cfd9e4] bg-white px-5 text-[14px] font-semibold text-[#304153] transition-colors hover:border-[#b6c6d6] hover:text-[#182332]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || name.trim().length < 2}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--cta)] px-5 text-[14px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
                    Create project
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
