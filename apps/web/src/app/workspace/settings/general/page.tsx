"use client";

import { useEffect, useState } from "react";
import { SettingsSubnav } from "../SettingsSubnav";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Oslo",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Cairo",
];

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export default function GeneralSettingsPage() {
  const [timezone, setTimezone] = useState<string>("UTC");
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [timezoneEditing, setTimezoneEditing] = useState(false);
  const [timezoneTemp, setTimezoneTemp] = useState<string>("UTC");

  useEffect(() => {
    const stored = localStorage.getItem("larry:timezone");
    const resolved = stored ?? getLocalTimezone();
    setTimezone(resolved);
    setTimezoneTemp(resolved);
  }, []);

  function handleSaveTimezone() {
    localStorage.setItem("larry:timezone", timezoneTemp);
    // Notify the TimezoneContext in the same tab (storage events don't fire for same-tab writes).
    window.dispatchEvent(new StorageEvent("storage", { key: "larry:timezone", newValue: timezoneTemp }));
    setTimezone(timezoneTemp);
    setTimezoneEditing(false);
    setTimezoneSaved(true);
    setTimeout(() => setTimezoneSaved(false), 2500);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px 32px",
        }}
      >
        <h1 className="text-h1">Settings</h1>
        <p className="text-body-sm" style={{ marginTop: "4px" }}>
          Manage your workspace preferences
        </p>
        <SettingsSubnav active="general" />
      </div>

      <div
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            background: "var(--surface)",
          }}
        >
          <h2 className="text-h2">Workspace Settings</h2>
          <p className="text-body-sm" style={{ marginTop: "4px" }}>
            Configure your workspace preferences
          </p>
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Workspace name */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                  Workspace name
                </p>
                <p className="text-body-sm">Larry Workspace</p>
              </div>
              <button className="pm-btn pm-btn-secondary pm-btn-sm">Edit</button>
            </div>

            {/* Timezone */}
            <div
              style={{
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                    Timezone
                  </p>
                  <p className="text-body-sm">{timezone}</p>
                </div>
                {!timezoneEditing && (
                  <button
                    className="pm-btn pm-btn-secondary pm-btn-sm"
                    onClick={() => { setTimezoneTemp(timezone); setTimezoneEditing(true); }}
                  >
                    Change
                  </button>
                )}
              </div>
              {timezoneEditing && (
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <select
                    value={timezoneTemp}
                    onChange={(e) => setTimezoneTemp(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      padding: "8px 10px",
                      fontSize: "13px",
                      color: "var(--text-1)",
                    }}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <button
                    className="pm-btn pm-btn-primary pm-btn-sm"
                    onClick={handleSaveTimezone}
                  >
                    Save
                  </button>
                  <button
                    className="pm-btn pm-btn-secondary pm-btn-sm"
                    onClick={() => setTimezoneEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {timezoneSaved && (
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#166534" }}>Timezone updated</p>
              )}
            </div>

            {/* Notification preferences */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                  Notification preferences
                </p>
                <p className="text-body-sm">Email notifications for approvals</p>
              </div>
              <button className="pm-btn pm-btn-secondary pm-btn-sm">Configure</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
