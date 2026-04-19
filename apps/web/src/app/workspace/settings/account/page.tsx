"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SettingsSubnav } from "../SettingsSubnav";
import { resizeImageToDataUrl } from "@/lib/image";
import { SkeletonCard, SkeletonLine } from "@/components/PageState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    emailVerifiedAt: string | null;
    displayName: string | null;
    avatarUrl?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";

  let browser = "Unknown browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Firefox/")) browser = "Firefox";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} on ${os}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Password strength meter (reused from reset-password)
// ---------------------------------------------------------------------------

function PasswordStrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Number", pass: /[0-9]/.test(password) },
    { label: "Special character", pass: /[^a-zA-Z0-9]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const strength = password.length === 0 ? 0 : passed;

  const barColor =
    strength <= 1
      ? "var(--text-disabled)"
      : strength === 2
        ? "#e5a100"
        : strength === 3
          ? "#c78f00"
          : "#22c55e";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors duration-200"
            style={{
              backgroundColor: i <= strength ? barColor : "var(--border)",
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className="text-[11px] transition-colors duration-150"
            style={{ color: c.pass ? "#22c55e" : "var(--text-disabled)" }}
          >
            {c.pass ? "\u2713" : "\u2022"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input component (DRY)
// ---------------------------------------------------------------------------

function FormInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  showToggle,
  showPassword,
  onTogglePassword,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  showToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showToggle ? (showPassword ? "text" : "password") : type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 pr-11 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
          style={{ fontSize: "0.9375rem" }}
        />
        {showToggle && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-[13px] transition-colors"
            style={{ color: "var(--text-disabled)" }}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AccountSettingsPage() {
  // User info
  const [userEmail, setUserEmail] = useState<string>("");
  const [hasPassword, setHasPassword] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  // Avatar section
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Email section
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Sessions section
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [sessionsMsg, setSessionsMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load user info
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/profile");
        if (!res.ok) return;
        const data = (await res.json()) as MeResponse;
        setUserEmail(data.user.email);
        setEmailVerified(!!data.user.emailVerifiedAt);
        setAvatarUrl(data.user.avatarUrl ?? null);
        // If user has no password, the API doesn't expose that directly.
        // We'll assume they have one and handle the "no current password" case
        // gracefully from the API response.
      } catch {
        // silent
      } finally {
        setLoadingUser(false);
      }
    }
    void loadUser();
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      // silent
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // -----------------------------------------------------------------------
  // Password handlers
  // -----------------------------------------------------------------------
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPasswordLoading(true);
    try {
      const payload: Record<string, string> = { newPassword };
      if (currentPassword) {
        payload.currentPassword = currentPassword;
      }

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        // If the API says "Current password is required", user has a password
        if (
          data.error?.includes("Current password is required") ||
          data.message?.includes("Current password is required")
        ) {
          setHasPassword(true);
        }
        setPasswordMsg({
          type: "error",
          text: data.error ?? data.message ?? "Failed to change password.",
        });
        return;
      }

      setPasswordMsg({
        type: "success",
        text: data.message ?? "Password changed successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
    } catch {
      setPasswordMsg({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setPasswordLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Email handlers
  // -----------------------------------------------------------------------
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    setEmailLoading(true);

    try {
      const payload: Record<string, string> = { newEmail };
      if (emailPassword) {
        payload.password = emailPassword;
      }

      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailMsg({
          type: "error",
          text: data.error ?? data.message ?? "Failed to request email change.",
        });
        return;
      }

      setEmailMsg({
        type: "success",
        text:
          data.message ??
          "Check your new email for a confirmation link.",
      });
      setNewEmail("");
      setEmailPassword("");
      setEmailFormOpen(false);
    } catch {
      setEmailMsg({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setEmailLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Session handlers
  // -----------------------------------------------------------------------
  async function handleRevokeSession(sessionId: string) {
    setRevokingId(sessionId);
    setSessionsMsg(null);
    try {
      const res = await fetch(`/api/auth/sessions?id=${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setSessionsMsg({
          type: "error",
          text: data.error ?? "Failed to revoke session.",
        });
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionsMsg({ type: "success", text: "Session revoked." });
    } catch {
      setSessionsMsg({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAllOther() {
    setRevokingAll(true);
    setSessionsMsg(null);
    try {
      const res = await fetch("/api/auth/sessions", { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setSessionsMsg({
          type: "error",
          text: data.error ?? "Failed to revoke sessions.",
        });
        return;
      }

      setSessionsMsg({
        type: "success",
        text: "All other sessions have been logged out.",
      });
      // Reload sessions list
      await loadSessions();
    } catch {
      setSessionsMsg({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setRevokingAll(false);
    }
  }

  // -----------------------------------------------------------------------
  // Avatar handlers
  // -----------------------------------------------------------------------
  async function handleAvatarFile(file: File) {
    setAvatarMsg(null);
    setAvatarLoading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarMsg({ type: "error", text: data.error ?? "Failed to update photo." });
        return;
      }
      setAvatarUrl(dataUrl);
      setAvatarMsg({ type: "success", text: "Profile photo updated." });
    } catch {
      setAvatarMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAvatarLoading(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarMsg(null);
    setAvatarLoading(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarMsg({ type: "error", text: data.error ?? "Failed to remove photo." });
        return;
      }
      setAvatarUrl(null);
      setAvatarMsg({ type: "success", text: "Profile photo removed." });
    } catch {
      setAvatarMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAvatarLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1
        className="text-[22px] font-bold"
        style={{ color: "var(--text-1)" }}
      >
        Settings
      </h1>
      <SettingsSubnav active="account" />

      {loadingUser ? (
        <div className="mt-8 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* ============================================================= */}
          {/* PROFILE PHOTO SECTION                                          */}
          {/* ============================================================= */}
          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>
              Profile photo
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              This photo will appear in the sidebar and across the app
            </p>
            <div className="mt-4 flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-[72px] w-[72px] rounded-full object-cover"
                  style={{ border: "2px solid var(--border)" }}
                />
              ) : (
                <div
                  className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full text-[24px] font-semibold"
                  style={{ background: "#6c44f6", color: "#fff" }}
                >
                  {(userEmail?.split("@")[0] ?? "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={avatarLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-2)",
                      color: "var(--text-1)",
                      opacity: avatarLoading ? 0.6 : 1,
                    }}
                  >
                    {avatarLoading ? "Saving..." : "Change photo"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      disabled={avatarLoading}
                      onClick={handleRemoveAvatar}
                      className="rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--surface-2)",
                        color: "var(--text-2)",
                        opacity: avatarLoading ? 0.6 : 1,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {avatarMsg && (
                  <p
                    className="text-[12px]"
                    style={{ color: avatarMsg.type === "success" ? "#22c55e" : "var(--error)" }}
                  >
                    {avatarMsg.text}
                  </p>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* ============================================================= */}
          {/* PASSWORD SECTION                                               */}
          {/* ============================================================= */}
          <div
            className="rounded-lg border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              {hasPassword ? "Change password" : "Set a password"}
            </h2>
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--text-2)" }}
            >
              {hasPassword
                ? "Update your password — all other sessions will be logged out"
                : "Set a password for your account so you can log in with email and password"}
            </p>

            <form
              onSubmit={handleChangePassword}
              className="mt-4 space-y-3"
              noValidate
            >
              {hasPassword && (
                <FormInput
                  id="current-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  showToggle
                  showPassword={showCurrent}
                  onTogglePassword={() => setShowCurrent((v) => !v)}
                />
              )}

              <FormInput
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
                autoComplete="new-password"
                showToggle
                showPassword={showNew}
                onTogglePassword={() => setShowNew((v) => !v)}
              />
              <PasswordStrengthMeter password={newPassword} />

              <FormInput
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm new password"
                autoComplete="new-password"
                showToggle
                showPassword={showConfirm}
                onTogglePassword={() => setShowConfirm((v) => !v)}
              />

              {passwordMsg && (
                <p
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    borderColor:
                      passwordMsg.type === "success"
                        ? "var(--cta)"
                        : "#ef4444",
                    color:
                      passwordMsg.type === "success"
                        ? "var(--cta)"
                        : "#ef4444",
                    background: "var(--surface-2)",
                  }}
                >
                  {passwordMsg.text}
                </p>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={passwordLoading || !newPassword || !confirmPassword}
                  className="rounded-full border px-5 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    borderColor: "var(--cta)",
                    color: "white",
                    backgroundColor: "var(--cta)",
                  }}
                >
                  {passwordLoading
                    ? "Saving..."
                    : hasPassword
                      ? "Change password"
                      : "Set password"}
                </button>
              </div>
            </form>
          </div>

          {/* ============================================================= */}
          {/* EMAIL SECTION                                                  */}
          {/* ============================================================= */}
          <div
            className="rounded-lg border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              Email address
            </h2>
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--text-2)" }}
            >
              Your current email is{" "}
              <span className="font-medium" style={{ color: "var(--text-1)" }}>
                {userEmail}
              </span>
              {emailVerified && (
                <span
                  className="ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background:
                      "color-mix(in srgb, #22c55e 12%, var(--surface))",
                    color: "#22c55e",
                  }}
                >
                  Verified
                </span>
              )}
            </p>

            {emailFormOpen ? (
              <form
                onSubmit={handleChangeEmail}
                className="mt-4 space-y-3"
                noValidate
              >
                <FormInput
                  id="new-email"
                  label="New email address"
                  type="email"
                  value={newEmail}
                  onChange={setNewEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                />

                {hasPassword && (
                  <FormInput
                    id="email-password"
                    label="Password"
                    value={emailPassword}
                    onChange={setEmailPassword}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    showToggle
                    showPassword={false}
                    onTogglePassword={() => {}}
                  />
                )}

                {emailMsg && (
                  <p
                    className="rounded-lg border px-4 py-3 text-sm"
                    style={{
                      borderColor:
                        emailMsg.type === "success"
                          ? "var(--cta)"
                          : "#ef4444",
                      color:
                        emailMsg.type === "success"
                          ? "var(--cta)"
                          : "#ef4444",
                      background: "var(--surface-2)",
                    }}
                  >
                    {emailMsg.text}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={emailLoading || !newEmail}
                    className="rounded-full border px-5 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
                    style={{
                      borderColor: "var(--cta)",
                      color: "white",
                      backgroundColor: "var(--cta)",
                    }}
                  >
                    {emailLoading ? "Sending..." : "Send confirmation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailFormOpen(false);
                      setEmailMsg(null);
                    }}
                    className="rounded-full border px-5 py-1.5 text-[13px] font-semibold"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--text-2)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEmailFormOpen(true)}
                  className="rounded-full border px-5 py-1.5 text-[13px] font-semibold"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  Change email
                </button>
                {emailMsg && (
                  <p
                    className="text-sm"
                    style={{
                      color:
                        emailMsg.type === "success"
                          ? "var(--cta)"
                          : "#ef4444",
                    }}
                  >
                    {emailMsg.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ============================================================= */}
          {/* SESSIONS SECTION                                               */}
          {/* ============================================================= */}
          <div
            className="rounded-lg border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              Active sessions
            </h2>
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--text-2)" }}
            >
              Devices where you are currently logged in
            </p>

            {sessionsLoading ? (
              <div className="mt-4">
                <SkeletonLine width="100%" height={48} borderRadius="8px" />
              </div>
            ) : sessions.length === 0 ? (
              <p
                className="mt-4 text-[12px]"
                style={{ color: "var(--text-2)" }}
              >
                No active sessions found.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[13px] font-medium"
                        style={{ color: "var(--text-1)" }}
                      >
                        {parseUserAgent(session.userAgent)}
                      </p>
                      <p
                        className="mt-0.5 text-[12px]"
                        style={{ color: "var(--text-2)" }}
                      >
                        {session.ipAddress ?? "Unknown IP"} &middot;{" "}
                        {formatDate(session.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(session.id)}
                      disabled={revokingId === session.id}
                      className="ml-3 shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
                      style={{
                        borderColor: "#ef4444",
                        color: "#ef4444",
                      }}
                    >
                      {revokingId === session.id ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {sessionsMsg && (
              <p
                className="mt-3 rounded-lg border px-4 py-3 text-sm"
                style={{
                  borderColor:
                    sessionsMsg.type === "success"
                      ? "var(--cta)"
                      : "#ef4444",
                  color:
                    sessionsMsg.type === "success"
                      ? "var(--cta)"
                      : "#ef4444",
                  background: "var(--surface-2)",
                }}
              >
                {sessionsMsg.text}
              </p>
            )}

            {sessions.length > 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleRevokeAllOther}
                  disabled={revokingAll}
                  className="rounded-full border px-5 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    borderColor: "#ef4444",
                    color: "#ef4444",
                  }}
                >
                  {revokingAll
                    ? "Logging out..."
                    : "Log out all other sessions"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
