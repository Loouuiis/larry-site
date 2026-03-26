"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";

const TEAM_SIZE_OPTIONS = [
  "1-10",
  "11-25",
  "26-50",
  "51-100",
  "100+",
];

interface FormState {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  teamSize: string;
  launchContext: string;
}

const INITIAL_STATE: FormState = {
  companyName: "",
  requesterName: "",
  requesterEmail: "",
  teamSize: TEAM_SIZE_OPTIONS[1],
  launchContext: "",
};

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.length > 0) {
    return record.error;
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  return fallback;
}

export function RequestAccessForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    requesterName: string;
    companyName: string;
  } | null>(null);

  const disabled = useMemo(
    () =>
      busy ||
      form.companyName.trim().length < 2 ||
      form.requesterName.trim().length < 2 ||
      form.requesterEmail.trim().length < 5,
    [busy, form]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/orgs/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          requesterName: form.requesterName.trim(),
          requesterEmail: form.requesterEmail.trim(),
          teamSize: form.teamSize,
          launchContext: form.launchContext.trim(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok && response.status !== 202) {
        throw new Error(extractMessage(payload, "Could not request access."));
      }

      setSuccess({
        requesterName: form.requesterName.trim(),
        companyName: form.companyName.trim(),
      });
      setForm(INITIAL_STATE);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not request access."
      );
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div
        aria-live="polite"
        className="rounded-[28px] border border-[#1f394d] bg-[#0c1d2b] p-6 text-[#f2f6fb]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#123149] text-[#8bd2ff]">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">
          Access request received
        </h3>
        <p className="mt-3 text-[15px] leading-7 text-[#c8d7e5]">
          {success.requesterName}, we have queued {success.companyName} for review. Larry PM can now approve the workspace from the admin flow and hand back credentials without re-entering anything.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#274862] px-4 py-2 text-[13px] font-medium text-[#f2f6fb] transition-colors hover:border-[#3a5e7a] hover:bg-[#10273a]"
        >
          Submit another request
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <form
      id="request-access"
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-[#1b3143] bg-[#081521]/95 p-6 shadow-[0_24px_80px_rgba(3,10,18,0.45)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7c97af]">
            Request access
          </p>
          <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#f2f6fb]">
            Bring Larry into a live programme.
          </h3>
        </div>
        <div className="rounded-full border border-[#28445a] bg-[#0e2232] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#9ab7ce]">
          Human-reviewed
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-medium text-[#9ab7ce]">Company</span>
          <input
            required
            value={form.companyName}
            onChange={(event) =>
              setForm((current) => ({ ...current, companyName: event.target.value }))
            }
            className="mt-2 h-12 w-full rounded-2xl border border-[#1b3143] bg-[#0d1d2a] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#617488] focus:border-[#4aa3ff]"
            placeholder="Acme Operations"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-[#9ab7ce]">Your name</span>
          <input
            required
            value={form.requesterName}
            onChange={(event) =>
              setForm((current) => ({ ...current, requesterName: event.target.value }))
            }
            className="mt-2 h-12 w-full rounded-2xl border border-[#1b3143] bg-[#0d1d2a] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#617488] focus:border-[#4aa3ff]"
            placeholder="Morgan Lee"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-[#9ab7ce]">Work email</span>
          <input
            required
            type="email"
            value={form.requesterEmail}
            onChange={(event) =>
              setForm((current) => ({ ...current, requesterEmail: event.target.value }))
            }
            className="mt-2 h-12 w-full rounded-2xl border border-[#1b3143] bg-[#0d1d2a] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#617488] focus:border-[#4aa3ff]"
            placeholder="morgan@acme.com"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-[#9ab7ce]">Team size</span>
          <select
            value={form.teamSize}
            onChange={(event) =>
              setForm((current) => ({ ...current, teamSize: event.target.value }))
            }
            className="mt-2 h-12 w-full rounded-2xl border border-[#1b3143] bg-[#0d1d2a] px-4 text-[15px] text-white outline-none transition-colors focus:border-[#4aa3ff]"
          >
            {TEAM_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-[12px] font-medium text-[#9ab7ce]">
          What should Larry unblock first?
        </span>
        <textarea
          value={form.launchContext}
          onChange={(event) =>
            setForm((current) => ({ ...current, launchContext: event.target.value }))
          }
          rows={5}
          className="mt-2 w-full rounded-[22px] border border-[#1b3143] bg-[#0d1d2a] px-4 py-3 text-[15px] text-white outline-none transition-colors placeholder:text-[#617488] focus:border-[#4aa3ff]"
          placeholder="Missed follow-ups after weekly meetings, status drift between Slack and the board, and approvals getting lost in email."
        />
      </label>

      {error && (
        <p aria-live="polite" className="mt-4 text-[13px] text-[#ffb7c2]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-[13px] leading-6 text-[#8ea4b8]">
          Larry only asks for enough context to provision a workspace and create the first admin login. No synthetic waitlist.
        </p>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[#4aa3ff] px-5 text-[14px] font-semibold text-[#04101c] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
          Request access
          <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
