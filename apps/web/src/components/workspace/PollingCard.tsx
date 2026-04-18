"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";

// PollingCard captures optional Work type / Discovery / Tools data that the
// 3-step signup wizard (#86) intentionally skipped in favour of a <90s
// landing→Action Centre flow. Lives on /workspace home and disappears once
// the user either submits or dismisses. State persists in user_profiles.

const WORK_TYPES = [
  "Administrative", "Communications", "Creative & Design",
  "Customer Experience / Support", "Data or Analytics",
  "Education Professional", "Engineering", "Finance or Accounting",
  "Fundraising", "Healthcare Professional", "Human Resources / Recruiting",
  "Information Technology", "Legal", "Marketing", "Operations",
  "Product Management", "Professional Services",
  "Project or Program Management", "Research and Development",
  "Sales & CRM", "Other",
];

const DISCOVERY_OPTIONS = [
  "Friend / Colleague", "LinkedIn", "Facebook / Instagram",
  "AI Tools (ChatGPT, Perplexity, etc.)", "Search Engine (Google, Bing, etc.)",
  "Software Review Site", "Podcasts / Radio", "TikTok",
  "TV / Streaming (Hulu, NBC, etc.)", "YouTube", "Other",
];

const TOOLS = [
  "Jira", "Asana", "Monday.com", "ClickUp", "Trello",
  "Notion", "Linear", "Microsoft Planner", "Basecamp",
  "Smartsheet", "Wrike", "Google Sheets", "Excel",
  "Slack", "Microsoft Teams", "Other",
];

interface ProfileResponse {
  completedAt: string | null;
  dismissedAt: string | null;
}

function ChipGrid({
  options,
  selected,
  onToggle,
  max,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        const isDisabled = !isSelected && max !== undefined && selected.length >= max;
        return (
          <button
            key={option}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onToggle(option)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-150"
            style={{
              borderColor: isSelected ? "var(--brand)" : "var(--border)",
              background: isSelected ? "var(--brand-soft, #f0edfa)" : "var(--surface)",
              color: isSelected ? "var(--brand)" : "var(--text-2)",
              opacity: isDisabled ? 0.45 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            {isSelected && <Check size={12} />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function PollingCard() {
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { cache: "no-store" });
        if (!res.ok) {
          // 401 just means the card isn't relevant for this visitor.
          setLoaded(true);
          return;
        }
        const data = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        setVisible(!data.completedAt && !data.dismissedAt);
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    (list: string[], setList: (v: string[]) => void, item: string) => {
      setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
    },
    []
  );

  const submit = useCallback(async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workTypes, discovery, tools }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
        setSubmitting(false);
        return;
      }
      setVisible(false);
    } catch {
      setError("Network error.");
      setSubmitting(false);
    }
  }, [workTypes, discovery, tools]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    // Fire-and-forget — UI hides immediately, server persists dismissal
    // so the card doesn't reappear on next load.
    void fetch("/api/user/profile/dismiss", { method: "POST" });
  }, []);

  if (!loaded || !visible) return null;

  return (
    <div
      className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-disabled)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
      >
        <X size={16} />
      </button>

      <h3 className="text-base font-semibold text-[var(--text-1)]">
        Help us tune Larry for you
      </h3>
      <p className="mt-1 text-[13px] text-[var(--text-2)]">
        A few optional details so Larry can prioritise the right signals for your work.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-2)]">
            What kind of work do you do? <span className="text-[var(--text-disabled)]">(up to 5)</span>
          </p>
          <ChipGrid
            options={WORK_TYPES}
            selected={workTypes}
            onToggle={(v) => toggle(workTypes, setWorkTypes, v)}
            max={5}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-2)]">
            How did you hear about Larry? <span className="text-[var(--text-disabled)]">(up to 3)</span>
          </p>
          <ChipGrid
            options={DISCOVERY_OPTIONS}
            selected={discovery}
            onToggle={(v) => toggle(discovery, setDiscovery, v)}
            max={3}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-2)]">
            What tools does your team use?
          </p>
          <ChipGrid
            options={TOOLS}
            selected={tools}
            onToggle={(v) => toggle(tools, setTools, v)}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={
            submitting ||
            (workTypes.length === 0 && discovery.length === 0 && tools.length === 0)
          }
          className="inline-flex h-[2.25rem] items-center justify-center rounded-lg bg-[var(--cta)] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving…" : "Save and close"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-[12px] text-[var(--text-disabled)] transition-colors hover:text-[var(--text-2)]"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
