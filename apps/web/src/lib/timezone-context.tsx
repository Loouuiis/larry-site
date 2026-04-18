"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "larry:timezone";

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// Module-level accessor so non-React utility functions can read the timezone
// without needing hook access.
let _timezone: string = getBrowserTimezone();
export function getTimezone(): string { return _timezone; }

const TimezoneContext = createContext<string>(getBrowserTimezone());

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(() => {
    if (typeof window === "undefined") return getBrowserTimezone();
    return localStorage.getItem(STORAGE_KEY) ?? getBrowserTimezone();
  });

  useEffect(() => {
    _timezone = timezone;
  }, [timezone]);

  // Stay in sync when another tab or the General Settings page saves a new value.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        setTimezoneState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): string {
  return useContext(TimezoneContext);
}
