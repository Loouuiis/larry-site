import "@/styles/landing-anna.css";
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

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/workspace");

  return (
    <div className="landing-anna">
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
      <WaitlistModal />
    </div>
  );
}
