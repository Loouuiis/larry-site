"use client";

import { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Field = "firstName" | "lastName" | "company" | "email" | "phone";

interface FormState {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
}

const INITIAL: FormState = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
};

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Input component ─────────────────────────────────────────────────────────

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  inputMode,
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium tracking-wide text-neutral-500 uppercase">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        className={[
          "w-full rounded-xl px-4 py-3 text-neutral-900 outline-none",
          "min-h-[44px]",
          "bg-white/30 backdrop-blur-sm",
          "border border-white/50",
          "placeholder:text-neutral-400",
          "transition-all duration-200",
          "focus:bg-white/50 focus:border-white/70 focus:ring-1 focus:ring-white/40",
          error
            ? "border-red-300/60 focus:border-red-400/60 focus:ring-red-200/40"
            : "",
        ].join(" ")}
        // Explicit 16px prevents iOS Safari auto-zoom on focus;
        // text-sm (14px) would trigger the zoom without this override.
        style={{ fontSize: "1rem" }}
      />
      <AnimatePresence mode="popLayout">
        {error && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18 }}
            className="text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Validate ────────────────────────────────────────────────────────────────

function validate(form: FormState): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.firstName.trim()) errors.firstName = "Required";
  if (!form.lastName.trim()) errors.lastName = "Required";
  if (!form.company.trim()) errors.company = "Required";
  if (!form.email.trim()) errors.email = "Required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email";
  if (!form.phone.trim()) errors.phone = "Required";
  else if (!/^[+\d][\d\s\-().]{6,20}$/.test(form.phone.trim())) errors.phone = "Invalid phone number";
  return errors;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WaitlistForm() {
  const uid = useId();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");

  const set = (field: Field) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setStatus("submitting");
    setServerError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      setStatus("success");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  // ── Success state ──
  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-col items-center justify-center gap-6 py-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2e7d4f]/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 13L9 17L19 7" stroke="#2e7d4f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">You&apos;re on the list.</p>
          <p className="mt-1.5 text-sm text-neutral-500">
            We&apos;ll be in touch with early access details.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Name row — single column on xs to prevent cramped inputs on 320px screens */}
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-2">
        <Field
          id={`${uid}-fn`}
          label="First name"
          value={form.firstName}
          onChange={set("firstName")}
          error={errors.firstName}
          autoComplete="given-name"
        />
        <Field
          id={`${uid}-ln`}
          label="Last name"
          value={form.lastName}
          onChange={set("lastName")}
          error={errors.lastName}
          autoComplete="family-name"
        />
      </div>

      <Field
        id={`${uid}-co`}
        label="Company"
        value={form.company}
        onChange={set("company")}
        error={errors.company}
        autoComplete="organization"
      />

      <Field
        id={`${uid}-email`}
        label="Work email"
        type="email"
        value={form.email}
        onChange={set("email")}
        error={errors.email}
        autoComplete="email"
        inputMode="email"
      />

      <Field
        id={`${uid}-phone`}
        label="Phone number"
        type="tel"
        value={form.phone}
        onChange={set("phone")}
        error={errors.phone}
        autoComplete="tel"
        inputMode="tel"
        placeholder="+44 7700 900000"
      />

      {/* Server error */}
      <AnimatePresence mode="popLayout">
        {serverError && (
          <motion.p
            key="server-err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-500"
          >
            {serverError}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "submitting"}
        className={[
          "w-full rounded-full py-3.5 text-sm font-medium",
          "min-h-[44px]",
          "transition-all duration-200",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          "border border-neutral-900/70 bg-transparent text-neutral-900",
          "hover:bg-neutral-900/85 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
        ].join(" ")}
      >
        {status === "submitting" ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting…
          </span>
        ) : (
          "Join the Waitlist"
        )}
      </button>

      <p className="text-center text-[11px] text-neutral-400">
        No spam. Early access only. Unsubscribe any time.
      </p>
    </form>
  );
}
