"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Check, ArrowRight, Plus, X, CalendarCheck } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

/* ─── Step dots (3 steps, active widens) ──────────────────────────── */

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: i === current ? 24 : 8,
            background: i === current ? "var(--brand)" : i < current ? "var(--brand-soft, #f0edfa)" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Shared input class ──────────────────────────────────────────── */

const INPUT_CLS =
  "min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]";

const ROLES = [
  "Team member", "Manager", "Director",
  "Executive (e.g. VP or C-suite)", "Business Owner",
  "Freelancer", "Student", "Other", "Prefer not to say",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL_STEPS = 3;

/* ─── Tile selector (single-select role chip) ─────────────────────── */

function RoleChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(selected ? "" : option)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all duration-150"
            style={{
              borderColor: selected ? "var(--brand)" : "var(--border)",
              background: selected ? "var(--brand-soft, #f0edfa)" : "var(--surface)",
              color: selected ? "var(--brand)" : "var(--text-2)",
              cursor: "pointer",
            }}
          >
            {selected && <Check size={14} />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Password strength ───────────────────────────────────────────── */

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: "", color: "var(--border)", width: "0%" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return { label: "Weak", color: "#9a7fa7", width: "33%" };
  if (score <= 3) return { label: "Moderate", color: "#b29cf8", width: "66%" };
  return { label: "Strong", color: "#6c44f6", width: "100%" };
}

/* ─── Wizard ──────────────────────────────────────────────────────── */

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 0 — Account + role
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [subscribeEmails, setSubscribeEmails] = useState(true);

  // Step 1 — Workspace + invites
  const [orgName, setOrgName] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>(["", "", ""]);

  // Step 2 — First project + GCal
  const [projectName, setProjectName] = useState("");
  const [gcalConnected, setGcalConnected] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const step0Valid =
    EMAIL_RE.test(email) &&
    firstName.trim().length > 0 &&
    password.length >= 8 &&
    agreedToTerms;

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const defaultOrgName = firstName.trim() ? `${firstName.trim()}'s workspace` : "";

  /* ─── Step 0 submit: create account ───────────────────────────── */

  const submitStep0 = useCallback(async () => {
    setError("");
    if (!step0Valid) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: role || undefined,
          orgName: defaultOrgName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setOrgName(defaultOrgName || displayName || "");
      setStep(1);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [step0Valid, email, password, firstName, lastName, role, defaultOrgName, displayName]);

  /* ─── Step 1 submit: rename workspace + send invites ──────────── */

  const submitStep1 = useCallback(async () => {
    setError("");
    setLoading(true);

    try {
      // Rename tenant only if user changed the name. Fire-and-forget —
      // the signup already created a tenant; a failed rename leaves the
      // default name intact, which is acceptable.
      const finalOrgName = orgName.trim();
      if (finalOrgName && finalOrgName !== defaultOrgName) {
        void fetch("/api/workspace/tenant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: finalOrgName }),
        });
      }

      // Send invitations for each non-empty, valid email. Fire-and-forget;
      // errors show no blocking UI — we prioritise flow over capture.
      const validInvites = inviteEmails
        .map((e) => e.trim())
        .filter((e) => e.length > 0 && EMAIL_RE.test(e));

      validInvites.forEach((inviteEmail) => {
        void fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail }),
        });
      });

      setStep(2);
    } finally {
      setLoading(false);
    }
  }, [orgName, defaultOrgName, inviteEmails]);

  /* ─── Step 2 submit: create project + redirect ────────────────── */

  const submitStep2 = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const trimmed = projectName.trim();
      if (trimmed.length > 0) {
        const res = await fetch("/api/workspace/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Could not create your first project. Try again or skip for now.");
          setLoading(false);
          return;
        }
      }
      router.push("/workspace");
    } catch {
      setError("Network error. Please check your connection.");
      setLoading(false);
    }
  }, [projectName, router]);

  const skipToWorkspace = () => router.push("/workspace");

  /* ─── GCal connect popup ──────────────────────────────────────── */

  const connectGCal = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/workspace/connectors/calendar/install");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.installUrl) {
        setError(data?.error ?? "Could not start Google Calendar setup. Try again from Settings.");
        return;
      }
      const w = window.open(data.installUrl, "gcal-oauth", "width=520,height=620");
      if (!w) {
        setError("Popup blocked. You can connect Google Calendar later from Settings.");
        return;
      }
      const poll = window.setInterval(() => {
        if (w.closed) {
          window.clearInterval(poll);
          // We can't observe the popup's final URL cross-origin — closing
          // is the only signal. Optimistically mark connected; if the
          // user cancelled they can reconnect from Settings.
          setGcalConnected(true);
        }
      }, 500);
    } catch {
      setError("Network error connecting to Google Calendar.");
    }
  }, []);

  return (
    <div className="w-full max-w-md transition-all duration-300">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        {/* ── Step 0: Account + role ─────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <Image
                src="/Larryfulllogo.png"
                alt="Larry"
                width={140}
                height={56}
                className="mx-auto block object-contain mb-2"
              />
              <h1 className="text-lg font-bold text-[var(--text-1)]">Create your account</h1>
            </div>

            <GoogleSignInButton label="Sign up with Google" />

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              <span className="text-xs text-[var(--text-disabled)]">or sign up with email</span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Work email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={INPUT_CLS}
                style={{ fontSize: "1rem" }}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="first-name" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                  First name
                </label>
                <input
                  id="first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className={INPUT_CLS}
                  style={{ fontSize: "1rem" }}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="last-name" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                  Last name <span className="text-[var(--text-disabled)]">(optional)</span>
                </label>
                <input
                  id="last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className={INPUT_CLS}
                  style={{ fontSize: "1rem" }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className={`${INPUT_CLS} pr-11`}
                  style={{ fontSize: "1rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: "var(--text-disabled)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: passwordStrength.width, background: passwordStrength.color }}
                    />
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                What&apos;s your role? <span className="text-[var(--text-disabled)]">(optional)</span>
              </label>
              <RoleChips value={role} onChange={setRole} />
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--brand)]"
                />
                <span className="text-[12px] leading-5 text-[var(--text-2)]">
                  I agree to the Terms of Service and Privacy Policy
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={subscribeEmails}
                  onChange={(e) => setSubscribeEmails(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--brand)]"
                />
                <span className="text-[12px] leading-5 text-[var(--text-2)]">
                  Send me updates about new features and tips
                </span>
              </label>
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submitStep0}
              disabled={loading || !step0Valid}
              className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Continue"}
            </button>

            <p className="text-center text-sm text-[var(--text-muted)]">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-[var(--brand)] underline underline-offset-2 hover:text-[var(--brand-hover)]"
              >
                Log in
              </Link>
            </p>
          </div>
        )}

        {/* ── Step 1: Workspace + invites ─────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">Set up your workspace</h2>
            <p className="text-[13px] text-[var(--text-2)]">
              This is where Larry will manage your projects. You can rename it any time.
            </p>

            <div>
              <label htmlFor="org-name" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Workspace name
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Inc."
                className={INPUT_CLS}
                style={{ fontSize: "1rem" }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Invite teammates <span className="text-[var(--text-disabled)]">(optional)</span>
              </label>
              <div className="space-y-2">
                {inviteEmails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => {
                        const next = [...inviteEmails];
                        next[i] = e.target.value;
                        setInviteEmails(next);
                      }}
                      placeholder="teammate@company.com"
                      className={INPUT_CLS}
                      style={{ fontSize: "1rem" }}
                    />
                    {inviteEmails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInviteEmails(inviteEmails.filter((_, idx) => idx !== i));
                        }}
                        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-disabled)] hover:text-[var(--text-2)]"
                        aria-label={`Remove invite ${i + 1}`}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setInviteEmails([...inviteEmails, ""])}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--brand)] hover:text-[var(--brand-hover)]"
                >
                  <Plus size={14} /> Add another
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-disabled)]">
                We&apos;ll send them an invite link. You can invite more from Settings later.
              </p>
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submitStep1}
              disabled={loading}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50"
            >
              {loading ? "Saving…" : <>Continue <ArrowRight size={16} /></>}
            </button>
          </div>
        )}

        {/* ── Step 2: First project + GCal ────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">Start your first project</h2>
            <p className="text-[13px] text-[var(--text-2)]">
              Give Larry something to work on. You can add more projects from the workspace.
            </p>

            <div>
              <label htmlFor="project-name" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Project name
              </label>
              <input
                id="project-name"
                type="text"
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Website redesign"
                className={INPUT_CLS}
                style={{ fontSize: "1rem" }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Connect Google Calendar <span className="text-[var(--text-disabled)]">(recommended)</span>
              </label>
              <button
                type="button"
                onClick={connectGCal}
                disabled={gcalConnected}
                className="inline-flex h-[2.75rem] w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[0.9375rem] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface)] disabled:cursor-default disabled:opacity-100"
              >
                {gcalConnected ? (
                  <>
                    <Check size={16} style={{ color: "var(--brand)" }} />
                    Calendar connected
                  </>
                ) : (
                  <>
                    <CalendarCheck size={16} />
                    Connect Google Calendar
                  </>
                )}
              </button>
              <p className="mt-2 text-[11px] text-[var(--text-disabled)]">
                Lets Larry see meeting context so it can act on action items.
                Optional — you can connect later from Settings.
              </p>
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submitStep2}
              disabled={loading || projectName.trim().length === 0}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Starting…" : <>Go to Larry <ArrowRight size={16} /></>}
            </button>
            <button
              type="button"
              onClick={skipToWorkspace}
              className="block w-full text-center text-xs text-[var(--text-disabled)] transition-colors hover:text-[var(--text-2)]"
            >
              Skip for now →
            </button>
          </div>
        )}

        <StepDots current={step} total={TOTAL_STEPS} />
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        <Link href="/" className="transition-colors hover:text-[var(--text-2)]">
          {"<-"} Back to Larry
        </Link>
      </p>
    </div>
  );
}
