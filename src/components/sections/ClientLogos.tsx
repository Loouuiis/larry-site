import { LogoCarousel } from "@/components/ui/LogoCarousel";

export function ClientLogos() {
  return (
    <section className="border-t border-neutral-100 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="mb-8 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
          Developed in conversation with teams from
        </p>
        <LogoCarousel />
      </div>
    </section>
  );
}
