import { HeroSection } from "@/components/sections/HeroSection";
import { MissionSection } from "@/components/sections/MissionSection";
import { LogoBar } from "@/components/sections/LogoBar";
import { ClientLogos } from "@/components/sections/ClientLogos";
import { ComparisonSection } from "@/components/sections/ComparisonSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { VibeSection } from "@/components/sections/VibeSection";
import { TemplatesSection } from "@/components/sections/TemplatesSection";
import { ROISection } from "@/components/sections/ROISection";
import { WhoItsForSection } from "@/components/sections/WhoItsForSection";
import { CTASection } from "@/components/sections/CTASection";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WelcomeSplash } from "@/components/ui/WelcomeSplash";
import { LandingRoot } from "@/components/layout/LandingRoot";

export default function Home() {
  return (
    <LandingRoot>
      <WelcomeSplash />
      <Navbar />
      <main>
        <HeroSection />
        <MissionSection />
        <LogoBar />
        <ClientLogos />
        <ComparisonSection />
        <FeaturesSection />
        <VibeSection />
        <TemplatesSection />
        <ROISection />
        <WhoItsForSection />
        <CTASection />
      </main>
      <Footer />
    </LandingRoot>
  );
}
