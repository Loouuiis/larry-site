"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsSubnav } from "../SettingsSubnav";

interface PolicySettings {
  autoExecuteLowImpact: boolean;
  lowImpactMinConfidence: number;
  mediumImpactMinConfidence: number;
}

interface LarryRule {
  id: string;
  title: string;
  description: string;
  ruleType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULTS: PolicySettings = {
  autoExecuteLowImpact: true,
  lowImpactMinConfidence: 0.75,
  mediumImpactMinConfidence: 0.9,
};

export default function LarrySettingsPage() {
  const [settings, setSettings] = useState<PolicySettings>(DEFAULTS);
  const [rules, setRules] = useState<LarryRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [newRule, setNewRule] = useState({ title: "", description: "", ruleType: "behavioral" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    fetch("/api/workspace/settings/policy")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        setSettings({
          autoExecuteLowImpact: data.autoExecuteLowImpact ?? DEFAULTS.autoExecuteLowImpact,
          lowImpactMinConfidence: data.lowImpactMinConfidence ?? DEFAULTS.lowImpactMinConfidence,
          mediumImpactMinConfidence: data.mediumImpactMinConfidence ?? DEFAULTS.mediumImpactMinConfidence,
        });
      })
      .catch(() => showToast("Failed to load policy settings", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/settings/rules", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load rules");
      const data = await res.json();
      setRules(Array.isArray(data.items) ? data.items : []);
    } catch {
      showToast("Failed to load Larry rules", "error");
    } finally {
      setRulesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/settings/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const data = await res.json();
      setSettings({
        autoExecuteLowImpact: data.autoExecuteLowImpact,
        lowImpactMinConfidence: data.lowImpactMinConfidence,
        mediumImpactMinConfidence: data.mediumImpactMinConfidence,
      });
      showToast("Settings saved", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const pct = (v: number) => Math.round(v * 100);

  const saveRule = useCallback(
    async (rule: LarryRule, patch: Partial<Pick<LarryRule, "title" | "description" | "isActive">>) => {
      setSavingRuleId(rule.id);
      try {
        const res = await fetch(`/api/workspace/settings/rules/${rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to save rule");
        }

        const updated = await res.json();
        setRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast("Rule updated", "success");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save rule";
        showToast(message, "error");
      } finally {
        setSavingRuleId(null);
      }
    },
    [showToast]
  );

  const createRule = useCallback(async () => {
    if (!newRule.title.trim() || !newRule.description.trim()) {
      showToast("Title and description are required", "error");
      return;
    }

    setSavingRuleId("new");
    try {
      const res = await fetch("/api/workspace/settings/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRule.title,
          description: newRule.description,
          ruleType: newRule.ruleType,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to create rule");
      }

      const created = await res.json();
      setRules((current) => [created, ...current]);
      setNewRule({ title: "", description: "", ruleType: "behavioral" });
      setNewRuleOpen(false);
      showToast("Rule added", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create rule";
      showToast(message, "error");
    } finally {
      setSavingRuleId(null);
    }
  }, [newRule, showToast]);

  const deleteRule = useCallback(
    async (ruleId: string) => {
      setSavingRuleId(ruleId);
      try {
        const res = await fetch(`/api/workspace/settings/rules/${ruleId}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to delete rule");
        }
        setRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, isActive: false } : rule)));
        showToast("Rule archived", "success");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete rule";
        showToast(message, "error");
      } finally {
        setSavingRuleId(null);
      }
    },
    [showToast]
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-bold" style={{ color: "var(--text-1)" }}>
        Settings
      </h1>
      <SettingsSubnav active="larry" />

      <div className="mt-8">
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>
          Larry Autonomy
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Control how much autonomy Larry has when executing actions on your behalf.
        </p>
      </div>

      {loading ? (
        <div className="mt-8 text-[13px]" style={{ color: "var(--text-2)" }}>
          Loading...
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Auto-execute toggle */}
          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                  Auto-execute low-risk actions
                </label>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
                  When enabled, Larry will automatically execute low-impact actions that meet the
                  confidence threshold without waiting for approval.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoExecuteLowImpact}
                onClick={() =>
                  setSettings((s) => ({ ...s, autoExecuteLowImpact: !s.autoExecuteLowImpact }))
                }
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{
                  backgroundColor: settings.autoExecuteLowImpact ? "var(--cta)" : "var(--border)",
                }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-sm transition-transform"
                  style={{
                    transform: settings.autoExecuteLowImpact
                      ? "translateX(20px)"
                      : "translateX(0px)",
                    backgroundColor: "white",
                  }}
                />
              </button>
            </div>
          </div>

          {/* Low impact confidence */}
          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              Low impact minimum confidence
            </label>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
              Minimum confidence level required before Larry acts on low-impact items.
            </p>
            <div className="mt-3 flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={pct(settings.lowImpactMinConfidence)}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    lowImpactMinConfidence: Number(e.target.value) / 100,
                  }))
                }
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                style={{ accentColor: "var(--cta)", background: "var(--border)" }}
              />
              <span
                className="min-w-[3rem] text-right text-[13px] font-semibold"
                style={{ color: "var(--text-1)" }}
              >
                {pct(settings.lowImpactMinConfidence)}%
              </span>
            </div>
          </div>

          {/* Medium impact confidence */}
          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              Medium impact minimum confidence
            </label>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
              Minimum confidence level required before Larry acts on medium-impact items.
            </p>
            <div className="mt-3 flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={pct(settings.mediumImpactMinConfidence)}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    mediumImpactMinConfidence: Number(e.target.value) / 100,
                  }))
                }
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                style={{ accentColor: "var(--cta)", background: "var(--border)" }}
              />
              <span
                className="min-w-[3rem] text-right text-[13px] font-semibold"
                style={{ color: "var(--text-1)" }}
              >
                {pct(settings.mediumImpactMinConfidence)}%
              </span>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full border px-5 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
              style={{
                borderColor: "var(--cta)",
                color: "white",
                backgroundColor: "var(--cta)",
              }}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>

          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                  Manual Larry rules
                </h3>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
                  Add custom behavior rules Larry must follow for your workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewRuleOpen((open) => !open)}
                className="rounded-full border px-3 py-1.5 text-[13px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                {newRuleOpen ? "Cancel" : "Add rule"}
              </button>
            </div>

            {newRuleOpen && (
              <div className="mt-4 space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
                <input
                  value={newRule.title}
                  onChange={(event) => setNewRule((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Rule title"
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                />
                <textarea
                  value={newRule.description}
                  onChange={(event) => setNewRule((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe what Larry should always/never do"
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={createRule}
                    disabled={savingRuleId === "new"}
                    className="rounded-full border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--cta)", background: "var(--cta)", color: "white" }}
                  >
                    {savingRuleId === "new" ? "Adding..." : "Save rule"}
                  </button>
                </div>
              </div>
            )}

            {rulesLoading ? (
              <p className="mt-4 text-[12px]" style={{ color: "var(--text-2)" }}>
                Loading rules...
              </p>
            ) : rules.length === 0 ? (
              <p className="mt-4 text-[12px]" style={{ color: "var(--text-2)" }}>
                No custom rules yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-lg border p-4"
                    style={{ borderColor: "var(--border)", opacity: rule.isActive ? 1 : 0.65 }}
                  >
                    <input
                      value={rule.title}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((item) =>
                            item.id === rule.id ? { ...item, title: event.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded-lg border px-3 py-2 text-[13px] font-semibold"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    />
                    <textarea
                      value={rule.description}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((item) =>
                            item.id === rule.id ? { ...item, description: event.target.value } : item
                          )
                        )
                      }
                      rows={2}
                      className="mt-2 w-full rounded-lg border px-3 py-2 text-[13px]"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={(event) =>
                            setRules((current) =>
                              current.map((item) =>
                                item.id === rule.id ? { ...item, isActive: event.target.checked } : item
                              )
                            )
                          }
                        />
                        Active
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void saveRule(rule, {
                              title: rule.title,
                              description: rule.description,
                              isActive: rule.isActive,
                            })
                          }
                          disabled={savingRuleId === rule.id}
                          className="rounded-full border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRule(rule.id)}
                          disabled={savingRuleId === rule.id}
                          className="rounded-full border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                          style={{ borderColor: "#ef4444", color: "#ef4444" }}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg border px-4 py-3 text-[13px] font-medium shadow-lg"
          style={{
            borderColor: toast.type === "success" ? "var(--cta)" : "#ef4444",
            backgroundColor: "var(--surface)",
            color: toast.type === "success" ? "var(--cta)" : "#ef4444",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
