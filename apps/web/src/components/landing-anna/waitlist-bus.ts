"use client";

const OPEN_EVENT = "larry:open-waitlist";

export function openWaitlist() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onWaitlistOpen(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}
