"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { LarrySeal } from "@/components/ui/LarrySeal";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function CareersPage() {
  return (
    <>
      <LiquidBackground />
      <Navbar />
      <main className="relative pt-24">
        {/* Top band */}
        <section className="relative w-full overflow-hidden bg-[var(--text-1)]" style={{ minHeight: "40vh" }}>
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
            <Image
              src="/Larry_logos.png"
              alt=""
              aria-hidden="true"
              width={400}
              height={400}
              className="object-contain"
              priority
            />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-24 sm:py-32 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              className="font-bold text-white"
              style={{
                fontSize: "clamp(2rem, 5vw, 4rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
                textShadow: "0 2px 20px rgba(0,0,0,0.4)",
              }}
            >
              Build the next era of project execution.
            </motion.h1>
          </div>
        </section>

        {/* Body */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <p className="text-base sm:text-lg text-[var(--text-2)] leading-[1.7] max-w-2xl">
                We don&rsquo;t hire for fixed team roles. Instead, we look for exceptional engineers
                and brilliant people with strong skillsets and character. Join the founding team
                and help shape the future of how work gets done.
              </p>
              <div className="mt-12">
                <p className="text-[15px] text-[var(--text-muted)]">
                  Reach out via{" "}
                  <a
                    href="mailto:anna.wigrena@gmail.com"
                    className="text-[#6c44f6] hover:text-[#5b38d4] underline underline-offset-4 font-medium transition-colors"
                  >
                    email
                  </a>
                  .
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
              className="hidden lg:block"
            >
              <LarrySeal size={180} />
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
