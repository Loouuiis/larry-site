"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Check, Upload, ArrowRight } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

/* ─── Step dots ───────────────────────────────────────────────────── */

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

/* ─── Tile selector ───────────────────────────────────────────────── */

function TileSelector({
  options,
  selected,
  onToggle,
  max,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
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
            onClick={() => !isDisabled && onToggle(option)}
            disabled={isDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all duration-150"
            style={{
              borderColor: isSelected ? "var(--brand)" : "var(--border)",
              background: isSelected ? "var(--brand-soft, #f0edfa)" : "var(--surface)",
              color: isSelected ? "var(--brand)" : "var(--text-2)",
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            {isSelected && <Check size={14} />}
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

/* ─── Constants ───────────────────────────────────────────────────── */

const ROLES = [
  "Team member", "Manager", "Director",
  "Executive (e.g. VP or C-suite)", "Business Owner",
  "Freelancer", "Student", "Other", "Prefer not to say",
];

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

const TOTAL_STEPS = 8;

/* ─── Wizard ──────────────────────────────────────────────────────── */

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1: Account
  const [email, setEmail] = useState("");
  const [authMethod, setAuthMethod] = useState<"email" | null>(null);

  // Step 2: Profile
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [subscribeEmails, setSubscribeEmails] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Step 3-6: Profile questions
  const [roles, setRoles] = useState<string[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);

  // Step 7: Invite
  const [inviteEmails, setInviteEmails] = useState("");

  const toggleItem = useCallback((list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((v) => v !== item) : [...list, item]);
  }, []);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const next = () => {
    setError("");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const createAccount = async () => {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the terms to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword, fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      next();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    router.push("/workspace");
  };

  return (
    <div className="w-full max-w-md">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        {/* ── Step 0: Welcome ──────────────────────────────────── */}
        {step === 0 && (
          <div className="text-center space-y-5">
            <Image
              src="/Larryfulllogo.png"
              alt="Larry"
              width={180}
              height={72}
              className="mx-auto object-contain"
            />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-1)]">
              Welcome to Larry
            </h1>
            <p className="text-[14px] leading-6 text-[var(--text-2)]">
              I make your projects run themselves through automatic execution that aligns your team,
              timelines, and tasks — so you don&apos;t have to.
            </p>
            <button
              type="button"
              onClick={next}
              className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Get started
            </button>
            <p className="text-sm text-[var(--text-muted)]">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-[var(--brand)] underline underline-offset-2 hover:text-[var(--brand-hover)]">
                Log in
              </Link>
            </p>
          </div>
        )}

        {/* ── Step 1: Create account (email) ────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <Image src="/Larryfulllogo.png" alt="Larry" width={125} height={50} className="mx-auto object-contain mb-3" />
              <h2 className="text-lg font-bold text-[var(--text-1)]">Create your account</h2>
            </div>

            {!authMethod ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setAuthMethod("email")}
                  className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
                >
                  Sign up with email
                </button>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                  <span className="text-xs text-[var(--text-disabled)]">or</span>
                  <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
                <GoogleSignInButton label="Sign up with Google" />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="signup-email" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                    Email
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
                <button
                  type="button"
                  onClick={() => {
                    if (!email.includes("@")) {
                      setError("Please enter a valid email address.");
                      return;
                    }
                    setError("");
                    next();
                  }}
                  disabled={!email}
                  className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Profile + password ─────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">Set up your profile</h2>
            <p className="text-[13px] text-[var(--text-2)]">Tell Larry a bit about yourself.</p>

            <div>
              <label htmlFor="full-name" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Full name
              </label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className={INPUT_CLS}
                style={{ fontSize: "1rem" }}
              />
            </div>

            {/* Photo placeholder */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Profile photo <span className="text-[var(--text-disabled)]">(optional)</span>
              </label>
              <div
                className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer hover:border-[var(--brand)]"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-disabled)]">
                  <Upload size={16} />
                  <span>Upload photo</span>
                </div>
              </div>
            </div>

            {/* Password */}
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
              {/* Strength meter */}
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
              <p className="mt-1 text-[11px] text-[var(--text-disabled)]">
                Must be at least 8 characters with letters, numbers, and special characters.
              </p>
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm-pw" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm-pw"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${INPUT_CLS} pr-11`}
                  style={{ fontSize: "1rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: "var(--text-disabled)" }}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: passwordsMatch ? "#6c44f6" : "#9a7fa7" }}>
                  {passwordsMatch && <Check size={12} />}
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {/* Checkboxes */}
            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={subscribeEmails}
                  onChange={(e) => setSubscribeEmails(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--brand)]"
                />
                <span className="text-[12px] leading-5 text-[var(--text-2)]">
                  Subscribe to emails about new feature updates, improvements and tips to get the most out of Larry
                </span>
              </label>
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
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={createAccount}
              disabled={loading || !agreedToTerms || password.length < 8 || password !== confirmPassword}
              className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </div>
        )}

        {/* ── Step 3: Role ────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">Tell Larry more about your work</h2>
            <p className="text-[13px] text-[var(--text-2)]">What&apos;s your role?</p>
            <TileSelector
              options={ROLES}
              selected={roles}
              onToggle={(v) => toggleItem(roles, v, setRoles)}
              max={1}
            />
            <button
              type="button"
              onClick={next}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 4: Work type ───────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">What kind of work do you do?</h2>
            <p className="text-[13px] text-[var(--text-2)]">Select up to 5.</p>
            <TileSelector
              options={WORK_TYPES}
              selected={workTypes}
              onToggle={(v) => toggleItem(workTypes, v, setWorkTypes)}
              max={5}
            />
            <button
              type="button"
              onClick={next}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 5: Discovery ───────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">How did you hear about Larry?</h2>
            <TileSelector
              options={DISCOVERY_OPTIONS}
              selected={discovery}
              onToggle={(v) => toggleItem(discovery, v, setDiscovery)}
              max={3}
            />
            <button
              type="button"
              onClick={next}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 6: Tools ───────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">What tools do you use?</h2>
            <p className="text-[13px] text-[var(--text-2)]">Select all that apply.</p>
            <TileSelector
              options={TOOLS}
              selected={tools}
              onToggle={(v) => toggleItem(tools, v, setTools)}
            />
            <button
              type="button"
              onClick={next}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 7: Completion ──────────────────────────────── */}
        {step === 7 && (
          <div className="space-y-5 text-center">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "var(--brand-soft, #f0edfa)" }}
            >
              <Check size={28} style={{ color: "var(--brand)" }} />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-1)]">You&apos;re good to go!</h2>
            <p className="text-[14px] leading-6 text-[var(--text-2)]">
              Go ahead and explore Larry. Start by creating your first project.
            </p>
            <button
              type="button"
              onClick={finish}
              className="inline-flex h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta)] text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Go to Larry <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* Step dots — shown on all steps except welcome (0) and completion (7) */}
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <StepDots current={step - 1} total={TOTAL_STEPS - 2} />
        )}
      </div>

      {step > 0 && step < TOTAL_STEPS - 1 && (
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          <Link href="/" className="transition-colors hover:text-[var(--text-2)]">
            {"<-"} Back to Larry
          </Link>
        </p>
      )}
    </div>
  );
}
