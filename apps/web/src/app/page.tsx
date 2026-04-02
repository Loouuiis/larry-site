import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { WelcomeSplash } from "@/components/ui/WelcomeSplash";
import { OverlayManager } from "@/components/ui/LiquidOverlay";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/sections/HeroSection";
import { LogoBar } from "@/components/sections/LogoBar";
import { ClientLogos } from "@/components/sections/ClientLogos";
import { UseCasesSection } from "@/components/sections/UseCasesSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { VibeSection } from "@/components/sections/VibeSection";
import { TemplatesSection } from "@/components/sections/TemplatesSection";
import { ROISection } from "@/components/sections/ROISection";
import { WhoItsForSection } from "@/components/sections/WhoItsForSection";
import { CTASection } from "@/components/sections/CTASection";

export default function Home() {
  return (
    <div className="landing-page">
      <OverlayManager />
      <WelcomeSplash />
      <LiquidBackground />
      <Navbar />
      <main>
        {/* 1. Hook — who Larry is and why it matters */}
        <HeroSection />

        {/* 2. Credibility — industries and operator backgrounds */}
        <LogoBar />

        {/* 2b. Social proof — client logo carousel */}
        <ClientLogos />

        {/* 3. Problem — the real cost of coordination */}
        <UseCasesSection />

        {/* 4. Solution — introducing Larry */}
        <FeaturesSection />

        {/* 5. Differentiation — vs. PM tools and AI copilots */}
        <VibeSection />

        {/* 6. Trust — every action is explainable and reversible */}
        <TemplatesSection />

        {/* 7. ROI — measurable outcomes from week one */}
        <ROISection />

        {/* 8. Audience — who this is built for */}
        <WhoItsForSection />

        {/* 9. Final CTA — stop managing work, start delivering */}
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
