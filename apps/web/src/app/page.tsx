import "@/styles/landing-anna.css";
import "@/styles/landing-anna-mobile.css";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Navbar } from "@/components/landing-anna/Navbar";
import { WaitlistModal } from "@/components/landing-anna/WaitlistModal";
import { Footer } from "@/components/landing-anna/Footer";
import {
  HeroSection,
  MissionSection,
  CompareSection,
  HowItWorksSection,
  AudienceSection,
  CareersSlot,
  PricingSlot,
  ContactSection,
} from "@/components/landing-anna/sections";
import { MobileLanding } from "@/components/landing-anna/mobile/MobileLanding";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/workspace");

  return (
    <>
      {/* Desktop tree — hidden at ≤720px via .landing-anna-desktop CSS. */}
      <div className="landing-anna landing-anna-desktop">
        <Navbar />
        <HeroSection />
        <hr className="divider" />
        <MissionSection />
        <hr className="divider" />
        <CompareSection />
        <hr className="divider" />
        <HowItWorksSection />
        <hr className="divider" />
        <AudienceSection />
        <hr className="divider" />
        <CareersSlot />
        <hr className="divider" />
        <PricingSlot />
        <ContactSection />
        <Footer />
      </div>

      {/* Mobile tree — hidden above 720px via the same CSS file. */}
      <MobileLanding />

      {/* Shared waitlist modal — mobile.css turns it into a bottom sheet. */}
      <WaitlistModal />
    </>
  );
}
