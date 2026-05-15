import "@/styles/landing-anna.css";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/landing-anna/Navbar";
import { WaitlistModal } from "@/components/landing-anna/WaitlistModal";
import { BookDemoForm } from "@/components/landing-anna/PageFormDemo";

export const metadata: Metadata = {
  title: "Larry — Book a demo",
  description: "Request a demo to see how Larry fits into your daily workflows.",
};

export default function BookDemoPage() {
  return (
    <div className="landing-anna">
      <Navbar basePath="/" />
      <main className="formpage">
        <div className="formpage__inner">
          <div className="formpage__copy">
            <Link href="/" className="formpage__back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </Link>
            <div className="formpage__eyebrow">Book a demo</div>
            <h1>
              Empower your team <span className="accent">with Larry.</span>
            </h1>
            <p className="formpage__lede">
              Request a demo to see how Larry fits into your daily workflows. Fill out the form and our team will get back to you shortly.
            </p>
          </div>

          <div className="formpage__card">
            <Suspense fallback={null}>
              <BookDemoForm />
            </Suspense>
          </div>
        </div>
      </main>
      <WaitlistModal />
    </div>
  );
}
