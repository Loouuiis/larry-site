"use client";

import { useState } from "react";
import { Bot, GitBranch, Loader2, Send, Sparkles, X } from "lucide-react";
import type { Timeline2RunAiEvent } from "@/hooks/useTimeline2";

export function Timeline2AiPanel({
  open,
  busy,
  onClose,
  onRun,
}: {
  projectId: string;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onRun: (message: string, onEvent: (event: Timeline2RunAiEvent) => void) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<Array<{ role: "user" | "assistant" | "trace"; content: string; label?: string }>>([]);
  if (!open) return null;

  async function submit(messageOverride?: string) {
    const message = (messageOverride ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setLog((prev) => [...prev, { role: "user", content: message }]);
    await onRun(message, (event) => {
      if (event.type === "token" && event.delta) {
        setLog((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.label) {
            last.content += event.delta;
          } else {
            next.push({ role: "assistant", content: event.delta ?? "" });
          }
          return next;
        });
      }
      if (event.type === "trace" && event.trace) {
        setLog((prev) => [...prev, { role: "trace", label: "Trace", content: event.trace ?? "" }]);
      }
      if ((event.type === "tool_start" || event.type === "tool_done") && event.toolName) {
        const prefix = event.type === "tool_start" ? "Running" : "Result";
        setLog((prev) => [
          ...prev,
          {
            role: "trace",
            label: `${prefix}: ${event.toolName}`,
            content: event.summary ?? event.toolName ?? "",
          },
        ]);
      }
      if (event.type === "question" && event.question) {
        const text = event.questionContext
          ? `${event.question}\n\n${event.questionContext}`
          : event.question;
        setLog((prev) => [...prev, { role: "assistant", content: text }]);
      }
      if (event.type === "analysis_summary" && event.summary) {
        setLog((prev) => [...prev, { role: "assistant", content: event.summary ?? "" }]);
      }
      if (event.type === "branch_created" && event.branch) {
        const branch = event.branch;
        setLog((prev) => [...prev, { role: "assistant", content: `Created branch: ${branch.title}` }]);
      }
      if (event.type === "error") {
        setLog((prev) => [...prev, { role: "assistant", content: event.message ?? "Timeline 2 AI failed." }]);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(17, 23, 44, 0.32)" }}>
      <div className="flex h-full w-full max-w-[470px] flex-col bg-white shadow-2xl">
        <div className="relative overflow-hidden border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="absolute right-0 top-0 h-24 w-40 rounded-bl-full bg-[#8b5cf6]/10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg shadow-purple-200" style={{ background: "linear-gradient(135deg, #7c3aed, #b078ff)" }}>
                <Bot size={18} />
              </span>
              <div>
                <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Timeline 2 AI 2</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Structured planner with reviewable branches</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--surface-2)]">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {log.length === 0 && (
            <div className="rounded-[24px] border p-4" style={{ borderColor: "#ddd6fe", background: "linear-gradient(135deg, #fbf8ff, #fff)" }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: "var(--cta)" }} />
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Ask for a reviewable branch</p>
              </div>
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                AI 2 inspects the current Timeline 2 plan through structured planning steps and stages proposed operations into an isolated branch for approval.
              </p>
              <div className="mt-4 space-y-2">
                {[
                  "Find blocked work and propose a recovery plan",
                  "Create a launch-readiness workstream with QA and stakeholder tasks",
                  "Add milestones and dependencies for the critical path",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submit(prompt)}
                    className="flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left text-[12px] font-semibold hover:bg-[#fbf8ff]"
                    style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                  >
                    <GitBranch size={13} style={{ color: "var(--cta)" }} />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {log.map((item, index) => (
            <div
              key={index}
              className={`rounded-2xl px-4 py-3 text-[13px] leading-6 shadow-sm ${
                item.role === "user" ? "ml-8 text-white" : item.role === "trace" ? "mr-12" : "mr-8"
              }`}
              style={
                item.role === "user"
                  ? { background: "linear-gradient(135deg, #7c3aed, #9b5cf6)" }
                  : item.role === "trace"
                    ? { background: "#f6f5fb", color: "var(--text-2)", border: "1px solid #e8e2ff" }
                    : { background: "var(--surface-2)", color: "var(--text-1)" }
              }
            >
              {item.label ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">{item.label}</p> : null}
              {item.content || (busy && index === log.length - 1 ? "Thinking..." : "")}
            </div>
          ))}
          {busy && (log.length === 0 || log[log.length - 1]?.role === "user") ? (
            <div
              className="mr-8 rounded-2xl px-4 py-3 text-[13px] leading-6 shadow-sm"
              style={{ background: "var(--surface-2)", color: "var(--text-1)" }}
            >
              Thinking...
            </div>
          ) : null}
        </div>

        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2 rounded-2xl border bg-white p-1.5 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask Timeline 2 AI 2..."
              className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] outline-none"
            />
            <button disabled={busy || !input.trim()} onClick={() => void submit()} className="flex h-10 w-10 items-center justify-center rounded-xl text-white disabled:opacity-50" style={{ background: "var(--cta)" }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
