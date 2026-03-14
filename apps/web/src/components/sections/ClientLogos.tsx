import { LogoCarousel } from "@/components/ui/LogoCarousel";

export function ClientLogos() {
  return (
    <section className="border-t border-neutral-100 py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="mb-6 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 sm:mb-8 sm:text-[11px] sm:tracking-[0.18em]">
          Developed in conversation with teams from
        </p>
        <LogoCarousel />
      </div>
    </section>
  );
}
