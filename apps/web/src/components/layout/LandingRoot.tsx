"use client";
import Image from "next/image";
import { useEffect } from "react";

export function LandingRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("landing-root");
    return () => document.body.classList.remove("landing-root");
  }, []);
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-50 overflow-hidden bg-white"
      >
        <Image
          src="/landing-bg-architecture.png"
          alt=""
          fill
          priority
          sizes="100vw"
          quality={80}
          className="object-cover opacity-50"
          style={{ objectPosition: "center" }}
        />
        <div className="absolute inset-0 bg-white/60" />
      </div>
      {children}
    </>
  );
}
