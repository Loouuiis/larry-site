import "@/styles/landing-v3.css";
import { LandingNavbar } from "@/components/landing-v3/Navbar";
import { HeroHead } from "@/components/landing-v3/HeroHead";
import { SituationRoom, DropPanel } from "@/components/landing-v3/SituationRoom";
import { WhatLarryDoes } from "@/components/landing-v3/WhatLarryDoes";
import { BeforeAfter } from "@/components/landing-v3/BeforeAfter";
import { CTA } from "@/components/landing-v3/CTA";
import { LandingFooter } from "@/components/landing-v3/Footer";

export default function Home() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--page-bg)",
        color: "var(--text-1)",
        backgroundImage: `
          radial-gradient(ellipse 80% 40% at 50% -5%, rgba(139,92,246,0.09), transparent 70%),
          radial-gradient(ellipse 60% 30% at 50% 100%, rgba(108,68,246,0.05), transparent 70%)
        `,
      }}
    >
      <LandingNavbar />
      <main
        className="relative mx-auto grid gap-8"
        style={{
          maxWidth: 1240,
          minHeight: "calc(100vh - 68px)",
          padding: "56px 28px 40px",
          gridTemplateRows: "auto 1fr auto",
        }}
      >
        <HeroHead />
        <SituationRoom />
        <DropPanel />
      </main>
      <WhatLarryDoes />
      <BeforeAfter />
      <CTA />
      <LandingFooter />
    </div>
  );
}
