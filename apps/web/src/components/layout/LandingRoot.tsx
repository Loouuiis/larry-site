"use client";
import { useEffect } from "react";

export function LandingRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("landing-root");
    return () => document.body.classList.remove("landing-root");
  }, []);
  return <>{children}</>;
}
