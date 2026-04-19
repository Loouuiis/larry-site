"use client";

import { useEffect } from "react";
import { installCsrfFetchPatch } from "@/lib/csrf";

// Install at module evaluation so the patch is in place BEFORE any
// nested client component's useEffect fires (React commits children
// before parents, so a root-layout useEffect would run too late).
if (typeof window !== "undefined") {
  installCsrfFetchPatch();
}

// Second installation via useEffect is redundant but belt-and-braces
// for React Fast Refresh / strict mode re-evals. installCsrfFetchPatch
// is idempotent.
export default function CsrfFetchInstaller() {
  useEffect(() => {
    installCsrfFetchPatch();
  }, []);
  return null;
}
