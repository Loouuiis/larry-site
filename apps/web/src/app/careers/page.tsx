import "@/styles/landing-anna.css";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/landing-anna/Navbar";
import { WaitlistModal } from "@/components/landing-anna/WaitlistModal";
import { ReachOutForm } from "@/components/landing-anna/PageFormDemo";

export const metadata: Metadata = {
  title: "Larry — Join the team",
  description:
    "We look for exceptional engineers and brilliant people. Join the founding team and help shape the future of how work gets done.",
};

export default function CareersPage() {
  return (
    <div className="landing-anna reachpage-wrap">
      <Navbar basePath="/" />
      <main className="reachpage">
        <div className="reachpage__inner">
          <figure className="reachpage__art">
            <div className="reachpage__frame">
              <Image
                src="/tintoretto-miracle.webp"
                alt="Tintoretto — The Miracle of the Slave"
                width={750}
                height={500}
                priority
                style={{ width: "100%", height: "auto", display: "block" }}
              />
              <div className="reachpage__frame-glow" />
            </div>
            <figcaption className="reachpage__caption">
              Tintoretto, <em>The Miracle of the Slave</em> (1548) — build the next era of project execution.
            </figcaption>
          </figure>

          <div className="reachpage__col">
            <Link href="/" className="formpage__back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </Link>
            <div className="formpage__eyebrow">Careers</div>
            <h1>Join the team.</h1>
            <p className="reachpage__lede">
              We don&apos;t hire for fixed team roles. Instead, we look for{" "}
              <em>exceptional engineers and brilliant people</em> with a strong skillset and character.
            </p>
            <p className="reachpage__lede">
              Join the founding team and help <em>shape the future of how work gets done</em>.
            </p>

            <div className="reachpage__formcard">
              <div className="reachpage__formhd">Reach out</div>
              <ReachOutForm />
            </div>
          </div>
        </div>
      </main>
      <WaitlistModal />
    </div>
  );
}
